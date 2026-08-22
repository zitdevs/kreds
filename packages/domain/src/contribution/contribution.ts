import type { GitHubUserId } from "../primitives/ids.js";
import type {
  ContributionId,
  OrganizationId,
  RepositoryId,
  RulesVersion,
} from "../primitives/ids.js";
import type { Points } from "../primitives/points.js";

/**
 * The kinds of work Kreds recognises.
 *
 * 24: Contribution Points, Points reflect quality, not event count. The ranges
 * live in versioned policy, not here (Law XV).
 */
export type ContributionKind =
  "PULL_REQUEST_MERGED" | "CODE_REVIEW" | "ISSUE_RESOLVED" | "REVIEW_FOLLOW_UP";

/**
 * A recognised piece of verified work.
 *
 * Amendment A02 split recognition from issuance, and this is the recognition
 * half. Law XXVIII: "An activity may earn Contribution Points without being
 * eligible to create or transfer Official KRED."
 *
 * There is no KRED amount on this type, and there is no link from points to a
 * ledger entry. That separation is Law XXVI made structural: the two systems
 * measure different things and must remain independent.
 */
export interface Contribution {
  readonly id: ContributionId;
  readonly kind: ContributionKind;
  /**
   * Attributed to the GitHub identity, not to a Kreds account.
   *
   * 24, Unclaimed identities earn points (A03): "your contribution history also
   * starts before your account does. Points are claimed together with the
   * identity."
   */
  readonly gitHubUserId: GitHubUserId;
  readonly repositoryId: RepositoryId;
  /** `null` for work outside any connected organization. */
  readonly organizationId: OrganizationId | null;
  readonly points: Points;
  /** `0` to `100`. Points are a range over quality, not a counter. */
  readonly qualityScore: number;
  /** Law XV: recognition is versioned too, so a past award stays explainable. */
  readonly rulesVersion: RulesVersion;
  readonly occurredAt: Date;
  /** Set when the underlying work was later invalidated (revert, fraud, reclassification). */
  readonly invalidatedAt: Date | null;
}

/**
 * A user's recognition total in one scope.
 *
 * 24, Scoped globally and per organization: an org can rank engineering
 * contribution "independently of personal KRED wealth, which is usually the
 * ranking a team actually wants".
 */
export interface ContributionScore {
  readonly gitHubUserId: GitHubUserId;
  /** `null` for the global score. */
  readonly organizationId: OrganizationId | null;
  readonly points: Points;
}

/**
 * Whether recognition is owed for this work regardless of whether the economy
 * can pay for it.
 *
 * 24, Recognition does not wait for funding: points are awarded even when the
 * KRED reward is `AWAITING FUNDING`. "This is the practical payoff of the
 * split: a reviewer whose author is broke is no longer told, implicitly, that
 * their review was worth nothing."
 */
export function recognitionSurvivesUnfundedReward(): true {
  return true;
}
