import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { join } from "node:path";

/**
 * An arbitrary but fixed key. Any two processes using the same number serialise
 * against each other, which is the whole point.
 */
const MIGRATION_LOCK = 42420001;

/**
 * Apply any pending migrations.
 *
 * The self-hosting guide promises migrations run on boot, so something has to
 * keep that promise. Doing it here rather than in a separate command means a
 * self-hoster who follows the guide gets a working instance from
 * `docker compose up`, which is the point of the guide.
 *
 * This opens its own single connection rather than borrowing the application
 * pool, for a reason worth stating because the first attempt got it wrong: a
 * `pg_advisory_lock` is scoped to a session, so taking it on one connection and
 * running the migration on another protects nothing. Worse, holding a
 * transaction open on one connection while the migrator asks the pool for a
 * second one deadlocks outright when the pool is small.
 *
 * One connection, lock and migrate on it, then close. Several replicas booting
 * at once queue instead of racing, and two processes applying the same
 * migration concurrently is how a deploy corrupts a schema.
 *
 * @param folder overrides where the SQL lives. The default is resolved from
 * this file, which works for the compiled CommonJS build the API loads. Tests
 * pass it explicitly because they run through a different module system.
 */
export async function runMigrations(url: string, folder?: string): Promise<void> {
  const connection = postgres(url, { max: 1, prepare: false });
  try {
    await connection`select pg_advisory_lock(${MIGRATION_LOCK})`;
    try {
      await migrate(drizzle(connection), {
        migrationsFolder: folder ?? join(__dirname, "..", "migrations"),
      });
    } finally {
      await connection`select pg_advisory_unlock(${MIGRATION_LOCK})`;
    }
  } finally {
    await connection.end({ timeout: 5 });
  }
}
