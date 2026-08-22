import type { ActorType } from "../identity/identity.js";
import type {
  GitHubInstallationId,
  GitHubUserId,
  IdempotencyKey,
  RepositoryId,
} from "../primitives/ids.js";
import type { Timestamp } from "../primitives/time.js";

/**
 * What Kreds understood, as opposed to what GitHub sent.
 *
 * Everything above the ingestion layer consumes these and never a raw webhook
 * payload. The reason is not tidiness: GitHub's shapes change, carry a great
 * deal that is none of our business, and describe the same fact in more than
 * one way. Scoring code written against `payload.pull_request.merged_at` is
 * scoring code that breaks when GitHub ships a field, and that quietly reads
 * personal data it was never meant to see.
 */
export type DomainEventType =
  | "PULL_REQUEST_MERGED"
  | "PULL_REQUEST_CLOSED"
  | "REVIEW_SUBMITTED"
  | "REPOSITORY_CONNECTED"
  | "REPOSITORY_DISCONNECTED";

interface BaseDomainEvent {
  /**
   * The identity of the **fact**, not of the delivery.
   *
   * This is the load-bearing field of the whole pipeline. GitHub retries a
   * failed delivery with the same delivery id, which a unique column catches,
   * but a human pressing "Redeliver" in the App settings produces a *new*
   * delivery id describing the same event. So does a backfill. Keying
   * idempotency on the delivery would let either of those pay someone twice.
   *
   * 06: Ledger, Idempotency. The key is derived from the fact itself: this
   * pull request, merged. Deriving it twice from the same fact gives the same
   * key, whichever delivery carried it.
   */
  readonly idempotencyKey: IdempotencyKey;
  readonly occurredAt: Timestamp;
  readonly repositoryId: RepositoryId;
  readonly gitHubInstallationId: GitHubInstallationId;
}

export interface PullRequestMerged extends BaseDomainEvent {
  readonly type: "PULL_REQUEST_MERGED";
  readonly pullRequestNumber: number;
  readonly authorGitHubUserId: GitHubUserId;
  /**
   * What GitHub said the author is.
   *
   * Carried on the event rather than looked up later, because it is part of
   * what Kreds understood at the time. Law XVI decides from it, and 03 requires
   * `UNKNOWN` to fail closed toward restriction.
   */
  readonly authorActorType: ActorType;
  readonly authorLogin: string;
  /** Verified human co-authors only. Bots and Apps are excluded upstream (03). */
  readonly coAuthorGitHubUserIds: readonly GitHubUserId[];
  readonly mergedToPrimaryBranch: boolean;
  readonly mergedByGitHubUserId: GitHubUserId | null;
  /**
   * The quality signals Kreds could read from the payload.
   *
   * Only structural facts live here: a body is empty or it is not, a reference
   * to an issue is present or it is not, a diff is a size the published bands
   * name. Anything needing a threshold Kreds cannot cite is deliberately absent
   * rather than guessed, and absent scores as not met.
   */
  readonly signals: {
    /** `null` when GitHub did not report the diff size. */
    readonly changedLines: number | null;
    readonly hasDescription: boolean;
    readonly linksIssue: boolean;
  };
}

export interface PullRequestClosed extends BaseDomainEvent {
  readonly type: "PULL_REQUEST_CLOSED";
  readonly pullRequestNumber: number;
  readonly authorGitHubUserId: GitHubUserId;
  readonly authorActorType: ActorType;
  readonly authorLogin: string;
}

export interface ReviewSubmitted extends BaseDomainEvent {
  readonly type: "REVIEW_SUBMITTED";
  readonly pullRequestNumber: number;
  readonly reviewerGitHubUserId: GitHubUserId;
  readonly reviewerActorType: ActorType;
  readonly reviewerLogin: string;
  readonly authorGitHubUserId: GitHubUserId;
  readonly state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";
  /** Whether the review landed after the pull request was merged (A03). */
  readonly afterMerge: boolean;
  readonly signals: {
    /** Whether the reviewer wrote anything, as opposed to a bare state change. */
    readonly hasBody: boolean;
  };
}

export interface RepositoryConnected extends BaseDomainEvent {
  readonly type: "REPOSITORY_CONNECTED";
  readonly nameWithOwner: string;
}

export interface RepositoryDisconnected extends BaseDomainEvent {
  readonly type: "REPOSITORY_DISCONNECTED";
  readonly nameWithOwner: string;
}

export type DomainEvent =
  | PullRequestMerged
  | PullRequestClosed
  | ReviewSubmitted
  | RepositoryConnected
  | RepositoryDisconnected;

/**
 * How a raw delivery is progressing through the pipeline.
 *
 * `IGNORED` is not a failure and is kept apart from one on purpose. Most of
 * what GitHub sends is something Kreds does not read, and if that were recorded
 * as `FAILED` the failure count would be permanently meaningless, which is the
 * same as having no failure count at all.
 */
export type EventStatus = "RECEIVED" | "QUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";

export const EVENT_STATUSES = [
  "RECEIVED",
  "QUEUED",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "IGNORED",
] as const satisfies readonly EventStatus[];

/**
 * Build the key that identifies a fact.
 *
 * Deliberately a pure function of what happened, with no timestamp of receipt,
 * no delivery id and no random component. Two calls describing the same merge
 * must produce the same string a year apart, on a different machine, during a
 * backfill.
 *
 * The parts are joined with a separator none of them may contain, and that
 * restriction is enforced rather than assumed. Without it `("1", "23")` and
 * `("12", "3")` both render as `1:23`, two different events deduplicate into
 * one, and at this layer that means one of two people never gets paid.
 */
const SEPARATOR = ":";

export function buildIdempotencyKey(
  type: DomainEventType,
  ...parts: readonly (string | number)[]
): IdempotencyKey {
  for (const part of parts) {
    const text = String(part);
    if (text === "" || text.includes(SEPARATOR)) {
      throw new RangeError(
        `idempotency key parts must be non-empty and must not contain "${SEPARATOR}": received "${text}".`,
      );
    }
  }
  return [type, ...parts.map(String)].join(SEPARATOR) as IdempotencyKey;
}
