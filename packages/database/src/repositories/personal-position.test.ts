import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import { fromIso, fromKred, netPosition, settlementWindow, timestamp } from "@kreds/domain";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { Positions } from "./positions.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

const ECONOMY = "20000000-0000-0000-0000-00000000a041";
const NEWCOMER = "30000000-0000-0000-0000-0000000a0411";
const IN_ORG = "30000000-0000-0000-0000-0000000a0412";
const FACILITY = "30000000-0000-0000-0000-0000000a0413";

const HOUR = 60 * 60 * 1000;
const NOW = fromIso("2026-08-22T12:00:00Z");
const DAY = settlementWindow(24);
const ago = (hours: number) => timestamp(NOW - hours * HOUR);

let db: Database;
let positions: Positions;

async function record(
  account: string,
  kred: number,
  over: { status?: "PENDING" | "SETTLED"; createdAt?: number } = {},
): Promise<void> {
  const transactionId = crypto.randomUUID();
  const at = new Date(over.createdAt ?? NOW);
  const status = over.status ?? "SETTLED";
  await db.execute(
    sql`insert into ledger_transactions (id, economy_id, type, idempotency_key, rules_version, created_at)
        values (${transactionId}, ${ECONOMY}, 'DISTRIBUTION', ${crypto.randomUUID()}, 'v0.5', ${at.toISOString()})`,
  );
  await db.execute(
    sql`insert into ledger_entries
          (transaction_id, economy_id, account_id, direction, amount, type, source_type, source_id,
           rules_version, idempotency_key, status, settled_at, created_at)
        values
          (${transactionId}, ${ECONOMY}, ${account}, 'CREDIT', ${fromKred(kred)}, 'DISTRIBUTION',
           'PULL_REQUEST_MERGED', 'seed', 'v0.5', ${crypto.randomUUID()}, ${status},
           ${status === "SETTLED" ? at.toISOString() : null}, ${at.toISOString()})`,
  );
}

describeWithDatabase("a personal position, A04", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 4 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(
      sql`truncate table receivables, debts, ledger_entries, ledger_transactions, accounts, currencies, economies cascade`,
    );
    await db.execute(
      sql`insert into economies (id, type, name) values (${ECONOMY}, 'KREDS_NETWORK', 'official')`,
    );
    for (const [id, type] of [
      [NEWCOMER, "PERSONAL_POSITION"],
      [IN_ORG, "ORGANIZATION_POSITION"],
      [FACILITY, "CENTRAL_BANK_RESERVE"],
    ] as const) {
      await db.execute(
        sql`insert into accounts (id, economy_id, type) values (${id}, ${ECONOMY}, ${type})`,
      );
    }
    positions = new Positions(db);
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  /**
   * 26: "This is not a lighter tier. It is the same accounting with a different
   * boundary, because Law VII does not care whether an organization happens to
   * be involved."
   *
   * The strongest form of that claim is that the same inputs produce the same
   * position on both sides, so it is checked that way rather than asserted.
   */
  it("behaves identically to an organization position, field for field", async () => {
    for (const account of [NEWCOMER, IN_ORG]) {
      await record(account, 280);
      await record(account, 40, { status: "PENDING" });
    }

    const personal = await positions.positionOf({
      accountId: NEWCOMER,
      economyId: ECONOMY,
      locked: fromKred(100),
    });
    const organization = await positions.positionOf({
      accountId: IN_ORG,
      economyId: ECONOMY,
      locked: fromKred(100),
    });

    expect(personal).toEqual(organization);
    expect(personal.balance).toBe(fromKred(320));
    expect(personal.available).toBe(fromKred(280));
    expect(personal.withdrawable).toBe(fromKred(180));
  });

  /** Same window. A personal position does not settle faster for being personal. */
  it("holds value inside the window and releases it on the same schedule", async () => {
    await record(NEWCOMER, 150, { status: "PENDING", createdAt: ago(2) });
    expect(await positions.settleDue(DAY, NOW)).toBe(0);
    expect(
      (await positions.positionOf({ accountId: NEWCOMER, economyId: ECONOMY })).withdrawable,
    ).toBe(0n);

    await db.execute(
      sql`update ledger_entries set created_at = ${new Date(ago(25)).toISOString()}`,
    );
    expect(await positions.settleDue(DAY, NOW)).toBe(1);
    expect(
      (await positions.positionOf({ accountId: NEWCOMER, economyId: ECONOMY })).withdrawable,
    ).toBe(fromKred(150));
  });

  /**
   * Law VIII and 19's "A negative net position has `Withdrawable = 0`", which
   * 26 says applies here unchanged: "same debt-first ordering, same extraction
   * protections."
   */
  it("stops extraction from an underwater personal position, exactly as elsewhere", async () => {
    await record(NEWCOMER, 25);
    await db.execute(
      sql`insert into debts (scope, obligor_account_id, lending_account_id, principal, outstanding, rules_version)
          values ('USER', ${NEWCOMER}, ${FACILITY}, ${fromKred(120)}, ${fromKred(120)}, 'v0.5')`,
    );

    const position = await positions.positionOf({ accountId: NEWCOMER, economyId: ECONOMY });
    expect(netPosition(position)).toBe(-9_500n);
    expect(position.withdrawable).toBe(0n);
  });

  /**
   * Law IV as amended: value "never lands directly in a global wallet". The
   * account type exists in the database, so this checks the shape of the enum
   * rather than trusting the code that writes to it.
   */
  it("has a personal position account type alongside the organization one", async () => {
    const values = await db.execute<{ v: string }>(
      sql`select unnest(enum_range(null::account_type))::text as v`,
    );
    const names = values.map((row) => row.v);
    expect(names).toContain("PERSONAL_POSITION");
    expect(names).toContain("ORGANIZATION_POSITION");
    expect(names).toContain("GLOBAL_WALLET");
  });
});
