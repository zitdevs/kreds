import { totalDebt, totalOutstanding, type Debt, type Receivable } from "../claims/claims.js";
import type { LedgerEntry } from "../ledger/ledger.js";
import type { Brand } from "../primitives/brand.js";
import { ZERO_KREDBITS, kredbits, type Kredbits } from "../primitives/money.js";

/**
 * `Balance − Outstanding Debt`. **May be negative.** A display figure.
 *
 * A separate brand from `Kredbits` because it is the one economic quantity in
 * the system allowed to go below zero, and letting it share a type with money
 * would reopen exactly the hole Amendment A01 closed: a negative *net position*
 * is legal, a negative *balance* mints currency.
 */
export type NetPosition = Brand<bigint, "NetPosition">;

/**
 * A user's economic state inside one accounting context.
 *
 * 23: Review Funding, Debt and Credit, Economic position. Every field here is
 * derived; none of them is a column anyone writes to.
 */
export interface EconomicPosition {
  /** KRED actually owned. Never negative (Law XXI). */
  readonly balance: Kredbits;
  /** What this position owes. Tracked beside the balance, never inside it. */
  readonly outstandingDebt: Kredbits;
  /** Work done for this position's holder, not yet funded. Not an asset it holds. */
  readonly pendingReceivables: Kredbits;
  /** Earned, still inside the settlement window. */
  readonly pendingSettlement: Kredbits;
  /** Reserved against liabilities, reversals, risk, or pending events. */
  readonly locked: Kredbits;
  /** Usable inside the economy right now. */
  readonly available: Kredbits;
  /** Eligible to leave the organization context and settle globally. */
  readonly withdrawable: Kredbits;
}

export interface PositionSources {
  /** Every entry addressed to this account, in any status. */
  readonly entries: readonly LedgerEntry[];
  /** Obligations this account carries. */
  readonly debts: readonly Debt[];
  /** Claims this account holds against others. */
  readonly receivables: readonly Receivable[];
  /**
   * Funds reserved by risk or pending events. An input rather than a
   * derivation: what to lock is a Risk Engine decision, and this package does
   * not make those.
   */
  readonly locked: Kredbits;
}

/**
 * `Balance − Outstanding Debt`.
 *
 * Pending receivables are deliberately absent. 23: Review Funding, Debt and
 * Credit: "Pending receivables and other pending assets are **displayed
 * separately** and are not folded into this figure. A receivable is work
 * someone owes you, not value you hold."
 *
 * The chapter also records that Amendment A01 §54 shows an example that
 * contradicts its own §4 formula, and states that the repository implements §4.
 * So does this.
 */
export function netPosition(position: EconomicPosition): NetPosition {
  return (position.balance - position.outstandingDebt) as NetPosition;
}

/**
 * Compute a position from the ledger.
 *
 * Law II, Auditable Movement. There is no setter here, and there is no stored
 * balance anywhere in this package: if a figure cannot be reconstructed from
 * entries, fraud investigation, reversal, and supply conservation all become
 * impossible at once.
 *
 * Entries are summed in every status. A reversal is a *compensating entry*
 * (06: Ledger, Immutable history), so the original still counts and the pair
 * nets to zero; filtering reversed entries out would remove the value twice.
 *
 * @throws if the entries imply a negative balance. That is not a state to
 * store, it is a defect upstream: something minted (Law XXI).
 */
export function derivePosition(sources: PositionSources): EconomicPosition {
  const { entries, debts, receivables, locked } = sources;

  let credits = 0n;
  let debits = 0n;
  let pendingCredits = 0n;
  let pendingDebits = 0n;

  for (const line of entries) {
    if (line.direction === "MEMO") continue;
    const isCredit = line.direction === "CREDIT";
    if (isCredit) credits += line.amount;
    else debits += line.amount;

    if (line.status === "PENDING") {
      if (isCredit) pendingCredits += line.amount;
      else pendingDebits += line.amount;
    }
  }

  const rawBalance = credits - debits;
  if (rawBalance < 0n) {
    throw new RangeError(
      `entries imply a balance of ${rawBalance}. A negative balance means KRED was created outside the Central Bank (Law XXI).`,
    );
  }

  const balance = kredbits(rawBalance);
  const outstandingDebt = totalDebt(debts);
  const pendingReceivables = totalOutstanding(receivables);
  const pendingSettlement = kredbits(
    pendingCredits > pendingDebits ? pendingCredits - pendingDebits : 0n,
  );

  const usable = balance - pendingSettlement - locked;
  const available = kredbits(usable > 0n ? usable : 0n);

  // 19: Invariants, "A negative net position has Withdrawable = 0", which is
  // Law VII enforced at the only place value leaves the org context.
  const underwater = balance - outstandingDebt < 0n;
  const withdrawable = underwater ? ZERO_KREDBITS : available;

  return Object.freeze({
    balance,
    outstandingDebt,
    pendingReceivables,
    pendingSettlement,
    locked,
    available,
    withdrawable,
  });
}
