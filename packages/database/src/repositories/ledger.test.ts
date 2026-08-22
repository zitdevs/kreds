import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import {
  accountId as toAccountId,
  economyId as toEconomyId,
  fromIso,
  idempotencyKey as toKey,
  kredbits,
  ledgerEntryId as toEntryId,
  rulesVersion as toRulesVersion,
  transactionId as toTransactionId,
  type LedgerEntry,
  type Transaction,
} from "@kreds/domain";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { InsufficientBalanceError, Ledger } from "./ledger.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

let db: Database;
let ledger: Ledger;

const ECONOMY = "20000000-0000-0000-0000-000000000001";
const RESERVE = "30000000-0000-0000-0000-000000000001";
const ISAAC = "30000000-0000-0000-0000-000000000002";
const JOSE = "30000000-0000-0000-0000-000000000003";

function entryOf(over: Partial<LedgerEntry> & Pick<LedgerEntry, "accountId" | "direction">) {
  return {
    id: toEntryId(crypto.randomUUID()),
    economyId: toEconomyId(ECONOMY),
    organizationId: null,
    amount: kredbits(0n),
    type: "TRANSFER" as const,
    sourceType: "PULL_REQUEST_MERGED" as const,
    sourceId: "PULL_REQUEST_MERGED:77001:412",
    counterpartyAccountId: null,
    rulesVersion: toRulesVersion("v0.4"),
    idempotencyKey: toKey("entry"),
    status: "SETTLED" as const,
    settledAt: fromIso("2026-08-22T10:00:00Z"),
    createdAt: fromIso("2026-08-22T10:00:00Z"),
    metadata: {},
    ...over,
  } as LedgerEntry;
}

/** A two-sided movement: `from` is debited, `to` is credited. */
function movement(
  key: string,
  from: string,
  to: string,
  amount: bigint,
  over: Partial<Transaction> = {},
): Transaction {
  // The domain requires an entry to carry its transaction's type, so a
  // distribution cannot contain an entry that reads as a transfer.
  const type = (over.type ?? "TRANSFER") as Transaction["type"];
  return {
    id: toTransactionId(crypto.randomUUID()),
    type,
    economyId: toEconomyId(ECONOMY),
    rulesVersion: toRulesVersion("v0.4"),
    idempotencyKey: toKey(key),
    createdAt: fromIso("2026-08-22T10:00:00Z"),
    entries: [
      entryOf({
        accountId: toAccountId(from),
        direction: "DEBIT",
        amount: kredbits(amount),
        counterpartyAccountId: toAccountId(to),
        // The domain requires every entry to carry its transaction's key, so
        // one half of a movement cannot be deduplicated apart from the other.
        idempotencyKey: toKey(key),
        type,
      }),
      entryOf({
        accountId: toAccountId(to),
        direction: "CREDIT",
        amount: kredbits(amount),
        counterpartyAccountId: toAccountId(from),
        idempotencyKey: toKey(key),
        type,
      }),
    ],
    ...over,
  } as Transaction;
}

