import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export type Database = ReturnType<typeof createDatabase>;

export interface DatabaseOptions {
  readonly url: string;
  /**
   * Connection ceiling. Postgres charges real memory per backend, so a pool
   * larger than the database can serve turns a traffic spike into connection
   * exhaustion rather than queueing.
   */
  readonly max?: number;
}

/**
 * Open a connection pool.
 *
 * Drizzle rather than Prisma, for two reasons that matter here. It needs no
 * code generation step, so the schema is plain TypeScript that the rest of the
 * workspace can import directly. And it leaves column types under our control,
 * which the ledger will need: amounts are integer subunits and must map to an
 * exact integer column, never a float and never a generated class that decides
 * for us.
 */
export function createDatabase({ url, max = 10 }: DatabaseOptions) {
  const sql = postgres(url, { max, prepare: false });
  return drizzle(sql, { schema });
}

/**
 * Whether the database answers.
 *
 * Lives here so callers never need to import drizzle to ask. A health endpoint
 * reaching for `sql` would drag the query builder into every app that only
 * wants to know if Postgres is up.
 */
export async function ping(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
