import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  ALL_OBSERVABLE,
  derivePosition,
  due,
  entry as validateEntry,
  fromDate,
  ZERO_KREDBITS,
  type EconomicPosition,
  type Kredbits,
  type LedgerEntry,
  type ObservabilityLookup,
  type SettlementWindow,
  type Timestamp,
} from "@kreds/domain";

import type { Database } from "../client.js";
import { debts, ledgerEntries, receivables } from "../schema/index.js";

/**
 * Reading a position, and moving value out of the settlement window.
 *
 * Everything here is either a read or a status change. There is no method that
 * writes a balance, an available figure or a withdrawable figure, because
 * Law II, Auditable Movement, does not permit one to exist:
 *
 * > "balances are *derived*, never stored-and-mutated. `user.balance += 30` is
 * > a bug, not an optimisation."
 *
 * The one write is settlement, and what it changes is a *status*, not an
 * amount. No kredbit moves when an entry settles; what changes is whether the
 * value it already recorded has served the window that Law VII depends on.
 */

export interface PositionQuery {
  readonly accountId: string;
  readonly economyId: string;
  /**
   * Funds reserved against liabilities, reversals, risk or pending events.
   *
   * An argument rather than a query. What to lock is a Risk Engine decision and
   * this package does not make those; inventing a number here would be this
   * layer deciding an economic question it has no evidence for.
   */
  readonly locked?: Kredbits;
}

/** How many entries a single settlement sweep will claim. */
const SWEEP_LIMIT = 500;

export class Positions {
  constructor(private readonly db: Database) {}

  /**
   * Assemble a position from the ledger, the obligations and the claims.
   *
   * The three reads are separate on purpose. Debt and receivables are not in
   * the ledger and must never be joined into a balance: 19: Invariants keeps
   * them out of the supply equation entirely, because "adding either to the
   * equation would double-count the KRED that funds them".
   */
  async positionOf(query: PositionQuery): Promise<EconomicPosition> {
    const { accountId, economyId, locked = ZERO_KREDBITS } = query;

    const [entryRows, debtRows, claimRows] = await Promise.all([
      this.db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, accountId), eq(ledgerEntries.economyId, economyId))),
      this.db.select().from(debts).where(eq(debts.obligorAccountId, accountId)),
      this.db
        .select()
        .from(receivables)
        .where(
          and(
            eq(receivables.claimantAccountId, accountId),
            inArray(receivables.status, ["AWAITING_FUNDING", "PARTIALLY_SETTLED"]),
          ),
        ),
    ]);

    return derivePosition({
      accountId: accountId as never,
      economyId: economyId as never,
      entries: entryRows.map(toEntry),
      debts: debtRows.map((row) => ({
        id: row.id as never,
        scope: row.scope,
        obligorAccountId: row.obligorAccountId as never,
        lendingAccountId: row.lendingAccountId as never,
        principal: row.principal as Kredbits,
        outstanding: row.outstanding as Kredbits,
        rulesVersion: row.rulesVersion as never,
        createdAt: fromDate(row.createdAt),
      })),
      receivables: claimRows.map((row) => ({
        id: row.id as never,
        claimantAccountId: row.claimantAccountId as never,
        obligorAccountId: row.obligorAccountId as never,
        grossValue: row.grossValue as Kredbits,
        settledValue: row.settledValue as Kredbits,
        status: row.status,
        rulesVersion: row.rulesVersion as never,
        createdAt: fromDate(row.createdAt),
      })),
      locked,
    });
  }

  /**
   * Move entries that have served the window from `PENDING` to `SETTLED`.
   *
   * 11: Debt, Settlement and Extraction Protection lists what the delay is for,
   * ending with "GitHub event correction", and then states the point of it:
   * the window "is fatal to an attack whose entire economics depend on
   * extracting value before the liability lands."
   *
   * The window arrives as an argument. This layer does not decide how long
   * value waits, and a default here would be this file inventing a number that
   * belongs to policy.
   *
   * A04 added a third condition, and it is not expressible in SQL at all:
   * pending value only settles while its evidentiary context is still
   * observable. 26: "Going dark is legitimate; settling in the dark is not."
   * The lookup arrives as an argument because whether a context is observable
   * is a question about authorizations and provider access, not about the
   * ledger, and this repository does not know the answer.
   *
   * The window is expressed twice, once as an indexed SQL cutoff and once as
   * the domain's `due`, and they are the same inequality. That is deliberate
   * redundancy rather than a division of labour, and worth being plain about:
   * breaking either one alone changes nothing observable, because the other
   * still holds. What it buys is that the rule is reachable by a unit test
   * without a database, and that the two forms are checked against each other
   * at the boundary, which is the only place an off-by-one between `<=` on a
   * cutoff and `>=` on a due time could hide.
   *
   * @returns how many entries settled.
   */
  async settleDue(
    window: SettlementWindow,
    now: Timestamp,
    observability: ObservabilityLookup = ALL_OBSERVABLE,
  ): Promise<number> {
    const cutoff = new Date(now - window.milliseconds);

    const candidates = await this.db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.status, "PENDING"), lte(ledgerEntries.createdAt, cutoff)))
      .orderBy(ledgerEntries.createdAt)
      .limit(SWEEP_LIMIT);

    const ready = due(candidates.map(toEntry), window, now, observability);
    if (ready.length === 0) return 0;

    const settledAt = new Date(now);
    const result = await this.db
      .update(ledgerEntries)
      .set({ status: "SETTLED", settledAt })
      .where(
        and(
          inArray(
            ledgerEntries.id,
            ready.map((line) => line.id as string),
          ),
          // Only from PENDING, so a concurrent sweep cannot re-stamp an entry
          // another one already settled. 06: Ledger does not permit history to
          // be repaired in place, and `settledAt` is history the moment it is
          // written.
          eq(ledgerEntries.status, "PENDING"),
          isNull(ledgerEntries.settledAt),
        ),
      )
      .returning({ id: ledgerEntries.id });

    return result.length;
  }

  /**
   * How much value is still inside the window, across an economy.
   *
   * A liquidity figure for operators, not a per-user one. It answers "how much
   * of what this economy has recorded is not yet extractable", which is the
   * number that says whether a settlement backlog is building up.
   */
  async pendingTotal(economyId: string): Promise<bigint> {
    const [row] = await this.db
      .select({
        credited: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amount} else 0 end), 0)::text`,
        debited: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amount} else 0 end), 0)::text`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.economyId, economyId), eq(ledgerEntries.status, "PENDING")));

    // Read back as text and widened here. A SUM over bigint that arrived as a
    // JavaScript number is the floating point error 06 forbids, entering
    // through the one place nobody looks.
    const net = BigInt(row?.credited ?? "0") - BigInt(row?.debited ?? "0");
    return net > 0n ? net : 0n;
  }
}

type EntryRow = typeof ledgerEntries.$inferSelect;

/** A database row as the domain's entry, validated on the way through. */
function toEntry(row: EntryRow): LedgerEntry {
  return validateEntry({
    id: row.id as never,
    economyId: row.economyId as never,
    organizationId: row.organizationId as never,
    accountId: row.accountId as never,
    direction: row.direction,
    amount: row.amount as Kredbits,
    type: row.type,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    counterpartyAccountId: row.counterpartyAccountId as never,
    rulesVersion: row.rulesVersion as never,
    idempotencyKey: row.idempotencyKey as never,
    status: row.status,
    settledAt: row.settledAt ? fromDate(row.settledAt) : null,
    createdAt: fromDate(row.createdAt),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  });
}
