import type { LedgerEntry } from "../ledger/ledger.js";
import { timestamp, type Timestamp } from "../primitives/time.js";

/**
 * When earned value becomes withdrawable.
 *
 * 11: Debt, Settlement and Extraction Protection: "New rewards do not become
 * immediately withdrawable." That sentence is the whole mechanism Law VII rests
 * on. The chapter lists what the delay is for:
 *
 * > the PR may close, the review may be invalid, duplicate webhook, fraud
 * > detection, rule reconciliation, GitHub event correction
 *
 * and then says why the length was chosen:
 *
 * > "The window is short by financial standards and long by farming standards,
 * > which is exactly the intent. A day of delay is invisible to an honest user
 * > checking their balance tomorrow. It is fatal to an attack whose entire
 * > economics depend on extracting value before the liability lands."
 *
 * Nothing here decides the length. The window arrives as an argument because
 * the published normal window and the risk-adjusted ones are different values
 * from different places: the first is in the public policy, the second is
 * operational policy that is deliberately not published, and a default in this
 * file would be a guess at a number whose purpose is not being guessable.
 */

/** A settlement window, in whole milliseconds. */
export interface SettlementWindow {
  readonly milliseconds: number;
}

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * Build a window from hours, which is the unit the policy publishes.
 *
 * @throws on a window of zero. A window that elapses instantly is not a short
 * window, it is the absence of one, and 11 exists precisely to forbid rewards
 * that are "immediately withdrawable".
 */
export function settlementWindow(hours: number): SettlementWindow {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new RangeError(
      `a settlement window must be a positive number of hours, received ${hours}. A window of zero makes rewards immediately withdrawable, which is what chapter 11 exists to prevent.`,
    );
  }
  return Object.freeze({ milliseconds: Math.round(hours * MILLISECONDS_PER_HOUR) });
}

/**
 * When an entry becomes eligible to settle.
 *
 * Measured from when the entry was created, not from when a worker happens to
 * look at it. An instance that was offline for a week does not thereby extend
 * anybody's window, and one that runs the sweep twice in a second does not
 * shorten it.
 */
export function settlesAt(entry: LedgerEntry, window: SettlementWindow): Timestamp {
  return timestamp(entry.createdAt + window.milliseconds);
}

/**
 * Whether an entry has served its window.
 *
 * The boundary is inclusive: an entry created exactly one window ago has
 * waited the full window. Excluding it would make the effective window
 * "24 hours plus however long until the next sweep", which is a different
 * number from the published one.
 */
export function hasSettled(entry: LedgerEntry, window: SettlementWindow, now: Timestamp): boolean {
  return now >= settlesAt(entry, window);
}

/**
 * The entries a sweep should move to `SETTLED`.
 *
 * Already-settled entries are excluded rather than re-settled. Settling is not
 * idempotent in its effect on `settledAt`: re-stamping an entry would move a
 * historical fact, and 06: Ledger does not permit history to be repaired in
 * place.
 */
export function due(
  entries: readonly LedgerEntry[],
  window: SettlementWindow,
  now: Timestamp,
): LedgerEntry[] {
  return entries.filter((entry) => entry.status === "PENDING" && hasSettled(entry, window, now));
}
