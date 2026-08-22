import type { EconomyId, OrganizationId, RulesVersion, SeasonId } from "../primitives/ids.js";

/**
 * A published, versioned set of economic rules.
 *
 * Law XV, Rules May Change, History May Not: "Economic rules are versioned and
 * forward-only." 13: Rules and Versioning states the consequence plainly:
 * "Rules are data, not code."
 *
 * So this type describes *where a version came from and when it applies*, and
 * carries none of the numbers. Curves, weights, caps and thresholds live in
 * versioned policy documents that the engines load, which is also what keeps
 * unpublished operational values out of this repository.
 */
export interface PolicyVersion {
  readonly version: RulesVersion;
  /**
   * When this version starts pricing activity.
   *
   * 13: an event that arrives late is priced under the rules in force **when
   * the activity occurred**, not when the event was processed. "Processing
   * delay is an infrastructure detail and must never be economically visible."
   */
  readonly effectiveFrom: Date;
  /** `null` while current. Superseded versions are retained, never deleted. */
  readonly supersededAt: Date | null;
  /** Why this version exists. No silent monetary policy changes. */
  readonly reason: string;
  /** When members were told, which 13 requires to happen before it takes effect. */
  readonly announcedAt: Date | null;
}

/**
 * The policy in force for one economy.
 *
 * An organization may configure its own economy within what the network allows
 * (Law XI for independent economies, 14 for sovereign ones), but it does not
 * get to reprice history any more than the network does.
 */
export interface Policy {
  readonly economyId: EconomyId;
  readonly organizationId: OrganizationId | null;
  readonly version: RulesVersion;
  readonly reviewLiabilityMode: import("../economy/account.js").ReviewLiabilityMode;
}

/**
 * Select the version that governs an activity.
 *
 * Law XV again: pricing follows the moment the work happened. A version whose
 * `effectiveFrom` is later than the activity never applies to it, in either
 * direction, because "both mean your balance can change based on decisions you
 * had no part in".
 */
export function versionInForceAt(
  versions: readonly PolicyVersion[],
  occurredAt: Date,
): PolicyVersion | null {
  const applicable = versions
    .filter((candidate) => candidate.effectiveFrom.getTime() <= occurredAt.getTime())
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return applicable[0] ?? null;
}

/**
 * A bounded competitive period.
 *
 * 12: Leaderboards and Seasons. A season scopes a leaderboard; it does not
 * scope the ledger, and it never resets a balance. Law XIII's principle, that
 * joining does not rewrite history, applies with equal force to a season
 * rolling over.
 */
export interface Season {
  readonly id: SeasonId;
  readonly economyId: EconomyId;
  readonly organizationId: OrganizationId | null;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly rulesVersion: RulesVersion;
}

export function isSeasonActive(season: Season, at: Date): boolean {
  const instant = at.getTime();
  return instant >= season.startsAt.getTime() && instant < season.endsAt.getTime();
}
