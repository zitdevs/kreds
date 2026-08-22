import type {
  AccountId,
  EconomyId,
  IdempotencyKey,
  LedgerEntryId,
  OrganizationId,
  RulesVersion,
  TransactionId,
} from "../primitives/ids.js";
import { ZERO_KREDBITS, type Kredbits } from "../primitives/money.js";

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
  /** Cross-currency movement. */
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
 * The `MEMO` name is an implementation choice. What the chapter fixes is that
 * those two types move nothing and are still ledgered.
 */
export type EntryDirection = "DEBIT" | "CREDIT" | "MEMO";

/**
 * What caused this entry.
 *
 * 06: Ledger: `sourceType` / `sourceId` "traces every entry back to the GitHub
 * event that caused it". The GitHub-derived members correspond to normalised
 * domain events; the rest are network-originated movements with no single
 * GitHub event behind them.
 */
export type EntrySourceType =
  | "PULL_REQUEST_MERGED"
  | "PULL_REQUEST_CLOSED"
  | "REVIEW_SUBMITTED"
  | "ISSUE_RESOLVED"
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
 * settlement window", and settled value. Reversal is a status here as well as a
 * type, because a reversed entry stays in history (06: Ledger, Immutable
 * history).
 */
export type EntryStatus = "PENDING" | "SETTLED" | "REVERSED";

/**
 * The atomic, immutable record of one economic movement.
 *
 * Law II, Auditable Movement: balances are derived, never stored and mutated.
 * `user.balance += 30` is a bug, not an optimisation. This interface is the
 * only thing the economy is allowed to write.
 */
export interface LedgerEntry {
  readonly id: LedgerEntryId;
  /** Distinguishes official KRED from local currencies. */
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
  readonly settledAt: Date | null;
  readonly createdAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** A grouped, balanced set of entries. Nothing reaches the ledger except through one of these. */
export interface Transaction {
  readonly id: TransactionId;
  readonly type: TransactionType;
  readonly economyId: EconomyId;
  readonly rulesVersion: RulesVersion;
  readonly idempotencyKey: IdempotencyKey;
  readonly createdAt: Date;
  readonly entries: readonly LedgerEntry[];
}

/**
 * Build one entry.
 *
 * @throws if the amount is zero. An entry that moves nothing explains nothing,
 * and 06: Ledger requires that history always explain the current balance.
 */
export function entry(candidate: LedgerEntry): LedgerEntry {
  if (candidate.amount === ZERO_KREDBITS) {
    throw new RangeError(
      `a ledger entry cannot be for zero kredbits: history must explain the balance (06: Ledger).`,
    );
  }
  return Object.freeze({ ...candidate });
}

/**
 * Build a transaction, enforcing the invariants that 19: Invariants lists as
 * non-negotiable.
 *
 * @throws if the entries do not balance, if any entry disagrees with the
 * transaction's policy version or idempotency key, or if the entry directions
 * contradict whether this type moves KRED.
 */
export function transaction(candidate: Transaction): Transaction {
  const { entries, type, rulesVersion, idempotencyKey } = candidate;

  if (entries.length === 0) {
    throw new RangeError(`a transaction needs at least one entry.`);
  }

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
  }

  const memos = entries.filter((line) => line.direction === "MEMO");

  if (movesNoKred(type)) {
    if (memos.length !== entries.length) {
      throw new RangeError(
        `${type} moves no KRED, so every entry must be a MEMO (06: Ledger, Transaction types).`,
      );
    }
    return Object.freeze({ ...candidate, entries: Object.freeze([...entries]) });
  }

  if (memos.length > 0) {
    throw new RangeError(
      `${type} moves KRED, so it cannot carry MEMO entries (06: Ledger, Transaction types).`,
    );
  }

  const debits = entries
    .filter((line) => line.direction === "DEBIT")
    .reduce((total, line) => total + line.amount, 0n);
  const credits = entries
    .filter((line) => line.direction === "CREDIT")
    .reduce((total, line) => total + line.amount, 0n);

  if (debits !== credits) {
    throw new RangeError(
      `transaction ${candidate.id} does not balance: ${debits} debited, ${credits} credited. Every transfer has two sides that sum to zero (19: Invariants).`,
    );
  }

  return Object.freeze({ ...candidate, entries: Object.freeze([...entries]) });
}
