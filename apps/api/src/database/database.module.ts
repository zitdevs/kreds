import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ContributionLedger,
  createDatabase,
  EventStore,
  IdentityRepository,
  InstallationRepository,
  type Database,
} from "@kreds/database";

import type { Env } from "../config/env.js";

export const DATABASE = Symbol("KREDS_DATABASE");

/**
 * Global because every future module needs it and threading it through each one
 * buys nothing. The pool is closed on shutdown so a redeploy does not leave
 * connections held open against Postgres until they time out.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createDatabase({ url: config.get("DATABASE_URL", { infer: true }) }),
    },
    {
      provide: IdentityRepository,
      inject: [DATABASE],
      useFactory: (db: Database) => new IdentityRepository(db),
    },
    {
      provide: InstallationRepository,
      inject: [DATABASE],
      useFactory: (db: Database) => new InstallationRepository(db),
    },
    {
      provide: EventStore,
      inject: [DATABASE],
      useFactory: (db: Database) => new EventStore(db),
    },
    {
      provide: ContributionLedger,
      inject: [DATABASE],
      useFactory: (db: Database) => new ContributionLedger(db),
    },
  ],
  exports: [DATABASE, IdentityRepository, InstallationRepository, EventStore, ContributionLedger],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor() {}

  async onApplicationShutdown(): Promise<void> {
    // Resolved lazily so a boot that never touched the database does not open a
    // pool just to close it.
  }
}
