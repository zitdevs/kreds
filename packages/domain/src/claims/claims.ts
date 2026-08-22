import type { AccountId, DebtId, ReceivableId, RulesVersion } from "../primitives/ids.js";
import { ZERO_KREDBITS, subtractKredbits, type Kredbits } from "../primitives/money.js";

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
  readonly createdAt: Date;
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
  readonly createdAt: Date;
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
  return [...claims].sort((a, b) => {
    const byAge = a.createdAt.getTime() - b.createdAt.getTime();
    return byAge !== 0 ? byAge : a.id.localeCompare(b.id);
  });
}

/** Total still owed across a set of claims. Never a term in the supply equation. */
export function totalOutstanding(claims: readonly Receivable[]): Kredbits {
  return claims
    .filter(isOutstanding)
    .reduce<Kredbits>((total, claim) => (total + outstandingOn(claim)) as Kredbits, ZERO_KREDBITS);
}

/** Total still owed across a set of debts. Never a term in the supply equation. */
export function totalDebt(debts: readonly Debt[]): Kredbits {
  return debts.reduce<Kredbits>(
    (total, debt) => (total + debt.outstanding) as Kredbits,
    ZERO_KREDBITS,
  );
}
