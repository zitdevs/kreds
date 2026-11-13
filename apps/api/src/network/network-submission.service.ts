import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  InstallationRepository,
  NetworkSubmissions,
  type DueSubmission,
  type NetworkDecisionRecord,
} from "@kreds/database";
import type { EconomicCandidate } from "@kreds/network-client";

import { EligibilityService } from "../eligibility/eligibility.service.js";
import {
  economicCandidateFor,
  type RepositoryFacts,
  type SubmittableEvent,
} from "./economic-candidate.js";
import { NETWORK_CONNECTION, type NetworkConnection } from "./network-connection.js";

export type OfferOutcome =
  /** No Network configured: nothing recorded, exactly as before Core could submit. */
  | "OFFLINE"
  /** Law XXIX: private work has no Official value, so it is not sent. */
  | "PRIVATE"
  /** Core has no record of the repository and does not guess one. */
  | "UNKNOWN_REPOSITORY"
  /** Recorded now, and offered to the Network without waiting for it. */
  | "RECORDED"
  /** Already on file. The retry sweep owns it from here. */
  | "ALREADY_RECORDED"
  /** Recording failed. Logged, and never thrown at ingestion. */
  | "FAILED";

export type SubmitOutcome = "OFFLINE" | "DECIDED" | "UNANSWERED";

const OUTCOMES: ReadonlySet<string> = new Set(["ISSUED", "DECLINED", "DEFERRED"]);
const REASONS: ReadonlySet<string> = new Set([
  "ISSUED",
  "NOT_ELIGIBLE",
  "ACTOR_CANNOT_EARN",
  "REPOSITORY_NOT_ELIGIBLE",
  "REQUIRES_INDEPENDENT_REVIEW",
  "ALREADY_DECIDED",
  "UNDER_REVIEW",
  "DECLINED",
]);

/**
 * Core's half of "Core submits evidence. Network decides money."
 *
 * Builds the protocol's `EconomicCandidate` for a fact Core recorded, keeps it,
 * offers it to the Network, and files the Network's answer next to it. That is
 * the whole job. A decision moves no balance, no ledger entry and no
 * Contribution Point: Law I, "Official KREDS can only be issued by the Kreds
 * Network", and Core acting on an issuance is a later, separate step.
 *
 * Ingestion must never fail or wait on the Network. `offer` records the
 * candidate in Core's own database and returns; the request to the Network runs
 * after, and a Network that is down or slow leaves the candidate unsubmitted
 * for the retry sweep. `NetworkUnavailableError` is never a decision: "treating
 * an outage as a decline would silently deny people work they had earned".
 */
