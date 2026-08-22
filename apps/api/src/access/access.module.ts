import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Authorizations, TokenCipher, type RateBudget } from "@kreds/database";

import { DATABASE } from "../database/database.module.js";
import { GitHubModule } from "../github/github.module.js";
import { RATE_BUDGET, TOKEN_CIPHER } from "./access.tokens.js";
import { AuthorizationController } from "./authorization.controller.js";
import { DelegatedQueryService } from "./delegated-query.service.js";

/**
 * Delegated access: the second lawful ingestion channel, and the user's control
 * over it.
 *
 * Notice what this module does not provide. There is no service that accepts an
 * event, a claim, or a computed value from anywhere but GitHub, because
 * Law XXXV leaves nowhere for one to sit.
 */
@Module({
  // `GitHubModule` because the delegated-query path feeds the same
  // `IngestionService` the webhook uses, which is what keeps the two channels
  // from building two different idempotency keys for one merge. `DATABASE`
  // needs no import here: `DatabaseModule` is `@Global`.
  imports: [GitHubModule],
  controllers: [AuthorizationController],
  providers: [
    {
      provide: TOKEN_CIPHER,
      inject: [ConfigService],
      /**
       * `null` when no key is configured, rather than a generated one.
       *
       * A key this process invented would change on restart and silently orphan
       * every stored authorization. An instance with no key simply has no
       * delegated-query path: webhooks keep working and no token is stored.
       */
      useFactory: (config: ConfigService) => {
        const key = config.get<string>("TOKEN_ENCRYPTION_KEY");
        return key ? new TokenCipher(key) : null;
      },
    },
    {
      provide: RATE_BUDGET,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RateBudget => ({
        requestsPerWindow: config.get<number>("DELEGATED_QUERY_REQUESTS_PER_WINDOW") ?? 60,
        windowMs: config.get<number>("DELEGATED_QUERY_WINDOW_MS") ?? 900_000,
      }),
    },
    {
      provide: Authorizations,
      inject: [DATABASE, TOKEN_CIPHER],
      useFactory: (db: never, cipher: TokenCipher | null) =>
        cipher ? new Authorizations(db, cipher) : null,
    },
    DelegatedQueryService,
  ],
  exports: [Authorizations, DelegatedQueryService],
})
export class AccessModule {}

export { RATE_BUDGET, TOKEN_CIPHER };
