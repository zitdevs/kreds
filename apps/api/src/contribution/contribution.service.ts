import { Injectable, Logger } from "@nestjs/common";

import { ContributionLedger, IdentityRepository, InstallationRepository } from "@kreds/database";
import {
  isHealthySize,
  pointsFor,
  score,
  UNOBSERVED,
  type ContributionKind,
  type DomainEvent,
  type PullRequestMerged,
  type ReviewSubmitted,
  type Signal,
} from "@kreds/domain";
import { currentPolicy } from "@kreds/policy";

/** Why a contribution was not recognised, when it was not. */
export type SkipReason =
  "NOT_A_CONTRIBUTION" | "ACTOR_CANNOT_EARN" | "REVIEW_AFTER_MERGE" | "SELF_REVIEW";

export interface RecognitionResult {
  readonly recognised: boolean;
  readonly reason?: SkipReason;
  readonly points?: number;
  readonly qualityScore?: number;
}

/**
 * Recognition, which is not payment.
 *
 * Amendment A02 split the two, and this is the recognition half. Nothing here
 * touches money: there is no ledger entry, no balance, no amount. Law XXVI
 * keeps the systems independent, and the way it is kept is by this file having
 * no way to reach the other one.
 *
 * > **Kreds recognizes more work than it monetizes.**
 *
 * That principle is why this runs before, and independently of, any eligibility
 * check. A merge in a repository that will never be allowed to create KRED
 * still happened, and the person who did it is still credited for it.
 */
@Injectable()
export class ContributionService {
  private readonly logger = new Logger(ContributionService.name);

  constructor(
    private readonly ledger: ContributionLedger,
    private readonly identities: IdentityRepository,
    private readonly installations: InstallationRepository,
  ) {}

  /**
   * Recognise the work a domain event describes, if it describes any.
   *
   * Idempotent through the ledger, so a replayed webhook recognises the same
   * merge once.
   */
  async recognise(event: DomainEvent): Promise<RecognitionResult> {
    switch (event.type) {
      case "PULL_REQUEST_MERGED":
        return this.recogniseMerge(event);
      case "REVIEW_SUBMITTED":
        return this.recogniseReview(event);
      default:
        return { recognised: false, reason: "NOT_A_CONTRIBUTION" };
    }
  }

  private async recogniseMerge(event: PullRequestMerged): Promise<RecognitionResult> {
    const policy = currentPolicy();

    // Law XVI, and 03's asymmetry: an unclassified actor fails closed toward
    // restriction. Recorded first so that the classification is on file even
    // when nothing is awarded.
    await this.remember(event.authorGitHubUserId, event.authorLogin, event.authorActorType);
    if (!this.canEarn(event.authorActorType)) {
      return { recognised: false, reason: "ACTOR_CANNOT_EARN" };
    }

    const size = policy.pullRequest.size ?? undefined;
    const signals: Record<string, Signal | undefined> = {
      // Kreds does not ask for the checks permission and does not subscribe to
      // review threads, so these are genuinely unknown rather than absent.
      checksPassed: UNOBSERVED,
      noUnresolvedThreads: UNOBSERVED,
      requiredApprovals: UNOBSERVED,
      meaningfulDescription: event.signals.hasDescription,
      linkedIssue: event.signals.linksIssue,
      healthySize:
        event.signals.changedLines === null || size === undefined
          ? UNOBSERVED
          : isHealthySize(event.signals.changedLines, size),
    };

    const quality = score(signals, policy.pullRequest.merge.qualityWeights);
    return this.record(event, "PULL_REQUEST_MERGED", event.authorGitHubUserId, quality, [
      policy.contributionPoints.ranges.mergedPr[0],
      policy.contributionPoints.ranges.mergedPr[1],
    ]);
  }

  private async recogniseReview(event: ReviewSubmitted): Promise<RecognitionResult> {
    const policy = currentPolicy();

    await this.remember(event.reviewerGitHubUserId, event.reviewerLogin, event.reviewerActorType);
    if (!this.canEarn(event.reviewerActorType)) {
      return { recognised: false, reason: "ACTOR_CANNOT_EARN" };
    }

    // A03: "A post-merge review does not retroactively create eligibility." The
    // published policy prices it at zero, and recognition follows: a review
    // that arrived after the decision was made did not inform it.
    if (event.afterMerge && policy.codeReview.afterMergeValue === 0) {
      return { recognised: false, reason: "REVIEW_AFTER_MERGE" };
    }

    // Reviewing your own work is not review. Law XXXIV is the general form of
    // this, and the policy prices it at zero.
    if (event.reviewerGitHubUserId === event.authorGitHubUserId) {
      return { recognised: false, reason: "SELF_REVIEW" };
    }

    const signals: Record<string, Signal | undefined> = {
      // Depth, timeliness, whether the review was requested, and whether it was
      // followed up all need data Kreds does not collect yet. Timeliness in
      // particular depends on multipliers the policy withholds.
      depth: UNOBSERVED,
      timeliness: UNOBSERVED,
      wasRequested: UNOBSERVED,
      followUp: UNOBSERVED,
      relevantComments: event.signals.hasBody,
      outcome: event.state === "APPROVED" || event.state === "CHANGES_REQUESTED",
    };

    const quality = score(signals, policy.codeReview.qualityWeights);
    return this.record(event, "CODE_REVIEW", event.reviewerGitHubUserId, quality, [
      policy.contributionPoints.ranges.codeReview[0],
      policy.contributionPoints.ranges.codeReview[1],
    ]);
  }

  /**
   * Put the award on the ledger.
   *
   * The idempotency key is the domain event's own, so recognition inherits the
   * pipeline's guarantee: the same fact recognised once, whichever delivery
   * carried it.
   */
  private async record(
    event: DomainEvent,
    kind: ContributionKind,
    gitHubUserId: PullRequestMerged["authorGitHubUserId"],
    quality: ReturnType<typeof score>,
    range: readonly [number, number],
  ): Promise<RecognitionResult> {
    const awarded = pointsFor(quality.score, range);
    const repository = await this.installations.findRepository(Number(event.repositoryId));

    const result = await this.ledger.award({
      idempotencyKey: event.idempotencyKey,
      kind,
      gitHubUserId,
      repositoryId: repository?.id ?? null,
      organizationId: repository?.organizationId ?? null,
      points: awarded,
      qualityScore: quality.score,
      unobservedSignals: quality.unobserved,
      rulesVersion: currentPolicy().rulesVersion,
      occurredAt: new Date(event.occurredAt),
    });

    if (result.isNew) {
      this.logger.log(
        `Recognised ${kind} for ${gitHubUserId}: ${awarded} points at quality ${quality.score}, ${quality.unobserved.length} signals unobserved.`,
      );
    }
    return { recognised: result.isNew, points: awarded, qualityScore: quality.score };
  }

  /**
   * Record the identity and what GitHub said it is.
   *
   * Done for every actor, including ones that cannot earn, because knowing an
   * account is a bot is worth storing: it is what stops the next event asking
   * the question again, and it is what a later reclassification updates.
   */
  private async remember(
    gitHubUserId: PullRequestMerged["authorGitHubUserId"],
    login: string,
    actorType: PullRequestMerged["authorActorType"],
  ): Promise<void> {
    await this.identities.observe({ gitHubUserId, login });
    if (actorType !== "UNKNOWN") {
      await this.identities.classify(gitHubUserId, actorType);
    }
  }

  /** Law XVI: only a human earns, and unknown fails closed. */
  private canEarn(actorType: PullRequestMerged["authorActorType"]): boolean {
    return currentPolicy().actorTypes.eligible.includes(actorType);
  }
}
