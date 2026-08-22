import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import type { Database } from "./client.js";

/**
 * An arbitrary but fixed key. Any two processes using the same number
 * serialise against each other, which is the whole point.
 */
const MIGRATION_LOCK = 4242_0001;

function migrationsFolder(): string {
  // Resolved from this file rather than from the working directory, because the
  // API that calls this runs from its own app directory, not from here.
  // `__dirname` rather than `import.meta.url`: this package emits CommonJS so
  // that NestJS can require it, and `import.meta` is not available there.
  let current = __dirname;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(current, "migrations");
    if (existsSync(candidate)) return candidate;
    current = dirname(current);
  }
  throw new Error("could not locate the migrations folder.");
}

/**
 * Apply any pending migrations.
 *
 * The self-hosting guide promises that migrations run on boot, so something has
 * to keep that promise. Doing it here rather than in a separate command means a
 * self-hoster who follows the guide gets a working instance from
 * `docker compose up`, which is the whole point of the guide.
 *
 * Wrapped in a Postgres advisory lock because more than one replica can boot at
 * once, and two processes running the same migration concurrently is how a
 * deploy corrupts a schema. The lock is released when the transaction ends,
 * including when it ends badly.
 */
export async function runMigrations(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATION_LOCK})`);
    await migrate(db, { migrationsFolder: migrationsFolder() });
  });
}
