import type { Brand } from "./brand.js";

/**
 * Contribution Points: cumulative recognition of verified work.
 *
 * Law XXVI, Contribution Is Not Currency:
 *
 * > "Contribution Points represent verified work and reputation. They cannot be
 * >  transferred, spent, exchanged, or used as KRED, and they have no fixed or
 * >  implied conversion rate into KRED in either direction."
 *
 * Points are a separate brand from `Kredbits` on purpose. The two are both
 * integers, so without nominal typing nothing would stop one being passed where
 * the other belongs, and 19: Invariants lists "Contribution Points were
 * converted to KRED" as one of the ways the supply equation drifts.
 *
 * This module deliberately exports no transfer, spend, exchange or conversion
 * operation. The absence is the point: a function that does not exist cannot be
 * called by a future feature in a hurry.
 */
export type Points = Brand<number, "Points">;

/**
 * Why a contribution's points may be reduced.
 *
 * 24: Contribution Points is explicit that points are immune to *economic*
 * events and not to the underlying work being invalidated. Requiring a reason
 * keeps that distinction visible at every call site: there is no way to reduce
 * a score without naming which of these happened.
 */
export type InvalidationReason =
  /** The contribution was reverted. */
  | "CONTRIBUTION_REVERTED"
  /** Farming or fraud was confirmed for this contribution. */
  | "CONFIRMED_FRAUD"
  /** The actor was reclassified as a bot or AI agent (Law XVI). */
  | "ACTOR_RECLASSIFIED";

export function points(value: number): Points {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`contribution points are whole counts, received ${value}.`);
  }
  if (value < 0) {
    throw new RangeError(`contribution points cannot be negative, received ${value}.`);
  }
  return value as Points;
}

/** Add newly earned recognition to a running score. */
export function awardPoints(current: Points, earned: Points): Points {
  return points(current + earned);
}

/**
 * Reduce a score because the underlying contribution stopped being valid.
 *
 * This is the only reducing operation in the module, and it cannot be reached
 * without naming a reason, which is what keeps Law XXVII intact: spending KRED
 * and carrying debt have no path to this function.
 */
export function invalidatePoints(
  current: Points,
  amount: Points,
  reason: InvalidationReason,
): Points {
  if (amount > current) {
    throw new RangeError(
      `invalidating ${amount} points against a score of ${current} (${reason}) would go negative.`,
    );
  }
  return points(current - amount);
}

export const ZERO_POINTS = points(0);
