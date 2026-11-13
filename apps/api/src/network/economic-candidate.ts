import type { PullRequestMerged, ReviewSubmitted } from "@kreds/domain";
import type { EconomicCandidate } from "@kreds/network-client";

/** The events Core offers the Network: every `CandidateKind` the protocol defines. */
export type SubmittableEvent = PullRequestMerged | ReviewSubmitted;

/**
 * What Core knows about the repository, from its own records.
 *
 * Core's records, not a claim anybody made: the repository row was written from
 * a GitHub webhook or a delegated query, the two channels Law XXXV allows.
 */
export interface RepositoryFacts {
  readonly gitHubRepositoryId: number;
  readonly isPrivate: boolean;
  readonly isPersonallyOwned: boolean;
  /** `null` for a personal repository, which forms no Team (02). */
  readonly gitHubOrganizationId: number | null;
}

/**
 * The structural facts about a merge Core can establish without any policy.
 *
 * Only the structural half. Whether a reviewer is trusted is the Network's
 * question (Law XXXIV), and the protocol has nowhere to assert it.
 */
export interface MergeStructure {
  readonly hasIndependentHumanReview: boolean;
}

/**
 * Turn a recorded fact into the protocol's `EconomicCandidate`.
 *
 * Evidence, and only evidence. "Core submits evidence. Network decides money."
 * 15: "The network can accept *events* from an instance it does not control,
 * but never *mint commands*." So there is no amount, no score, no multiplier and
 * none of the quality signals Core scores Contribution Points from: 19, "Never
 * trust frontend clients to calculate rewards", and to the Network Core is
 * exactly such a client.
 *
 * The Network re-decides from its own records and never from this (Law XXXV:
 * "No client, browser extension, local agent, or self-hosted node may originate
 * an economic claim"). What a candidate does is point at the fact, by the key
 * that makes asking twice safe.
 */
export function economicCandidateFor(
  event: PullRequestMerged,
  repository: RepositoryFacts,
  structure: MergeStructure,
): EconomicCandidate;
export function economicCandidateFor(
  event: ReviewSubmitted,
  repository: RepositoryFacts,
): EconomicCandidate;
export function economicCandidateFor(
  event: SubmittableEvent,
  repository: RepositoryFacts,
  structure?: MergeStructure,
): EconomicCandidate {
  const common = {
    idempotencyKey: event.idempotencyKey,
    kind: event.type,
    occurredAt: new Date(event.occurredAt).toISOString(),
    repository: {
      gitHubRepositoryId: repository.gitHubRepositoryId,
      isPrivate: repository.isPrivate,
      isPersonallyOwned: repository.isPersonallyOwned,
    },
    ...(repository.gitHubOrganizationId === null
      ? {}
      : { organization: { gitHubOrganizationId: repository.gitHubOrganizationId } }),
  };

  if (event.type === "PULL_REQUEST_MERGED") {
    return {
      ...common,
      actor: { gitHubUserId: event.authorGitHubUserId, actorType: event.authorActorType },
      structure: {
        mergedToPrimaryBranch: event.mergedToPrimaryBranch,
        hasIndependentHumanReview: structure?.hasIndependentHumanReview ?? false,
        coAuthorGitHubUserIds: [...event.coAuthorGitHubUserIds],
      },
    };
  }

  return {
    ...common,
    actor: { gitHubUserId: event.reviewerGitHubUserId, actorType: event.reviewerActorType },
    structure: { reviewerGitHubUserId: event.reviewerGitHubUserId },
  };
}
