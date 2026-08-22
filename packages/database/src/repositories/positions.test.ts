import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import {
  fromIso,
  fromKred,
  netPosition,
  settlementWindow,
  timestamp,
  type Timestamp,
} from "@kreds/domain";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { Positions } from "./positions.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

let db: Database;
let positions: Positions;

const ECONOMY = "20000000-0000-0000-0000-000000000009";
const ISAAC = "30000000-0000-0000-0000-000000000091";
const JOSE = "30000000-0000-0000-0000-000000000092";
const FACILITY = "30000000-0000-0000-0000-000000000093";

const HOUR = 60 * 60 * 1000;
const NOW = fromIso("2026-08-22T12:00:00Z");
const DAY = settlementWindow(24);
const ago = (hours: number): Timestamp => timestamp(NOW - hours * HOUR);

/**
 * Write one entry directly.
 *
 * The Ledger refuses a transaction that does not sum to zero, which is exactly
 * right for the ledger and wrong for this file: these tests need a position in
 * a specific shape, not a history of how it got there. The opening value is
 * seeded, and the tests say so.
 */
async function record(
  account: string,
  direction: "CREDIT" | "DEBIT" | "MEMO",
  kred: number,
  over: { status?: "PENDING" | "SETTLED"; createdAt?: Timestamp } = {},
): Promise<void> {
  const transactionId = crypto.randomUUID();
  const at = new Date(over.createdAt ?? NOW);
  const status = over.status ?? "SETTLED";
  await db.execute(
    sql`insert into ledger_transactions (id, economy_id, type, idempotency_key, rules_version, created_at)
        values (${transactionId}, ${ECONOMY}, 'TRANSFER', ${crypto.randomUUID()}, 'v0.4', ${at.toISOString()})`,
  );
  await db.execute(
    sql`insert into ledger_entries
          (transaction_id, economy_id, account_id, direction, amount, type, source_type, source_id,
           rules_version, idempotency_key, status, settled_at, created_at)
        values
          (${transactionId}, ${ECONOMY}, ${account}, ${direction}, ${fromKred(kred)}, 'TRANSFER',
           'PULL_REQUEST_MERGED', 'seed', 'v0.4', ${crypto.randomUUID()}, ${status},
           ${status === "SETTLED" ? at.toISOString() : null}, ${at.toISOString()})`,
  );
}

async function owe(kred: number): Promise<void> {
  await db.execute(
    sql`insert into debts (scope, obligor_account_id, lending_account_id, principal, outstanding, rules_version)
        values ('USER', ${ISAAC}, ${FACILITY}, ${fromKred(kred)}, ${fromKred(kred)}, 'v0.4')`,
  );
}

async function claim(kred: number, status = "AWAITING_FUNDING"): Promise<void> {
  await db.execute(
    sql`insert into receivables (claimant_account_id, obligor_account_id, gross_value, settled_value, status, rules_version)
        values (${ISAAC}, ${JOSE}, ${fromKred(kred)}, 0, ${status}, 'v0.4')`,
  );
}

