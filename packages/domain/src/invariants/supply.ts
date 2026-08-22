import type { AccountType } from "../economy/account.js";
import { fromKred, type Kredbits } from "../primitives/money.js";

/**
 * 01: The Kreds Network, Global supply.
 *
 * > ```text
 * > MAX KRED SUPPLY
 * > 5,000,000 KRED
 * > ```
 *
 * A published figure, not an operational threshold. The cap is the reason the
 * question "where did this KRED come from?" has to have an answer.
 */
export const MAXIMUM_SUPPLY = fromKred(5_000_000);

/**
 * Every term of the conservation equation, in the order 19: Invariants states
 * it.
 *
 * This list is exhaustive by construction: it is `AccountType` minus nothing.
 * Liabilities are absent because they are not account types, and Contribution
 * Points are absent because they are not denominated in KRED at all.
 */
export const SUPPLY_TERMS = [
  "CENTRAL_BANK_RESERVE",
  "GLOBAL_WALLET",
  "ORGANIZATION_POSITION",
  "TREASURY",
  "REVIEW_FUND",
  "PENDING",
  "NETWORK_RESERVE",
  "PROTOCOL",
  "BURNED",
] as const satisfies readonly AccountType[];

/**
 * The failure modes 19: Invariants lists for a non-zero delta.
 *
 * The chapter is explicit that "a drift of one kredbit means one of the
 * following is true, and all of them are serious", so a reconciliation result
 * carries the list rather than making an on-call engineer go and find it.
 */
const DRIFT_CAUSES = [
  "a balance was mutated outside the ledger (Law II)",
  "a split dropped a remainder (06: Ledger, Monetary precision)",
  "floating-point arithmetic entered the pipeline",
  "a transfer was recorded one-sided",
  "something minted outside the Central Bank (Law I)",
  "a negative balance was permitted somewhere (Law XXI)",
  "a liability was counted as supply (Law XXIV)",
  "Contribution Points were converted to KRED (Law XXVI)",
  "a merge minted without passing eligibility (Law XXIX)",
] as const;

export interface SupplyReconciliation {
  readonly reconciles: boolean;
  /** Signed. Positive means the books hold more than the maximum supply. */
  readonly delta: bigint;
  readonly counted: Kredbits;
  readonly maximumSupply: Kredbits;
  readonly possibleCauses: readonly string[];
}

export interface SupplyInputs {
  /** Total held by every account of each type. */
  readonly balances: Readonly<Record<(typeof SUPPLY_TERMS)[number], Kredbits>>;
  /** Defaults to the network maximum. An override exists for tests and for sovereign economies. */
  readonly maximumSupply?: Kredbits;
}

/**
 * Evaluate official KRED conservation.
 *
 * 19: Invariants describes this as "the system's health check" and says it
 * "should be evaluated continuously, not on demand". That is an operational
 * instruction, and this function is the arithmetic it needs.
 *
 * Note what is not a parameter: debt, receivables, and points. They are not
 * omitted for brevity, their absence is the invariant.
 */
export function reconcileSupply(inputs: SupplyInputs): SupplyReconciliation {
  const maximumSupply = inputs.maximumSupply ?? MAXIMUM_SUPPLY;
  const counted = SUPPLY_TERMS.reduce<bigint>((total, term) => total + inputs.balances[term], 0n);
  const delta = counted - maximumSupply;
  return Object.freeze({
    reconciles: delta === 0n,
    delta,
    counted: counted as Kredbits,
    maximumSupply,
    possibleCauses: delta === 0n ? [] : DRIFT_CAUSES,
  });
}
