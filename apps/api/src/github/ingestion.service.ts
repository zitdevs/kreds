import { Injectable, Logger } from "@nestjs/common";

import { EventStore, InstallationRepository } from "@kreds/database";
import { gitHubInstallationId, type DomainEvent } from "@kreds/domain";

import { ContributionService } from "../contribution/contribution.service.js";
import { EligibilityService } from "../eligibility/eligibility.service.js";
import { InstallationService } from "./installation.service.js";
import { normalize } from "./normalizer.js";

export type IngestionOutcome = "PROCESSED" | "IGNORED" | "DUPLICATE" | "FAILED";

export interface IngestionResult {
  readonly outcome: IngestionOutcome;
  /** The fact recorded, when this delivery produced one that was new. */
  readonly idempotencyKey?: string;
}

/**
 * The pipeline, in order: store, understand, record.
 *
 * ```text
 * GitHub webhook -> Raw Event -> Normalizer -> Domain Event
 * ```
 *
 * Storing comes first and unconditionally. If normalisation throws, the payload
 * is already on disk and the delivery can be replayed against a fixed
 * normaliser; if it were parsed first, a bug here would lose the evidence and
 * the only record of what happened would be a stack trace.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly events: EventStore,
    private readonly installations: InstallationRepository,
    private readonly installationEvents: InstallationService,
    private readonly contributions: ContributionService,
    private readonly eligibility: EligibilityService,
  ) {}

  async ingest(input: {
    deliveryId: string;
    eventType: string;
    payload: unknown;
  }): Promise<IngestionResult> {
    const body = input.payload as { action?: unknown; installation?: { id?: unknown } };
    const action = typeof body?.action === "string" ? body.action : null;
    const rawInstallationId =
      typeof body?.installation?.id === "number" ? body.installation.id : null;

    const recorded = await this.events.record({
      gitHubDeliveryId: input.deliveryId,
      eventType: input.eventType,
      action,
      gitHubInstallationId: rawInstallationId ? gitHubInstallationId(rawInstallationId) : null,
      payload: input.payload,
    });

    // A redelivery of something already finished is nothing to do. A redelivery
    // of something that failed, or that a crash left mid-flight, is exactly what
    // must be retried: treating every repeat as a duplicate would make a failed
    // delivery unrecoverable, and GitHub's retries the reason it stays broken.
    if (
      recorded.isRedelivery &&
      (recorded.status === "PROCESSED" || recorded.status === "IGNORED")
    ) {
      return { outcome: "DUPLICATE" };
    }

    try {
      // Phase 2's side effects: installations, repositories, coverage.
      const handled = await this.installationEvents.handle(input.eventType, input.payload);

      const event = normalize(input.eventType, input.payload);
      if (!event) {
        await (handled === "PROCESSED"
          ? this.events.markProcessed(recorded.id)
          : this.events.markIgnored(recorded.id));
        return { outcome: handled === "PROCESSED" ? "PROCESSED" : "IGNORED" };
      }

      const result = await this.events.recordDomainEvent(event, {
        gitHubEventId: recorded.id,
        repositoryId: await this.resolveRepositoryId(event),
      });
      await this.events.markProcessed(recorded.id);

      // Recognition runs for every delivery, not only for a fact that is new,
      // and the difference matters more than it looks.
      //
      // The first version gated this on `result.isNew`, reasoning that a replay
      // must not pay twice. It cannot: the contribution ledger is keyed on this
      // same idempotency key and absorbs the repeat. So the gate protected
      // nothing and cost something real, which showed up immediately.
      //
      // The first genuine merge in this repository landed while the recognition
      // engine was still deploying. Its fact was recorded and never scored, and
      // with the gate in place no redelivery could ever fix that: the fact was
      // no longer new, so recognition would be skipped forever. Work that
      // happened would have stayed permanently unrecognised because of when it
      // happened.
      //
      // Running every time makes a redelivery a repair rather than a no-op, and
      // leaves the idempotency where it belongs, on the ledger.
      await this.contributions.recognise(event);

      // Layer 2, and deliberately after Layer 1 rather than gating it. 25's
      // core rule is that the two are separate standards: work earns
      // recognition on its own merits, and whether it may also affect an
      // economy is a different, stricter question asked afterwards.
      if (event.type === "PULL_REQUEST_MERGED") {
        await this.eligibility.forMerge(event);
      }

      if (!result.isNew) {
        // The same fact through a different delivery id, which is what pressing
        // Redeliver in the App settings produces. The raw log keeps both; the
        // economy sees one.
        this.logger.log(`Fact ${event.idempotencyKey} was already on file.`);
        return { outcome: "DUPLICATE", idempotencyKey: event.idempotencyKey };
      }
      return { outcome: "PROCESSED", idempotencyKey: event.idempotencyKey };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.events.markFailed(recorded.id, reason);
      this.logger.error(`Delivery ${input.deliveryId} failed: ${reason}`);
      return { outcome: "FAILED" };
    }
  }

  /**
   * The repository's own row, when Kreds has one.
   *
   * The normaliser is a pure function of the payload and only knows GitHub's
   * numeric id, so the join to our uuid happens here, where the database is.
   * `null` is legitimate: an event can arrive for a repository whose
   * installation webhook has not been processed yet, and losing the fact over
   * that would be worse than recording it unlinked.
   */
  private async resolveRepositoryId(event: DomainEvent): Promise<string | null> {
    const gitHubRepositoryId = Number(event.repositoryId);
    if (!Number.isSafeInteger(gitHubRepositoryId)) return null;
    const repository = await this.installations.findRepository(gitHubRepositoryId);
    return repository?.id ?? null;
  }
}
