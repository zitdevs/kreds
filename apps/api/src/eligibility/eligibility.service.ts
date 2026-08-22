import { Injectable, Logger } from "@nestjs/common";

import { EventStore, InstallationRepository } from "@kreds/database";
import {
  evaluateEligibility,
  isStructurallyIndependentReviewer,
  type EligibilityResult,
  type PullRequestMerged,
  type RepositoryContext,
  type ReviewSubmitted,
} from "@kreds/domain";
import { currentPolicy } from "@kreds/policy";

export interface LocalEligibility extends EligibilityResult {
  /** Law XV: the version that decided travels with the decision. */
  readonly rulesVersion: string;
  /**
   * Always absent.
   *
   * The published policy withholds the multipliers, so Core has no number to
   * give. This field exists to make that visible at the call site rather than
   * inviting somebody to compute one: an instance that pays out in its own
   * local currency supplies its own multiplier, and the Official one comes from
   * the Network.
   */
  readonly multiplier: null;
}

/**
 * Layer 2, locally.
 *
 * Answers *may this affect an economy?* and stops. It never prices anything,
 * and it never claims to speak for Official KRED:
 *
 * > Core may say "locally eligible", but only the Network can say "eligible for
 * > Official KRED".
 *
 * That is not a convention here, it is a consequence of what this file can
 * reach. It has no ledger, no balance, and no multiplier, so the strongest
 * statement it is capable of making is the correct one.
 */
@Injectable()
export class EligibilityService {
  private readonly logger = new Logger(EligibilityService.name);

  constructor(
    private readonly events: EventStore,
    private readonly installations: InstallationRepository,
  ) {}

  /**
   * Evaluate a merge against the published matrix.
   *
   * Runs after recognition and independently of it. 25's core rule is that the
   * two are separate standards, so a merge can be worth points and worth
   * nothing economically at the same time without the systems disagreeing.
   */
  async forMerge(event: PullRequestMerged): Promise<LocalEligibility> {
    const policy = currentPolicy();
    const repository = await this.installations.findRepository(Number(event.repositoryId));

    // A repository Kreds has no record of cannot be placed in any context, and
    // guessing one would be guessing the answer. Fail closed.
    if (!repository) {
      return {
        status: "INELIGIBLE",
        outcome: "NONE",
        reasons: ["NO_MATCHING_RULE"],
        rulesVersion: policy.rulesVersion,
        multiplier: null,
      };
    }

    const context: RepositoryContext = repository.isPersonallyOwned
      ? repository.isPrivate
        ? "PERSONAL_PRIVATE"
        : "PERSONAL_PUBLIC"
      : repository.isPrivate
        ? "ORGANIZATION_PRIVATE"
        : "ORGANIZATION_PUBLIC";

    const result = evaluateEligibility(
      {
        context,
        hasEligibleReview: await this.hasEligibleReview(event),
        trustTier: repository.trustTier,
        actorCanEarn: policy.actorTypes.eligible.includes(event.authorActorType),
        isPrivate: repository.isPrivate,
      },
      policy.mergeEligibility.matrix,
    );

    this.logger.log(
      `Merge ${event.idempotencyKey} in ${context} is ${result.status} (${result.outcome}): ${result.reasons.join(", ")}.`,
    );

    return { ...result, rulesVersion: policy.rulesVersion, multiplier: null };
  }

  /**
   * Whether a review exists that can establish economic validation.
   *
   * Only the structural half. 25 lists seven requirements for an eligible
   * reviewer, and three of them, minimum Kreds trust, farming and collusion
   * flags, and organization policy, belong to the Risk Engine and are
   * deliberately not evaluated here. This returning `true` is necessary and
   * never sufficient, which is why the Network re-decides rather than trusting
   * it.
   */
  private async hasEligibleReview(event: PullRequestMerged): Promise<boolean> {
    const reviews = await this.events.findReviewsFor(
      Number(event.repositoryId),
      event.pullRequestNumber,
    );

    return reviews.some((candidate) => {
      if (candidate.type !== "REVIEW_SUBMITTED") return false;
      const review = candidate as ReviewSubmitted;
      return isStructurallyIndependentReviewer(
        {
          reviewerGitHubUserId: review.reviewerGitHubUserId,
          reviewerActorType: review.reviewerActorType,
          afterMerge: review.afterMerge,
          state: review.state,
        },
        {
          authorGitHubUserId: event.authorGitHubUserId,
          coAuthorGitHubUserIds: event.coAuthorGitHubUserIds,
        },
      );
    });
  }
}
