import { z } from "zod";

import {
  buildIdempotencyKey,
  fromIso,
  gitHubInstallationId,
  gitHubUserId,
  repositoryId as toRepositoryId,
  type DomainEvent,
  type GitHubUserId,
} from "@kreds/domain";

/**
 * Turns what GitHub sent into what Kreds understood.
 *
 * Everything above this file consumes `DomainEvent` and never a raw payload,
 * which is the point of the layer. GitHub's shapes change, describe the same
 * fact more than one way, and carry a great deal that is none of our business.
 * Scoring code written against `payload.pull_request.merged_at` breaks the day
 * GitHub ships a field, and reads personal data it was never meant to see on
 * every other day.
 */

const actor = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  type: z.string().optional(),
});

const pullRequest = z.object({
  number: z.number().int().positive(),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  base: z.object({ ref: z.string().min(1) }).optional(),
  user: actor,
  merged_by: actor.nullable().optional(),
});

const repository = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1),
  default_branch: z.string().min(1).optional(),
});

const installation = z.object({ id: z.number().int().positive() });

const pullRequestEvent = z.object({
  action: z.string().min(1),
  pull_request: pullRequest,
  repository,
  installation,
});

const reviewEvent = z.object({
  action: z.string().min(1),
  review: z.object({
    id: z.number().int().positive(),
    state: z.string().min(1),
    submitted_at: z.string().nullable().optional(),
    user: actor,
  }),
  pull_request: pullRequest,
  repository,
  installation,
});

/**
 * GitHub's review states arrive lowercase and include values the domain does
 * not model. Anything unrecognised becomes `COMMENTED`, the state that carries
 * no economic weight, because guessing upward would hand someone an approval
 * they did not give.
 */
function reviewState(raw: string): "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" {
  switch (raw.toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "CHANGES_REQUESTED":
      return "CHANGES_REQUESTED";
    case "DISMISSED":
      return "DISMISSED";
    default:
      return "COMMENTED";
  }
}

/**
 * Co-authors are deliberately empty here, and that is a known gap rather than
 * an oversight.
 *
 * GitHub does not put `Co-authored-by:` trailers in the webhook payload. They
 * live in commit messages, which means an authenticated call per merged pull
 * request to read them. Until that exists, this returns nothing rather than
 * guessing, because 03 pays co-authors and an invented list would pay the wrong
 * people while a silently empty one only delays paying the right ones.
 *
 * The delay is visible: the field is present and empty, so nothing downstream
 * can mistake "not looked up yet" for "there were none".
 */
const CO_AUTHORS_NOT_YET_RESOLVED: readonly GitHubUserId[] = [];

/**
 * @returns the fact this delivery describes, or `null` when it describes
 * nothing Kreds reads. `null` is an ordinary answer: GitHub sends every event
 * the App subscribes to, and most of them are not economic.
 */
export function normalize(eventType: string, payload: unknown): DomainEvent | null {
  switch (eventType) {
    case "pull_request":
      return normalizePullRequest(payload);
    case "pull_request_review":
      return normalizeReview(payload);
    default:
      return null;
  }
}

function normalizePullRequest(payload: unknown): DomainEvent | null {
  const parsed = pullRequestEvent.safeParse(payload);
  if (!parsed.success) return null;
  const { action, pull_request: pr, repository: repo, installation: app } = parsed.data;

  // Only a closure is a fact worth recording. Opened, edited and synchronised
  // describe work in progress, and 03 prices merges rather than attempts.
  if (action !== "closed") return null;

  const base = {
    occurredAt: fromIso(pr.merged_at ?? pr.closed_at ?? new Date().toISOString()),
    // The repository's own uuid is resolved by the caller, which knows the
    // database. Here it is GitHub's numeric id, stringified, so the normaliser
    // stays a pure function of the payload.
    repositoryId: toRepositoryId(String(repo.id)),
    gitHubInstallationId: gitHubInstallationId(app.id),
    pullRequestNumber: pr.number,
    authorGitHubUserId: gitHubUserId(pr.user.id),
  };

  if (!pr.merged) {
    return {
      ...base,
      type: "PULL_REQUEST_CLOSED",
      idempotencyKey: buildIdempotencyKey("PULL_REQUEST_CLOSED", repo.id, pr.number),
    };
  }

  return {
    ...base,
    type: "PULL_REQUEST_MERGED",
    idempotencyKey: buildIdempotencyKey("PULL_REQUEST_MERGED", repo.id, pr.number),
    coAuthorGitHubUserIds: CO_AUTHORS_NOT_YET_RESOLVED,
    // A merge into a side branch is not the same economic event as one into the
    // trunk. When GitHub does not say what the default branch is, this is false
    // rather than true: 25 gates issuance, and the safe direction is to withhold.
    mergedToPrimaryBranch:
      repo.default_branch !== undefined && pr.base?.ref === repo.default_branch,
    mergedByGitHubUserId: pr.merged_by ? gitHubUserId(pr.merged_by.id) : null,
  };
}

function normalizeReview(payload: unknown): DomainEvent | null {
  const parsed = reviewEvent.safeParse(payload);
  if (!parsed.success) return null;
  const { action, review, pull_request: pr, repository: repo, installation: app } = parsed.data;

  if (action !== "submitted") return null;

  const submittedAt = review.submitted_at ?? new Date().toISOString();

  return {
    type: "REVIEW_SUBMITTED",
    // Keyed on GitHub's review id, which is stable and unique. Keying on the
    // reviewer and pull request instead would collapse a reviewer's second,
    // substantive review into their first drive-by comment.
    idempotencyKey: buildIdempotencyKey("REVIEW_SUBMITTED", review.id),
    occurredAt: fromIso(submittedAt),
    repositoryId: toRepositoryId(String(repo.id)),
    gitHubInstallationId: gitHubInstallationId(app.id),
    pullRequestNumber: pr.number,
    reviewerGitHubUserId: gitHubUserId(review.user.id),
    authorGitHubUserId: gitHubUserId(pr.user.id),
    state: reviewState(review.state),
    // A03: "A post-merge review does not retroactively create eligibility."
    afterMerge:
      pr.merged_at !== null && pr.merged_at !== undefined
        ? new Date(submittedAt) > new Date(pr.merged_at)
        : false,
  };
}