@Injectable()
export class NetworkSubmissionService {
  private readonly logger = new Logger(NetworkSubmissionService.name);
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    @Inject(NETWORK_CONNECTION) private readonly connection: NetworkConnection,
    private readonly submissions: NetworkSubmissions,
    private readonly installations: InstallationRepository,
    private readonly eligibility: EligibilityService,
  ) {}

  /**
   * Record a fact as a candidate and offer it, without waiting for an answer.
   *
   * Never rejects. Whatever goes wrong here is logged and reported as an
   * outcome, because the caller is the ingestion pipeline and a Network problem
   * must never mark a delivery failed.
   */
  async offer(event: SubmittableEvent): Promise<OfferOutcome> {
    if (!this.connection.connected) return "OFFLINE";

    try {
      const repository = await this.repositoryFacts(Number(event.repositoryId));
      if (!repository) {
        this.logger.debug(`No repository record for ${event.idempotencyKey}; not offered.`);
        return "UNKNOWN_REPOSITORY";
      }
      // Law XXIX: "Activity in a private repository, personal or organizational,
      // creates no Official KRED, with or without review." The Network has
      // nothing to decide, so the existence of private work stays here.
      if (repository.isPrivate) return "PRIVATE";

      const candidate =
        event.type === "PULL_REQUEST_MERGED"
          ? economicCandidateFor(event, repository, {
              hasIndependentHumanReview: await this.eligibility.hasEligibleReview(event),
            })
          : economicCandidateFor(event, repository);

      const { isNew } = await this.submissions.record({
        idempotencyKey: candidate.idempotencyKey,
        kind: candidate.kind,
        candidate,
        at: new Date(),
      });
      if (!isNew) return "ALREADY_RECORDED";

      this.detach(this.submit({ idempotencyKey: candidate.idempotencyKey, candidate }));
      return "RECORDED";
    } catch (error) {
      this.logger.warn(
        `Could not record ${event.idempotencyKey} for the Kreds Network (${nameOf(error)}).`,
      );
      return "FAILED";
    }
  }

  /**
   * Offer one stored candidate and file the answer.
   *
   * Resolves `UNANSWERED` rather than throwing when the Network does not
   * answer, or answers with something that is not a decision on this candidate
   * under the protocol. Only a write to Core's own database can reject.
   */
  async submit(due: DueSubmission): Promise<SubmitOutcome> {
    if (!this.connection.connected) return "OFFLINE";

    let decision: NetworkDecisionRecord | null;
    try {
      const answer = await this.connection.client.submitEconomicCandidate(
        due.candidate as EconomicCandidate,
      );
      decision = decisionFrom(answer, due.idempotencyKey);
      if (!decision) {
        this.logger.warn(
          `The Kreds Network answered ${due.idempotencyKey} with something that is not a decision on it under protocol; not recorded.`,
        );
      }
    } catch (error) {
      // The name and the key, never the message: a transport error can quote a
      // request, and the request carried this instance's token.
      this.logger.warn(
        `The Kreds Network did not answer for ${due.idempotencyKey} (${nameOf(error)}); left for retry.`,
      );
      decision = null;
    }

    const now = new Date();
    if (!decision) {
      await this.submissions.recordUnanswered(due.idempotencyKey, now);
      return "UNANSWERED";
    }
    await this.submissions.recordDecision(due.idempotencyKey, decision, now);
    return "DECIDED";
  }

  /** Resolves once every submission `offer` started has finished. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  private detach(work: Promise<unknown>): void {
    const tracked = work
      .catch((error: unknown) => {
        this.logger.warn(`A Kreds Network submission could not be filed (${nameOf(error)}).`);
      })
      .finally(() => this.inFlight.delete(tracked));
    this.inFlight.add(tracked);
  }

  private async repositoryFacts(gitHubRepositoryId: number): Promise<RepositoryFacts | null> {
    if (!Number.isSafeInteger(gitHubRepositoryId)) return null;
    const repository = await this.installations.findRepository(gitHubRepositoryId);
    if (!repository) return null;
    return {
      gitHubRepositoryId: repository.gitHubRepositoryId,
      isPrivate: repository.isPrivate,
      isPersonallyOwned: repository.isPersonallyOwned,
      gitHubOrganizationId: repository.organizationId
        ? await this.installations.findGitHubOrganizationId(repository.organizationId)
        : null,
    };
  }
}

/**
 * The decision, if what came back is one, on this candidate, under the
 * protocol's closed sets. Anything else is not the Network's answer to this
 * question, and filing it would be Core inventing one.
 */
function decisionFrom(answer: unknown, idempotencyKey: string): NetworkDecisionRecord | null {
  if (typeof answer !== "object" || answer === null) return null;
  const { idempotencyKey: key, outcome, reason, rulesVersion } = answer as Record<string, unknown>;
  if (key !== idempotencyKey) return null;
  if (typeof outcome !== "string" || !OUTCOMES.has(outcome)) return null;
  if (typeof reason !== "string" || !REASONS.has(reason)) return null;
  if (typeof rulesVersion !== "string" || rulesVersion.trim() === "") return null;
  return {
    outcome: outcome as NetworkDecisionRecord["outcome"],
    reason: reason as NetworkDecisionRecord["reason"],
    rulesVersion,
  };
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : "unknown error";
}
