import { points, ZERO_POINTS, type Points } from "../primitives/points.js";

/**
 * Contribution Points where nobody was watching.
 *
 * Amendment A04 opened this surface and then closed it in the same document.
 * Delegated query makes personal private repositories ingestible at scale, and
 * 26 names the farm that follows: "generate pull requests in your own private
 * repository, merge them yourself, and collect Contribution Points forever."
 *
 * Law XXIX already gives that `0 KRED`. Points are the other half of the
 * product, and 24 states the fix:
 *
 * > "Points earned in a context with no independent human observer are capped."
 *
 * Capped, not refused, and the reason matters: "solo work in a private
 * repository is real work". What the cap defends is the leaderboard, because
 * "GitHub attesting that a merge *happened* is not the same as anyone judging
 * that it was *worth something*."
 *
 * No number appears in this file. The caps are operational policy and are not
 * published, so they arrive as configuration and this module only applies them.
 */

/** What Kreds can tell about who else was involved. */
export interface ObservationContext {
  /** A distinct, eligible human reviewed it. */
  readonly hadIndependentHumanReview: boolean;
  /** The repository is visible to people other than its owner. */
  readonly isPublic: boolean;
  /** Someone other than the author has contributed to this repository. */
  readonly hasExternalContributors: boolean;
}

/**
 * Whether anybody independent could have seen this.
 *
 * Public visibility counts as observation for points, which is a lighter bar
 * than it is for money: Law XXX says visibility alone "does not automatically
 * grant full monetary eligibility", and Law XXVIII keeps the bar for
 * recognition deliberately below the bar for issuance. A public repository can
 * be looked at by anyone, which is what the leaderboard is defending.
 */
export function wasObserved(context: ObservationContext): boolean {
  return context.hadIndependentHumanReview || context.isPublic || context.hasExternalContributors;
}

/**
 * The caps, as configuration.
 *
 * Two windows because a daily cap alone is a rate limit an unattended script
 * simply waits out, reaching an unbounded total over a month.
 */
export interface UnobservedCaps {
  readonly perUserPerDay: Points;
  readonly perUserPerMonth: Points;
}

/** What this user has already been awarded in unobserved contexts. */
export interface UnobservedTally {
  readonly today: Points;
  readonly thisMonth: Points;
}

export type CapReason = "NOT_CAPPED" | "DAILY_CAP_REACHED" | "MONTHLY_CAP_REACHED";

export interface CappedAward {
  readonly awarded: Points;
  /** What would have been awarded had nobody needed to defend a leaderboard. */
  readonly earned: Points;
  readonly observed: boolean;
  readonly reason: CapReason;
}

/**
 * Apply the caps to one award.
 *
 * An observed context passes through untouched: this is not a discount on
 * private work, it is a bound on work nobody can check.
 *
 * The remaining allowance is the smaller of the two windows, so the monthly
 * bound holds even on a day whose own allowance is still open.
 */
export function capUnobserved(
  earned: Points,
  context: ObservationContext,
  tally: UnobservedTally,
  caps: UnobservedCaps,
): CappedAward {
  if (wasObserved(context)) {
    return frozen({ awarded: earned, earned, observed: true, reason: "NOT_CAPPED" });
  }

  const dailyRoom = Math.max(0, caps.perUserPerDay - tally.today);
  const monthlyRoom = Math.max(0, caps.perUserPerMonth - tally.thisMonth);
  const room = Math.min(dailyRoom, monthlyRoom);
  const awarded = points(Math.min(earned, room));

  return frozen({
    awarded,
    earned,
    observed: false,
    reason:
      awarded === earned
        ? "NOT_CAPPED"
        : monthlyRoom <= dailyRoom
          ? "MONTHLY_CAP_REACHED"
          : "DAILY_CAP_REACHED",
  });
}

function frozen(award: CappedAward): CappedAward {
  return Object.freeze(award);
}

export class UnobservedCapsNotConfiguredError extends Error {
  constructor() {
    super(
      "Contribution Points in a context with no independent observer need a configured bound, and none was supplied. Awarding without one would leave the contribution leaderboard climbable by a script in a repository nobody else can see.",
    );
    this.name = "UnobservedCapsNotConfiguredError";
  }
}

/**
 * Read caps that an operator supplied, or refuse to award in the dark.
 *
 * This repository is public, and the caps are not, so they cannot be shipped in
 * it. An instance that has not been configured therefore cannot know the bound,
 * and Law XIX ("Every reward mechanism must be designed under the assumption
 * that someone will eventually attempt to farm it") makes the safe direction
 * clear: award nothing unobserved rather than award without a limit.
 *
 * Observed contexts are unaffected and need no configuration at all, so an
 * unconfigured instance still runs a complete public economy.
 */
export function unobservedCaps(configured: {
  perUserPerDay?: number;
  perUserPerMonth?: number;
}): UnobservedCaps {
  const { perUserPerDay, perUserPerMonth } = configured;
  if (perUserPerDay === undefined || perUserPerMonth === undefined) {
    throw new UnobservedCapsNotConfiguredError();
  }
  return Object.freeze({
    perUserPerDay: points(perUserPerDay),
    perUserPerMonth: points(perUserPerMonth),
  });
}

/** No configured caps: unobserved work is recorded and awarded nothing. */
export const NO_UNOBSERVED_ALLOWANCE: UnobservedCaps = Object.freeze({
  perUserPerDay: ZERO_POINTS,
  perUserPerMonth: ZERO_POINTS,
});
