import type { AccountId, DebtId, ReceivableId, RulesVersion } from "../primitives/ids.js";
import {
  ZERO_KREDBITS,
  addKredbits,
  subtractKredbits,
  type Kredbits,
} from "../primitives/money.js";
import type { Timestamp } from "../primitives/time.js";

/**
 * Who carries a review obligation.
 *
 * 23: Review Funding, Debt and Credit, Who owes the debt: "Default author-paid
 * review creates User Review Debt. An organization-sponsored review policy
 * creates Organization Review Debt."
 */
export type DebtScope = "USER" | "ORGANIZATION" | "PROJECT";

/**
 * An obligation. **Not currency.**
 *
 * Law XXI, No Monetary Creation Through Debt: "A negative economic position may
 * represent a liability, but it may never create spendable Official KRED."
 *
 * 19: Invariants keeps debt out of the supply equation entirely: "Debt is what
 * someone owes. Receivables are what someone is owed. Neither is money, and
 * adding either to the equation would double-count the KRED that funds them."
 *
 * This is a separate aggregate from the position on purpose. Modelling debt as
 * a negative balance is the exact bug Amendment A01 exists to close.
 */
export interface Debt {
  readonly id: DebtId;
  readonly scope: DebtScope;
  /** The account that owes. */
  readonly obligorAccountId: AccountId;
  /** The account the KRED came from, and that repayment returns to. */
  readonly lendingAccountId: AccountId;
  /** The full gross value originally financed. */
  readonly principal: Kredbits;
  /** What is still owed. Repayment reduces this, never the principal. */
  readonly outstanding: Kredbits;
  readonly rulesVersion: RulesVersion;
  readonly createdAt: Timestamp;
}

/**
 * 23: Review Funding, Debt and Credit, Level 4: unsettled review receivable.
 *
 * `AWAITING_FUNDING` is the status the chapter shows to the reviewer, which is
 * the point of recording it: "That is better than pretending the review was
 * worthless because the author happened to lack liquidity."
 */
export type ReceivableStatus = "AWAITING_FUNDING" | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED";

/**
 * Work done and recognised, but not yet funded. **Not currency.**
 *
 * Law XXIV, Unfunded Work Is a Claim, Not Currency: "Receivables do not count
 * toward KRED supply and cannot be transferred, spent, or withdrawn until
 * funded."
 *
 * A transferable claim would be a second money supply with none of the first
 * one's controls, which is why this type exposes no transfer operation.
 */
export interface Receivable {
  readonly id: ReceivableId;
  /** The reviewer who is owed. */
  readonly claimantAccountId: AccountId;
  /** The account whose future earnings settle this claim first (Law VIII). */
  readonly obligorAccountId: AccountId;
  /** Full gross review value. Fees apply on settlement, exactly as they would have on payment. */
  readonly grossValue: Kredbits;
  readonly settledValue: Kredbits;
  readonly status: ReceivableStatus;
  readonly rulesVersion: RulesVersion;
  readonly createdAt: Timestamp;
}

/** What is still owed on a claim. */
export function outstandingOn(claim: Receivable): Kredbits {
  return subtractKredbits(claim.grossValue, claim.settledValue);
}

/**
 * Whether a claim is still waiting on funding.
 *
 * Cancelled and fully settled claims are excluded, which is what keeps them out
 * of the position's `pendingReceivables` figure.
 */
export function isOutstanding(claim: Receivable): boolean {
  return claim.status === "AWAITING_FUNDING" || claim.status === "PARTIALLY_SETTLED";
}

/**
 * Order claims for settlement.
 *
 * 23: Review Funding, Debt and Credit, Payment ordering:
 *
 * > "**Initial policy: oldest eligible receivable first.**"
 *
 * The chapter states the requirement as "deterministic, versioned, and
 * transparent", and chose oldest-first over pro-rata because it "produces one
 * clear answer per event". Ties break on id so the order is total, not merely
 * stable.
 */
export function inSettlementOrder(claims: readonly Receivable[]): Receivable[] {
  // "oldest **eligible** receivable first". A settled or cancelled claim is not
  // eligible for anything, and leaving it in the queue would let it absorb an
  // ordering slot it can never use.
  return claims.filter(isOutstanding).sort((a, b) => {
    const byAge = a.createdAt - b.createdAt;
    return byAge !== 0 ? byAge : a.id.localeCompare(b.id);
  });
}

/** Total still owed across a set of claims. Never a term in the supply equation. */
export function totalOutstanding(claims: readonly Receivable[]): Kredbits {
  return claims
    .filter(isOutstanding)
    .reduce<Kredbits>((total, claim) => addKredbits(total, outstandingOn(claim)), ZERO_KREDBITS);
}

/** Total still owed across a set of debts. Never a term in the supply equation. */
export function totalDebt(debts: readonly Debt[]): Kredbits {
  return debts.reduce<Kredbits>(
    (total, debt) => (total + debt.outstanding) as Kredbits,
    ZERO_KREDBITS,
  );
}

/**
 * A stale claim resolved by policy, never by silence.
 *
 * 23, as amended by A04's audit round:
 *
 * > "Where policy defines an expiry for stale claims, expiry is a **versioned**
 * > `RECEIVABLE_CANCELLED` adjustment, announced like any policy and never
 * > silent. This matters most for claims against identities that never
 * > connected, which could otherwise accumulate forever as a fictitious asset."
 *
 * Two failures are being avoided at once, and they pull in opposite directions.
 * A claim that never expires is an asset on the reviewer's profile that will
 * never be paid, which is a lie told slowly. A claim that vanishes quietly is a
 * reviewer's work disappearing with no record, which is worse. So expiry
 * happens, and it happens as a recorded, versioned event.
 */
export interface ClaimExpiry {
  /** How long a claim may stay outstanding. Policy, never a default in code. */
  readonly afterMs: number;
  /** The rules version that defined this expiry (Law XV). */
  readonly rulesVersion: RulesVersion;
}

export class ExpiryNotConfiguredError extends Error {
  constructor() {
    super(
      "expiring a claim needs a versioned policy that says when and under which rules. Cancelling without one would be the silent expiry chapter 23 forbids.",
    );
    this.name = "ExpiryNotConfiguredError";
  }
}

/**
 * The claims a versioned expiry policy would cancel.
 *
 * Returns candidates rather than mutating them, and each one carries the version
 * that decided it, so the cancellation can be written as an adjustment somebody
 * can later explain.
 *
 * Already-settled and already-cancelled claims are never candidates: expiry
 * resolves a claim that is still waiting, and re-cancelling a closed one would
 * write a second history for the same fact.
 */
export function claimsToExpire(
  claims: readonly Receivable[],
  policy: ClaimExpiry | null,
  now: Timestamp,
): { readonly claim: Receivable; readonly rulesVersion: RulesVersion }[] {
  if (!policy) throw new ExpiryNotConfiguredError();
  if (!Number.isFinite(policy.afterMs) || policy.afterMs <= 0) {
    throw new RangeError(
      `a claim expiry of ${policy.afterMs} would cancel work the moment it was recorded.`,
    );
  }
  return claims
    .filter(isOutstanding)
    .filter((claim) => now - claim.createdAt >= policy.afterMs)
    .map((claim) => ({ claim, rulesVersion: policy.rulesVersion }));
}
