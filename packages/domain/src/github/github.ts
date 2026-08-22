import type { ActorType } from "../identity/identity.js";
import type {
  GitHubUserId,
  OrganizationId,
  PullRequestId,
  RepositoryId,
  ReviewId,
} from "../primitives/ids.js";

/**
 * A connected GitHub Organization.
 *
 * 02: GitHub Organizations and Economic Boundaries: one Kreds Team is one
 * GitHub Organization, and the org is "the default **economic boundary** of a
 * Kreds Team" (Law IV).
 *
 * The boundary is tied to a GitHub org rather than a Kreds-native group because
 * "the org already carries real-world cost and friction", and inherits whatever
 * legitimacy it has.
 */
export interface Organization {
  readonly id: OrganizationId;
  readonly gitHubOrganizationId: number;
  readonly login: string;
  readonly connectedAt: Date;
}

/**
 * How much economic legitimacy a repository has established.
 *
 * 25: Repository Economic Eligibility, Trust tiers. Public repositories only.
 * The exact thresholds and multipliers are operational policy and are not
 * published, so this type carries the tier and nothing that would reveal how it
 * was reached.
 */
export type RepositoryTrustTier =
  /** Very new, little or no external activity. No no-review merge eligibility. */
  | "UNTRUSTED"
  /** Legitimate history, limited external relevance. Reduced. */
  | "ESTABLISHED"
  /** Meaningful external participation. Partial to high. */
  | "RELEVANT"
  /** Established community project. Full (Law XXXIII). */
  | "HIGH_TRUST";

export interface Repository {
  readonly id: RepositoryId;
  readonly gitHubRepositoryId: number;
  readonly organizationId: OrganizationId | null;
  readonly nameWithOwner: string;
  readonly isPrivate: boolean;
  /** Whether the owner is a personal account rather than an organization. */
  readonly isPersonallyOwned: boolean;
  /**
   * Multi-signal trust, never a threshold on one number.
   *
   * Law XXXI, Repository Relevance Is Multi-Signal: "GitHub stars may influence
   * repository trust, but no single popularity metric defines economic
   * legitimacy." Any single metric that unlocks issuance becomes a market.
   */
  readonly trustTier: RepositoryTrustTier;
  readonly primaryBranch: string;
}

/**
 * Whether an event may affect the KRED economy.
 *
 * Glossary: "`ELIGIBLE`, `REDUCED`, or `INELIGIBLE`". This is Layer 2 of the
 * three-layer model, and 25 is emphatic that it is a different question from
 * Layer 3: "Layer 2 asks *may this create money?* Layer 3 asks *whose money,
 * and when?* Collapsing them is how the original design ended up minting from
 * self-merges."
 */
export type EconomicEligibility = "ELIGIBLE" | "REDUCED" | "INELIGIBLE";

export interface PullRequest {
  readonly id: PullRequestId;
  readonly repositoryId: RepositoryId;
  readonly number: number;
  readonly authorGitHubUserId: GitHubUserId;
  readonly authorActorType: ActorType;
  /** Verified human co-authors. Bots, AI agents and GitHub Apps are excluded (03). */
  readonly coAuthorGitHubUserIds: readonly GitHubUserId[];
  readonly mergedAt: Date | null;
  readonly closedAt: Date | null;
  /** Whether the merge landed on the repository's configured primary branch. */
  readonly mergedToPrimaryBranch: boolean;
  /** `0` to `100`. Drives the reward curve and the points range alike. */
  readonly qualityScore: number | null;
}

/**
 * The state a review carries.
 *
 * 04: Code Reviews. A review that is not meaningful, a bare approval or a
 * re-approval with no diff change, is not the same economic event as one that
 * is (Glossary, Meaningful review).
 */
export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

export interface Review {
  readonly id: ReviewId;
  readonly pullRequestId: PullRequestId;
  readonly repositoryId: RepositoryId;
  readonly reviewerGitHubUserId: GitHubUserId;
  readonly reviewerActorType: ActorType;
  readonly state: ReviewState;
  readonly submittedAt: Date;
  /** Whether the review landed after the pull request was merged. */
  readonly afterMerge: boolean;
  /** `0` to `100`. Drives the review transfer value. */
  readonly qualityScore: number | null;
}

/**
 * Whether a review can establish economic validation for otherwise untrusted
 * work.
 *
 * Law XXXII, Human Review Can Establish Economic Validation, gated by
 * Law XXXIV, Alternate Accounts Cannot Legitimize Self-Directed Work: "The
 * reviewer used to unlock eligibility must be a genuinely independent, trusted,
 * human identity."
 *
 * 25 lists seven requirements for an eligible reviewer. Three of them are
 * structural and decided here: distinct identity, classified `HUMAN`, and a
 * review that is not a self-review. The remaining four, minimum trust, farming
 * flags, related-identity detection, and org policy, belong to the Risk Engine
 * and are deliberately not implemented in this package. A caller must satisfy
 * both.
 */
export function isStructurallyIndependentReviewer(
  review: Pick<Review, "reviewerGitHubUserId" | "reviewerActorType">,
  pullRequest: Pick<PullRequest, "authorGitHubUserId" | "coAuthorGitHubUserIds">,
): boolean {
  if (review.reviewerActorType !== "HUMAN") return false;
  if (review.reviewerGitHubUserId === pullRequest.authorGitHubUserId) return false;
  return !pullRequest.coAuthorGitHubUserIds.includes(review.reviewerGitHubUserId);
}