describeWithDatabase("Ledger", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 4 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(
      sql`truncate table ledger_entries, ledger_transactions, accounts, currencies, economies cascade`,
    );
    await db.execute(
      sql`insert into economies (id, type, name) values (${ECONOMY}, 'INDEPENDENT', 'test')`,
    );
    for (const [id, type] of [
      [RESERVE, "CENTRAL_BANK_RESERVE"],
      [ISAAC, "GLOBAL_WALLET"],
      [JOSE, "GLOBAL_WALLET"],
    ] as const) {
      await db.execute(
        sql`insert into accounts (id, economy_id, type) values (${id}, ${ECONOMY}, ${type})`,
      );
    }
    ledger = new Ledger(db);
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  describe("balances are derived", () => {
    /**
     * The single most consequential decision in the system, checked directly.
     * There is no balance column, so there is nothing to read but the entries.
     */
    it("has no balance column to read", async () => {
      const columns = await db.execute<{ column_name: string }>(
        sql`select column_name from information_schema.columns where table_name = 'accounts'`,
      );
      expect(columns.map((c) => c.column_name)).not.toContain("balance");
    });

    it("derives a balance from the entries that produced it", async () => {
      await seed(3_500n);
      expect(await ledger.balanceOf(ISAAC)).toBe(3_500n);
      expect(await ledger.balanceOf(RESERVE)).toBe(10_000n - 3_500n);
    });

    it("reports zero for an account nothing has touched", async () => {
      expect(await ledger.balanceOf(JOSE)).toBe(0n);
    });
  });

  describe("every movement balances", () => {
    it("posts a two-sided transfer", async () => {
      await seed(1_000n);
      const posted = await ledger.post(movement("t-1", ISAAC, JOSE, 400n));

      expect(posted.isNew).toBe(true);
      expect(await ledger.balanceOf(ISAAC)).toBe(600n);
      expect(await ledger.balanceOf(JOSE)).toBe(400n);
    });

    it("refuses entries that do not sum to zero, before touching the database", async () => {
      const lopsided = movement("t-bad", ISAAC, JOSE, 100n);
      const broken = {
        ...lopsided,
        entries: [
          lopsided.entries[0],
          entryOf({
            accountId: toAccountId(JOSE),
            direction: "CREDIT",
            amount: kredbits(999n),
          }),
        ],
      } as Transaction;

      await expect(ledger.post(broken)).rejects.toThrow();
      const [count] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from ledger_transactions where idempotency_key = 't-bad'`,
      );
      expect(count?.count).toBe("0");
    });

    it("keeps the entries of a transaction retrievable, so it can be audited", async () => {
      await seed(1_000n);
      const posted = await ledger.post(movement("t-2", ISAAC, JOSE, 250n));
      const entries = await ledger.entriesOf(posted.id);

      expect(entries).toHaveLength(2);
      const net = entries.reduce(
        (sum, e) => sum + (e.direction === "CREDIT" ? e.amount : -e.amount),
        0n,
      );
      expect(net).toBe(0n);
    });
  });

  describe("Law XXI, no monetary creation through debt", () => {
    /**
     * 06: "an implementation that can produce a negative balance can mint
     * currency." This is the test that says it cannot.
     */
    it("refuses a movement that would overdraw an account", async () => {
      await seed(100n);
      await expect(ledger.post(movement("t-over", ISAAC, JOSE, 500n))).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );
    });

    /** The rollback matters as much as the refusal: a half-written movement is worse. */
    it("writes nothing at all when it refuses", async () => {
      await seed(100n);
      await ledger.post(movement("t-over2", ISAAC, JOSE, 500n)).catch(() => undefined);

      expect(await ledger.balanceOf(ISAAC)).toBe(100n);
      expect(await ledger.balanceOf(JOSE)).toBe(0n);
      const [count] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from ledger_entries where source_id like '%412%' and transaction_id in (select id from ledger_transactions where idempotency_key = 't-over2')`,
      );
      expect(count?.count).toBe("0");
    });

    it("allows a movement that lands exactly on zero", async () => {
      await seed(400n);
      await ledger.post(movement("t-exact", ISAAC, JOSE, 400n));
      expect(await ledger.balanceOf(ISAAC)).toBe(0n);
    });

    /**
     * The concurrency the lock exists for. Two debits that each look affordable
     * alone must not both succeed: that is the path 06 says mints currency.
     */
    it("does not let two concurrent debits together overdraw an account", async () => {
      await seed(500n);

      const results = await Promise.allSettled([
        ledger.post(movement("race-a", ISAAC, JOSE, 400n)),
        ledger.post(movement("race-b", ISAAC, JOSE, 400n)),
      ]);

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      expect(succeeded).toBe(1);
      expect(await ledger.balanceOf(ISAAC)).toBe(100n);
    });
  });

  describe("idempotency", () => {
    /** GitHub delivers at least once, so the same movement arrives more than once. */
    it("posts the same movement once", async () => {
      await seed(1_000n);
      const first = await ledger.post(movement("t-idem", ISAAC, JOSE, 300n));
      const again = await ledger.post(movement("t-idem", ISAAC, JOSE, 300n));

      expect(again.isNew).toBe(false);
      expect(again.id).toBe(first.id);
      expect(await ledger.balanceOf(JOSE)).toBe(300n);
    });

    it("survives ten replays without paying ten times", async () => {
      await seed(1_000n);
      for (let i = 0; i < 10; i++) {
        await ledger.post(movement("t-replay", ISAAC, JOSE, 250n));
      }
      expect(await ledger.balanceOf(JOSE)).toBe(250n);
    });
  });

  describe("what settled and what merely happened", () => {
    /** Law VII: earned is not withdrawable. */
    it("counts a pending entry in the balance but not in what settled", async () => {
      await seed(1_000n);
      await ledger.post(
        movement("t-pending", ISAAC, JOSE, 200n, {
          entries: [
            entryOf({
              accountId: toAccountId(ISAAC),
              direction: "DEBIT",
              amount: kredbits(200n),
              status: "PENDING",
              settledAt: null,
              idempotencyKey: toKey("t-pending"),
            }),
            entryOf({
              accountId: toAccountId(JOSE),
              direction: "CREDIT",
              amount: kredbits(200n),
              status: "PENDING",
              settledAt: null,
              idempotencyKey: toKey("t-pending"),
            }),
          ],
        } as Partial<Transaction>),
      );

      expect(await ledger.balanceOf(JOSE)).toBe(200n);
      expect(await ledger.settledBalanceOf(JOSE)).toBe(0n);
    });
  });

  describe("precision", () => {
    /**
     * 06: "Floating point silently loses value." A value past the safe integer
     * range must round-trip exactly, which it cannot do through a JavaScript
     * number.
     */
    it("round-trips a value no double could hold", async () => {
      const huge = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
      await seedAmount(huge);
      expect(await ledger.balanceOf(ISAAC)).toBe(huge);
    });

    it("never loses a subunit across many small movements", async () => {
      await seed(1_000n);
      for (let i = 0; i < 20; i++) {
        await ledger.post(movement(`t-small-${i}`, ISAAC, JOSE, 7n));
      }
      expect(await ledger.balanceOf(ISAAC)).toBe(1_000n - 140n);
      expect(await ledger.balanceOf(JOSE)).toBe(140n);
      // Conservation: what left one account arrived at the other, exactly.
      expect((await ledger.balanceOf(ISAAC)) + (await ledger.balanceOf(JOSE))).toBe(1_000n);
    });
  });

  describe("history explains the balance", () => {
    /**
     * 06: "If a support ticket asks 'why do I have 1,240 K?', the answer must be
     * reconstructible from entries, not from a support engineer's memory."
     */
    it("reconstructs a balance from nothing but its entries", async () => {
      await seed(1_000n);
      await ledger.post(movement("h-1", ISAAC, JOSE, 300n));
      await ledger.post(movement("h-2", ISAAC, JOSE, 120n));

      const entries = await ledger.entriesFor(ISAAC);
      const reconstructed = entries.reduce(
        (sum, e) => sum + (e.direction === "CREDIT" ? e.amount : -e.amount),
        0n,
      );

      expect(reconstructed).toBe(await ledger.balanceOf(ISAAC));
      expect(reconstructed).toBe(580n);
    });

    /** No update, no delete: history is repaired with new entries, never in place. */
    it("has exactly one way to write, and none to change or remove", () => {
      // The exact surface, rather than a pattern. A regex here first flagged
      // settledBalanceOf, which reads, and a guard that cries wolf is a guard
      // somebody relaxes. Listing what may exist says the same thing and
      // cannot be fooled by a name that merely looks like a verb.
      const surface = Object.getOwnPropertyNames(Ledger.prototype)
        .filter((name) => name !== "constructor" && !name.startsWith("_"))
        .sort();

      expect(surface).toEqual([
        "balanceOf",
        "entriesFor",
        "entriesOf",
        "findByIdempotencyKey",
        "netAmount",
        "post",
        "rawBalance",
        "settledBalanceOf",
      ]);
    });
  });

  /**
   * Give the reserve an opening balance, directly.
   *
   * Not through `post`, and that is the finding rather than a shortcut: a
   * transaction must sum to zero, and creating the money supply is precisely
   * the movement that does not. Genesis belongs to the Central Bank, which is
   * Phase 8. This fixture stands in for it so the ledger's own guarantees can
   * be tested against something that already exists.
   */
  async function openingBalance(amount: bigint): Promise<void> {
    await db.execute(sql`
      insert into ledger_transactions (id, economy_id, type, idempotency_key, rules_version)
      values (gen_random_uuid(), ${ECONOMY}, 'DISTRIBUTION', 'genesis', 'v0.4')
    `);
    await db.execute(sql`
      insert into ledger_entries
        (transaction_id, economy_id, account_id, direction, amount, type,
         source_type, source_id, rules_version, idempotency_key, status, settled_at)
      select id, ${ECONOMY}, ${RESERVE}, 'CREDIT', ${amount.toString()}::bigint, 'DISTRIBUTION',
             'NETWORK_OPERATION', 'genesis', 'v0.4', 'genesis-entry', 'SETTLED', now()
      from ledger_transactions where idempotency_key = 'genesis'
    `);
  }

  /** Open the reserve, then issue from it to Isaac. */
  async function seed(amount: bigint): Promise<void> {
    await openingBalance(10_000n);
    await ledger.post(
      movement("seed-issue", RESERVE, ISAAC, amount, {
        type: "DISTRIBUTION",
      } as Partial<Transaction>),
    );
  }

  /** The same, when the amount is larger than any sensible float. */
  async function seedAmount(amount: bigint): Promise<void> {
    await openingBalance(amount * 2n);
    await ledger.post(
      movement("seed-issue", RESERVE, ISAAC, amount, {
        type: "DISTRIBUTION",
      } as Partial<Transaction>),
    );
  }
});
