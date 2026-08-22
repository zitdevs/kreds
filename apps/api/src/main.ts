import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { runMigrations } from "@kreds/database";

import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  // The self-hosting guide promises migrations run on boot, so they do. An
  // advisory lock inside makes it safe when several replicas start at once.
  // Failing here is correct: an instance with a stale schema should refuse to
  // serve rather than fail one request at a time.
  await runMigrations(config.get("DATABASE_URL", { infer: true }));

  app.use(cookieParser());
  // No global ValidationPipe: it wants class-validator, and this codebase
  // already validates with zod at the edges that matter, the environment and
  // every GitHub response. Two validation libraries for one job is one too many.
  // Closes the database pool on SIGTERM rather than leaving connections held
  // open against Postgres until they time out.
  app.enableShutdownHooks();

  // The product is a different origin, so the session cookie only travels if
  // credentials are allowed and the origin is named exactly. A wildcard is not
  // permitted alongside credentials, and that restriction is the useful part.
  // Only the product is listed: the marketing and documentation sites never
  // read a session, so granting them one would widen the surface for nothing.
  app.enableCors({ origin: config.get("KREDS_APP_URL", { infer: true }), credentials: true });

  const port = config.get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  new Logger("bootstrap").log(`Kreds API listening on ${port}`);
}

void bootstrap();
