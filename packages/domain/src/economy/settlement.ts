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
 * Whether the evidence behind an entry can still be re-checked.
 *
 * Added by A04's audit round, and it closes the sharpest hole the amendment
 * opened. 26:
 *
 * > "**Pending value requires observability through its settlement window.** The
 * > window exists so that closures, reverts, invalidated reviews and provider
 * > corrections can still reach the pending value. If the evidentiary context
 * > goes dark before settlement, whether by revocation, lost repository access,
 * > or repository deletion, the pending value **locks**: it does not settle on
 * > evidence Kreds can no longer re-check."
 *
 * The attack this stops is worth stating plainly, because the earlier text
 * explicitly allowed it: merge eligible work, revoke the authorization, revert
 * everything while Kreds cannot see, and let the reward settle on evidence that
 * was quietly invalidated. 26's own summary: "Going dark is legitimate;
 * settling in the dark is not."
 */
export type Observability = "OBSERVABLE" | "DARK";

/** What a sweep can currently see, per evidentiary context. */
export interface ObservabilityLookup {
  (entry: LedgerEntry): Observability;
}

/**
 * Everything is visible. The ordinary case, and the one webhooks produce.
 *
 * Named rather than defaulted, so a caller that has not thought about
 * observability has to say so in its own source.
 */
export const ALL_OBSERVABLE: ObservabilityLookup = () => "OBSERVABLE";

/**
 * The entries a sweep should move to `SETTLED`.
 *
 * Three conditions, and the third is the one A04 added. Already-settled entries
 * are excluded rather than re-settled: settling is not idempotent in its effect
 * on `settledAt`, and re-stamping would move a historical fact, which
 * 06: Ledger does not permit.
 *
 * An entry whose context has gone dark is not returned and is not discarded
 * either. It stays `PENDING`, which is what "locks" means here: 26 has it settle
 * "when the context becomes observable again, or resolves under versioned
 * expiry policy", and both of those are later events rather than this sweep's
 * business.
 */
export function due(
  entries: readonly LedgerEntry[],
  window: SettlementWindow,
  now: Timestamp,
  observability: ObservabilityLookup = ALL_OBSERVABLE,
): LedgerEntry[] {
  return entries.filter(
    (entry) =>
      entry.status === "PENDING" &&
      hasSettled(entry, window, now) &&
      observability(entry) === "OBSERVABLE",
  );
}

/**
 * Pending value that has served its window but cannot be checked.
 *
 * Reported separately rather than folded into `due`, because an operator needs
 * to see it: value locked in the dark is a queue that grows, and the difference
 * between "nothing was due" and "something was due and is stuck" is the whole
 * signal.
 */
export function lockedInTheDark(
  entries: readonly LedgerEntry[],
  window: SettlementWindow,
  now: Timestamp,
  observability: ObservabilityLookup,
): LedgerEntry[] {
  return entries.filter(
    (entry) =>
      entry.status === "PENDING" &&
      hasSettled(entry, window, now) &&
      observability(entry) === "DARK",
  );
}
