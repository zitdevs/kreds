import type {
  AccountId,
  EconomyId,
  IdempotencyKey,
  LedgerEntryId,
  OrganizationId,
  RulesVersion,
  TransactionId,
} from "../primitives/ids.js";
import {
  ZERO_KREDBITS,
  convertsExactly,
  type BackingRatio,
  type Kredbits,
} from "../primitives/money.js";
import type { Timestamp } from "../primitives/time.js";

/**
 * The transaction vocabulary from 06: Ledger, Transaction types.
 *
 * The first twelve are the original set; the final seven were added by
 * Amendment A01 (`v0.2`) when review funding, debt and receivables entered the
 * model. Adding a member here is a monetary policy change, not a refactor.
 */
export const TRANSACTION_TYPES = [
  /** Central Bank to account. Issuance (Law I). */
  "DISTRIBUTION",
  /** Account to account. */
  "TRANSFER",
  /** Account to Central Bank. */
  "FEE",
  /** Return of value under policy. */
  "REFUND",
  /** Undo of an invalid entry. The original is never deleted. */
  "REVERSAL",
  /** User to organization treasury. */
  "TREASURY_CONTRIBUTION",
  /** Organization treasury to user. */
  "TREASURY_DISTRIBUTION",
  /** Permanent removal from supply. */
  "BURN",
  /** Corrective revaluation. */
  "ADJUSTMENT",
  /** Central Bank to organization reserve. */
  "RESERVE_ALLOCATION",
  /** Cross-currency movement. The only type that spans two economies. */
  "EXCHANGE",
  /** Organization position to global wallet. */
  "SETTLEMENT",
  /** Account to Review Fund. */
  "REVIEW_FUND_CONTRIBUTION",
  /** Review Fund to reviewer. */
  "REVIEW_FUND_PAYMENT",
  /** Central Bank reserve to reviewer, creating debt (Law XXIII). */
  "CREDIT_DRAW",
  /** Earnings to lending account, reducing debt (Law VIII). */
  "DEBT_REPAYMENT",
  /** Unfunded claim recorded. Moves no KRED (Law XXIV). */
  "RECEIVABLE_CREATED",
  /** Funding arrived, claim cleared. */
  "RECEIVABLE_SETTLED",
  /** Claim written off. Moves no KRED. */
  "RECEIVABLE_CANCELLED",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * The only two entry types that move no KRED at all.
 *
 * 06: Ledger: "They record a liability appearing and disappearing. Keeping them
 * in the ledger rather than in a side table is deliberate: a claim that is
 * invisible to the ledger is a claim nobody can audit."
 */
export const MOVES_NO_KRED = ["RECEIVABLE_CREATED", "RECEIVABLE_CANCELLED"] as const;
type NonMonetaryType = (typeof MOVES_NO_KRED)[number];

const movesNoKred = (type: TransactionType): type is NonMonetaryType =>
  (MOVES_NO_KRED as readonly string[]).includes(type);

/**
 * Which side of the entry an amount sits on.
 *
 * Amounts are non-negative (Law XXI), so direction carries the sign that a
 * signed integer would otherwise have to. `MEMO` is neither side: it is how the
 * two non-monetary types stay in the ledger without participating in the
 * balance, since they move no KRED to balance.
 *
 * **Implementation choice, not constitutional.** What 06: Ledger fixes is that
 * those two types move nothing and are still ledgered. The `MEMO` name and its
 * exemption from the balance check are this package's way of expressing that.
 */
export type EntryDirection = "DEBIT" | "CREDIT" | "MEMO";

/**
 * What caused this entry.
 *
 * 06: Ledger requires that `sourceType` and `sourceId` "trace every entry back
 * to the GitHub event that caused it", and names the two fields. It does not
 * enumerate the values.
 *
 * **This union is therefore an implementation choice, not a constitutional
 * list.** The GitHub-derived members are the normalised domain events the
 * economy actually prices; the rest are network-originated movements with no
 * single GitHub event behind them.
 *
 * Note what is deliberately absent: issue resolution. 01: Network and Supply
 * lists eight sources of productive issuance and issue resolution is not among
 * them, while 24: Contribution Points awards it points. Resolving an issue is
 * recognised, not minted, so it has no business being a cause of a ledger
 * entry.
 */
export type EntrySourceType =
  | "PULL_REQUEST_MERGED"
  | "PULL_REQUEST_CLOSED"
  | "REVIEW_SUBMITTED"
  | "SETTLEMENT_RUN"
  | "TREASURY_OPERATION"
  | "CREDIT_OPERATION"
  | "NETWORK_OPERATION"
  | "MANUAL_ADJUSTMENT";

/**
 * Lifecycle of an entry.
 *
 * Derived from the fields 06: Ledger names (`status`, `settledAt`) and the
 * Glossary's distinction between Pending, "value earned but still inside the
 * settlement window", and settled value. 06 names a `status` field but
 * enumerates no values, so this union is an implementation choice.
 *
 * There is deliberately no `REVERSED` member. A reversal is a *compensating
 * entry* (06: Ledger, Immutable history), so the original keeps its own status
 * and the pair nets to zero. A status that marked the original as reversed
 * would invite exactly one obvious use, filtering it out of a balance, and that
 * would remove the value twice.
 */
export type EntryStatus = "PENDING" | "SETTLED";

/**
 * The atomic, immutable record of one economic movement.
 *
 * Law II, Auditable Movement: balances are derived, never stored and mutated.
 * `user.balance += 30` is a bug, not an optimisation. This interface is the
 * only thing the economy is allowed to write.
 */
export interface LedgerEntry {
  readonly id: LedgerEntryId;
  /** Distinguishes official KRED from local currencies (Law X). */
  readonly economyId: EconomyId;
  /** Enforces the organization boundary (Law IV). `null` for network-level accounts. */
  readonly organizationId: OrganizationId | null;
  readonly accountId: AccountId;
  readonly direction: EntryDirection;
  /** Always non-negative. Direction carries the sign. */
  readonly amount: Kredbits;
  readonly type: TransactionType;
  readonly sourceType: EntrySourceType;
  readonly sourceId: string;
  /** Makes every transfer two-sided and reconcilable. */
  readonly counterpartyAccountId: AccountId | null;
  /** Makes history immune to policy changes (Law XV). */
  readonly rulesVersion: RulesVersion;
  /** Makes duplicate webhooks harmless (06: Ledger, Idempotency). */
  readonly idempotencyKey: IdempotencyKey;
  readonly status: EntryStatus;
  /** Separates earned from withdrawable (Law VII). */
  readonly settledAt: Timestamp | null;
  readonly createdAt: Timestamp;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** A grouped, balanced set of entries. Nothing reaches the ledger except through one of these. */
export interface Transaction {
  readonly id: TransactionId;
  readonly type: TransactionType;
  readonly economyId: EconomyId;
  readonly rulesVersion: RulesVersion;
  readonly idempotencyKey: IdempotencyKey;
  readonly createdAt: Timestamp;
  readonly entries: readonly LedgerEntry[];
  /**
   * Required for `EXCHANGE`, forbidden on every other type.
   *
   * A cross-currency movement cannot balance one subunit against one subunit,
   * so it needs the rate to be checkable at all. 14: Cloud Economic Modes
   * publishes the rate in exactly this form.
   */
  readonly exchangeRate?: BackingRatio;
  /** Required for `EXCHANGE`: the economy value is leaving. */
  readonly fromEconomyId?: EconomyId;
  /** Required for `EXCHANGE`: the economy value is arriving in. */
  readonly toEconomyId?: EconomyId;
}

/**
 * Build one entry.
 *
 * Freezing is deep enough to matter: `metadata` is frozen too, and timestamps
 * are numbers rather than `Date`s, because freezing an object does not stop
 * `entry.createdAt.setFullYear(1999)` on a `Date` it holds. 06: Ledger requires
 * history to be immutable, and a shallow freeze does not deliver that.
 *
 * @throws if the amount is not a non-negative `bigint`, or is zero. An entry
 * that moves nothing cannot be traced back to a movement, and every entry in
 * this ledger exists to record one.
 */
export function entry(candidate: LedgerEntry): LedgerEntry {
  if (typeof candidate.amount !== "bigint") {
    throw new TypeError(
      `entry ${candidate.id} has a non-bigint amount. Floating point never enters the pipeline (06: Ledger).`,
    );
  }
  if (candidate.amount < 0n) {
    throw new RangeError(
      `entry ${candidate.id} has a negative amount. Direction carries the sign (Law XXI).`,
    );
  }
  if (candidate.amount === ZERO_KREDBITS) {
    throw new RangeError(`entry ${candidate.id} is for zero kredbits, so it records no movement.`);
  }
  return Object.freeze({ ...candidate, metadata: Object.freeze({ ...candidate.metadata }) });
}

function assertExchangeShape(candidate: Transaction): void {
  const { exchangeRate, fromEconomyId, toEconomyId, entries, id } = candidate;
  if (!exchangeRate || !fromEconomyId || !toEconomyId) {
    throw new RangeError(
      `EXCHANGE ${id} needs a rate and both economies: a cross-currency movement is not checkable without them (14: Cloud Economic Modes).`,
    );
  }
  if (fromEconomyId === toEconomyId) {
    throw new RangeError(
      `EXCHANGE ${id} names the same economy on both sides, so nothing is being exchanged.`,
    );
  }

  const leaving = entries.filter((line) => line.economyId === fromEconomyId);
  const arriving = entries.filter((line) => line.economyId === toEconomyId);
  if (leaving.length + arriving.length !== entries.length) {
    throw new RangeError(`EXCHANGE ${id} carries an entry in a third economy.`);
  }

  const debited = leaving
    .filter((line) => line.direction === "DEBIT")
    .reduce((total, line) => total + line.amount, 0n);
  const credited = arriving
    .filter((line) => line.direction === "CREDIT")
    .reduce((total, line) => total + line.amount, 0n);

  if (!convertsExactly(exchangeRate, debited, credited)) {
    throw new RangeError(
      `EXCHANGE ${id} does not convert exactly at ${exchangeRate.localSubunits}:${exchangeRate.kredbits}. Rounding an exchange creates or destroys supply.`,
    );
  }
}

/**
 * Build a transaction, enforcing the invariants that 19: Invariants lists as
 * non-negotiable.
 *
 * Balancing is **per economy**, not across the whole entry list. A single
 * global sum would accept a debit in a local currency against a credit in
 * official KRED, which balances arithmetically and mints official supply out of
 * `ZIT` (Law X, Local Currency Stays Local, and Law I). `EXCHANGE` is the one
 * type that legitimately spans two economies, and it is checked against a
 * declared rate instead.
 *
 * @throws if the entries do not balance within each economy, if any entry
 * disagrees with the transaction's economy, type, policy version or idempotency
 * key, or if the entry directions contradict whether this type moves KRED.
 */
export function transaction(candidate: Transaction): Transaction {
  const { type, rulesVersion, idempotencyKey, economyId } = candidate;
  const isExchange = type === "EXCHANGE";

  if (candidate.entries.length === 0) {
    throw new RangeError(`a transaction needs at least one entry.`);
  }
  if (!isExchange && (candidate.exchangeRate || candidate.fromEconomyId || candidate.toEconomyId)) {
    throw new RangeError(
      `${type} ${candidate.id} carries exchange fields, which only EXCHANGE may use.`,
    );
  }

  // Route every candidate through `entry()` rather than trusting the caller to
  // have done it. This function is the only gate between the economy and the
  // ledger, so an entry-level invariant it does not apply is an invariant that
  // does not exist.
  const entries = candidate.entries.map(entry);

  for (const line of entries) {
    if (line.rulesVersion !== rulesVersion) {
      throw new RangeError(
        `entry ${line.id} carries rules version ${line.rulesVersion}, transaction ${candidate.id} is ${rulesVersion} (Law XV).`,
      );
    }
    if (line.idempotencyKey !== idempotencyKey) {
      throw new RangeError(
        `entry ${line.id} carries a different idempotency key from its transaction (06: Ledger, Idempotency).`,
      );
    }
    if (line.type !== type) {
      throw new RangeError(
        `entry ${line.id} is typed ${line.type} inside a ${type} transaction. History must explain the balance (06: Ledger).`,
      );
    }
    if (!isExchange && line.economyId !== economyId) {
      throw new RangeError(
        `entry ${line.id} belongs to economy ${line.economyId}, transaction ${candidate.id} is ${economyId}. Only EXCHANGE spans economies (Law X).`,
      );
    }
  }

  const memos = entries.filter((line) => line.direction === "MEMO");

  if (movesNoKred(type)) {
    if (memos.length !== entries.length) {
      throw new RangeError(
        `${type} moves no KRED, so every entry must be a MEMO (06: Ledger, Transaction types).`,
      );
    }
    return Object.freeze({ ...candidate, entries: Object.freeze(entries) });
  }

  if (memos.length > 0) {
    throw new RangeError(
      `${type} moves KRED, so it cannot carry MEMO entries (06: Ledger, Transaction types).`,
    );
  }

  if (isExchange) {
    assertExchangeShape({ ...candidate, entries });
    return Object.freeze({ ...candidate, entries: Object.freeze(entries) });
  }

  const debits = entries
    .filter((line) => line.direction === "DEBIT")
    .reduce((total, line) => total + line.amount, 0n);
  const credits = entries
    .filter((line) => line.direction === "CREDIT")
    .reduce((total, line) => total + line.amount, 0n);

  if (debits !== credits) {
    throw new RangeError(
      `transaction ${candidate.id} does not balance in ${economyId}: ${debits} debited, ${credits} credited. Every transfer has two sides that sum to zero (19: Invariants).`,
    );
  }

  return Object.freeze({ ...candidate, entries: Object.freeze(entries) });
}
