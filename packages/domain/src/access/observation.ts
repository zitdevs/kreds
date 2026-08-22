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

/**
 * Who, if anyone, independently saw this work.
 *
 * An observer is a **person**, not a property of the repository. 24 fixes the
 * standard exactly, and it is the validating reviewer's:
 *
 * > "An observer, for this purpose, is held to the same standard as a
 * > validating reviewer: a distinct, eligible, human identity that is not a
 * > controlled alternate account. Adding your own second account as a
 * > collaborator does not lift the cap; if it did, the cap would cost one API
 * > call to bypass."
 *
 * The first version of this file treated public visibility and the presence of
 * collaborators as observation. Both are toggles the author controls, and both
 * cost one API call, which is the bypass the chapter names. Law XXX says the
 * same thing about the monetary side: "A toggle is not evidence."
 */
export interface ObservationContext {
  /**
   * An identity other than the contributor was involved.
   *
   * Necessary and not sufficient. The three fields below are the reviewer
   * standard from 25, and all of them must hold.
   */
  readonly observerGitHubUserId: number | null;
  /** Not the contributor themselves. */
  readonly observerIsDistinct: boolean;
  /** A human, classified as such rather than assumed (Law XVI). */
  readonly observerIsEligibleHuman: boolean;
  /**
   * Not an account the contributor controls.
   *
   * Law XXXIV: "A user may not create economic eligibility by reviewing their
   * own work through controlled alternate identities." Whether two accounts are
   * the same person is a Risk Engine judgement, so this arrives as a decision
   * rather than being computed here.
   */
  readonly observerIsNotControlledAlternate: boolean;
}

/**
 * Whether an independent human observed this.
 *
 * Every clause must hold. An unknown fails closed, which is the same direction
 * Law XVI takes for an unclassified actor: the safe answer to "was anyone
 * watching" is no.
 */
export function wasObserved(context: ObservationContext): boolean {
  return (
    context.observerGitHubUserId !== null &&
    context.observerIsDistinct &&
    context.observerIsEligibleHuman &&
    context.observerIsNotControlledAlternate
  );
}

/**
 * Nobody saw it. The default, and what a solo private merge produces.
 *
 * Named `NOBODY_OBSERVED` rather than `UNOBSERVED` because the quality module
 * already exports an `UNOBSERVED` signal, and they mean different things: that
 * one is a signal Kreds could not measure, this one is the absence of a person.
 */
export const NOBODY_OBSERVED: ObservationContext = Object.freeze({
  observerGitHubUserId: null,
  observerIsDistinct: false,
  observerIsEligibleHuman: false,
  observerIsNotControlledAlternate: false,
});

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