describeWithDatabase("Positions", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 4 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(
      sql`truncate table receivables, debts, ledger_entries, ledger_transactions, accounts, currencies, economies cascade`,
    );
    await db.execute(
      sql`insert into economies (id, type, name) values (${ECONOMY}, 'INDEPENDENT', 'test')`,
    );
    for (const [id, type] of [
      [ISAAC, "ORGANIZATION_POSITION"],
      [JOSE, "GLOBAL_WALLET"],
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

  describe("a position is assembled, never stored", () => {
    it("has no balance, available or withdrawable column anywhere", async () => {
      const columns = await db.execute<{ column_name: string }>(
        sql`select column_name from information_schema.columns
            where table_name in ('accounts', 'debts', 'receivables')`,
      );
      const names = columns.map((c) => c.column_name);
      for (const forbidden of ["balance", "available", "withdrawable", "net_position"]) {
        expect(names, `${forbidden} is a derived figure (Law II)`).not.toContain(forbidden);
      }
    });

    it("reports an untouched account as empty rather than missing", async () => {
      const position = await positions.positionOf({ accountId: ISAAC, economyId: ECONOMY });
      expect(position.balance).toBe(0n);
      expect(position.withdrawable).toBe(0n);
      expect(position.pendingReceivables).toBe(0n);
    });

    /**
     * 11: Debt, Settlement and Extraction Protection, its worked example, read
     * out of a real database rather than out of a fixture:
     *
     *   Balance 320, Pending 40, Locked 100 -> Available 280, Withdrawable 180
     */
    it("reproduces the worked example from chapter 11 end to end", async () => {
      await record(ISAAC, "CREDIT", 280);
      await record(ISAAC, "CREDIT", 40, { status: "PENDING" });

      const position = await positions.positionOf({
        accountId: ISAAC,
        economyId: ECONOMY,
        locked: fromKred(100),
      });

      expect(position.balance).toBe(fromKred(320));
      expect(position.pendingSettlement).toBe(fromKred(40));
      expect(position.available).toBe(fromKred(280));
      expect(position.withdrawable).toBe(fromKred(180));
      expect(netPosition(position)).toBe(fromKred(320));
    });
  });

  describe("debt and receivables are read, and never summed into the balance", () => {
    /**
     * 19: Invariants: "Debt is what someone owes. Receivables are what someone
     * is owed. Neither is money, and adding either to the equation would
     * double-count the KRED that funds them."
     */
    it("leaves the balance untouched by an obligation", async () => {
      await record(ISAAC, "CREDIT", 25);
      await owe(120);

      const position = await positions.positionOf({ accountId: ISAAC, economyId: ECONOMY });
      expect(position.balance).toBe(fromKred(25));
      expect(position.outstandingDebt).toBe(fromKred(120));
      // A raw bigint, not `fromKred`: `Kredbits` cannot hold a negative and
      // refuses this value. That is the whole reason `NetPosition` is a
      // separate brand. A negative net position is legal; negative money is
      // the bug Amendment A01 closed.
      expect(netPosition(position)).toBe(-9_500n);
    });

    /** 19: "A negative net position has `Withdrawable = 0`". */
    it("withdraws nothing while the position is under water", async () => {
      await record(ISAAC, "CREDIT", 25);
      await owe(120);

      const position = await positions.positionOf({ accountId: ISAAC, economyId: ECONOMY });
      expect(position.withdrawable).toBe(0n);
    });

    it("counts only claims still awaiting funding", async () => {
      await claim(30);
      await claim(50, "SETTLED");
      await claim(10, "CANCELLED");

      const position = await positions.positionOf({ accountId: ISAAC, economyId: ECONOMY });
      expect(position.pendingReceivables).toBe(fromKred(30));
      expect(position.balance).toBe(0n);
    });
  });

  describe("the database refuses a liability that makes no sense", () => {
    /**
     * Constraints rather than conventions. A claim settled beyond its value
     * would leave a negative amount outstanding, and a negative claim is one
     * that owes its holder money.
     */
    it("refuses a receivable settled for more than it is worth", async () => {
      await expect(
        db.execute(
          sql`insert into receivables (claimant_account_id, obligor_account_id, gross_value, settled_value, rules_version)
              values (${ISAAC}, ${JOSE}, 100, 500, 'v0.4')`,
        ),
      ).rejects.toThrow(/receivables_settled_within_gross/);
    });

    /** Law XXXIV forbids the two-account version of this. This is the no-account version. */
    it("refuses a claim against oneself", async () => {
      await expect(
        db.execute(
          sql`insert into receivables (claimant_account_id, obligor_account_id, gross_value, settled_value, rules_version)
              values (${ISAAC}, ${ISAAC}, 100, 0, 'v0.4')`,
        ),
      ).rejects.toThrow(/receivables_claimant_is_not_obligor/);
    });

    it("refuses a debt that owes more than was ever financed", async () => {
      await expect(
        db.execute(
          sql`insert into debts (scope, obligor_account_id, lending_account_id, principal, outstanding, rules_version)
              values ('USER', ${ISAAC}, ${FACILITY}, 100, 500, 'v0.4')`,
        ),
      ).rejects.toThrow(/debts_outstanding_within_principal/);
    });
  });

  describe("settlement releases value that has served its window", () => {
    /**
     * The mechanism Law VII rests on. 11: the window "is fatal to an attack
     * whose entire economics depend on extracting value before the liability
     * lands."
     */
    it("holds fresh value inside the window, withdrawable by nobody", async () => {
      await record(ISAAC, "CREDIT", 150, { status: "PENDING", createdAt: ago(2) });

      expect(await positions.settleDue(DAY, NOW)).toBe(0);
      const position = await positions.positionOf({ accountId: ISAAC, economyId: ECONOMY });
      expect(position.balance).toBe(fromKred(150));
      expect(position.available).toBe(0n);
      expect(position.withdrawable).toBe(0n);
    });

    it("releases it once the window has run", async () => {
      await record(ISAAC, "CREDIT", 150, { status: "PENDING", createdAt: ago(25) });

      expect(await positions.settleDue(DAY, NOW)).toBe(1);
      const position = await positions.positionOf({ accountId: ISAAC, economyId: ECONOMY });
      expect(position.available).toBe(fromKred(150));
      expect(position.withdrawable).toBe(fromKred(150));
    });

    it("releases what is due and holds back what is not, in the same sweep", async () => {
      await record(ISAAC, "CREDIT", 100, { status: "PENDING", createdAt: ago(30) });
      await record(ISAAC, "CREDIT", 40, { status: "PENDING", createdAt: ago(1) });

      expect(await positions.settleDue(DAY, NOW)).toBe(1);
      const position = await positions.positionOf({ accountId: ISAAC, economyId: ECONOMY });
      expect(position.balance).toBe(fromKred(140));
      expect(position.available).toBe(fromKred(100));
    });

    /**
     * 06: Ledger does not permit history to be repaired in place, and
     * `settledAt` is history the moment it is written. A second sweep must find
     * nothing rather than re-stamp.
     */
    it("is idempotent, so a second sweep moves nothing", async () => {
      await record(ISAAC, "CREDIT", 150, { status: "PENDING", createdAt: ago(25) });

      expect(await positions.settleDue(DAY, NOW)).toBe(1);
      const [first] = await db.execute<{ settled_at: Date }>(
        sql`select settled_at from ledger_entries limit 1`,
      );

      expect(await positions.settleDue(DAY, timestamp(NOW + 5 * HOUR))).toBe(0);
      const [second] = await db.execute<{ settled_at: Date }>(
        sql`select settled_at from ledger_entries limit 1`,
      );
      expect(second?.settled_at).toEqual(first?.settled_at);
    });

    /**
     * Two sweeps racing must settle each entry exactly once. Without the
     * `status = 'PENDING'` guard on the UPDATE, both would claim the same rows
     * and both would report having settled them.
     */
    it("settles each entry once even when two sweeps race", async () => {
      for (let i = 0; i < 20; i++) {
        await record(ISAAC, "CREDIT", 10, { status: "PENDING", createdAt: ago(25) });
      }

      const [a, b] = await Promise.all([
        positions.settleDue(DAY, NOW),
        positions.settleDue(DAY, NOW),
      ]);

      expect(a + b).toBe(20);
    });

    /**
     * The window is written twice, as an indexed SQL cutoff and as the domain's
     * `due`. They are the same inequality, and this is the one input that can
     * tell them apart: an entry created exactly one window ago has served the
     * full window, so `<=` on the cutoff and `>=` on the due time must both
     * include it. If they ever disagree, the effective window silently becomes
     * "24 hours plus a bit" and no other test notices.
     */
    it("settles an entry created exactly one window ago, to the millisecond", async () => {
      await record(ISAAC, "CREDIT", 60, { status: "PENDING", createdAt: ago(24) });

      expect(await positions.settleDue(DAY, NOW)).toBe(1);
    });

    it("holds one created a millisecond later", async () => {
      await record(ISAAC, "CREDIT", 60, {
        status: "PENDING",
        createdAt: timestamp(NOW - 24 * HOUR + 1),
      });

      expect(await positions.settleDue(DAY, NOW)).toBe(0);
    });

    it("reports how much value is still inside the window", async () => {
      await record(ISAAC, "CREDIT", 100, { status: "PENDING", createdAt: ago(1) });
      await record(JOSE, "CREDIT", 40, { status: "PENDING", createdAt: ago(1) });
      await record(ISAAC, "CREDIT", 999);

      expect(await positions.pendingTotal(ECONOMY)).toBe(fromKred(140));
    });
  });
});
