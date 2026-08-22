import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DomainEvent, EventStatus, GitHubInstallationId } from "@kreds/domain";

import type { Database } from "../client.js";
import { domainEvents, gitHubEvents } from "../schema/index.js";

/** One webhook, as it arrived. */
export interface RawDelivery {
  readonly gitHubDeliveryId: string;
  readonly eventType: string;
  readonly action?: string | null;
  readonly gitHubInstallationId?: GitHubInstallationId | null;
  readonly payload: unknown;
}

export interface RecordedDelivery {
  readonly id: string;
  readonly gitHubDeliveryId: string;
  readonly eventType: string;
  readonly status: EventStatus;
  /**
   * True when this exact delivery id had already been stored.
   *
   * GitHub retries a failed webhook with the same id, so this is the ordinary
   * case rather than an anomaly, and a caller seeing it should stop rather than
   * process the delivery again.
   */
  readonly isRedelivery: boolean;
}

export interface RecordedDomainEvent {
  readonly id: string;
  readonly idempotencyKey: string;
  /**
   * False when this fact was already on file.
   *
   * The Phase 3 guarantee lives here. A redelivery through a *new* delivery id
   * gets past the raw log's uniqueness, reaches this insert, and stops. Ten
   * replays, one row, one piece of economic activity.
   */
  readonly isNew: boolean;
}

/**
 * The ingestion pipeline's memory.
 *
 * Two tables and two different guarantees, which is the point of the split:
 *
 * - `github_events` is the raw log, unique per delivery. It exists so that
 *   "why did this person get paid" is answerable a year later, and so that a
 *   bug in the normaliser can be fixed and the history rebuilt rather than
 *   apologised for. 06: Ledger requires reconstructible history.
 * - `domain_events` is the fact, unique per idempotency key. Everything above
 *   this layer reads from here.
 *
 * Deduplicating on the delivery alone would not be enough: a person pressing
 * Redeliver in the App settings produces a new delivery id for the same event,
 * and so does a backfill. Deduplicating on the fact alone would throw away the
 * evidence. Both, or neither works.
 */
export class EventStore {
  constructor(private readonly db: Database) {}

  /**
   * Store a delivery, or recognise one already stored.
   *
   * Never throws on a duplicate. A retry is normal traffic and the caller needs
   * an answer it can act on, not an exception to distinguish from a real
   * failure.
   */
  async record(delivery: RawDelivery): Promise<RecordedDelivery> {
    const [inserted] = await this.db
      .insert(gitHubEvents)
      .values({
        gitHubDeliveryId: delivery.gitHubDeliveryId,
        eventType: delivery.eventType,
        action: delivery.action ?? null,
        gitHubInstallationId: delivery.gitHubInstallationId ?? null,
        payload: delivery.payload,
      })
      .onConflictDoNothing({ target: gitHubEvents.gitHubDeliveryId })
      .returning();

    if (inserted) {
      return {
        id: inserted.id,
        gitHubDeliveryId: inserted.gitHubDeliveryId,
        eventType: inserted.eventType,
        status: inserted.status,
        isRedelivery: false,
      };
    }

    const [existing] = await this.db
      .select()
      .from(gitHubEvents)
      .where(eq(gitHubEvents.gitHubDeliveryId, delivery.gitHubDeliveryId))
      .limit(1);
    if (!existing) {
      // The insert reported a conflict and the row is not there, which means
      // another process is mid-transaction on the same delivery. Saying so is
      // better than inventing a row.
      throw new Error(
        `delivery ${delivery.gitHubDeliveryId} conflicted but could not be read back.`,
      );
    }

    return {
      id: existing.id,
      gitHubDeliveryId: existing.gitHubDeliveryId,
      eventType: existing.eventType,
      status: existing.status,
      isRedelivery: true,
    };
  }

  /**
   * Record a fact, or recognise one already recorded.
   *
   * The unique key does the work. `onConflictDoNothing` rather than an upsert
   * on purpose: the first recording of a fact is the true one, and letting a
   * later delivery overwrite it would let a replayed webhook quietly rewrite
   * history that has already been paid out.
   */
  async recordDomainEvent(
    event: DomainEvent,
    source: { gitHubEventId?: string | null; repositoryId?: string | null } = {},
  ): Promise<RecordedDomainEvent> {
    const [inserted] = await this.db
      .insert(domainEvents)
      .values({
        idempotencyKey: event.idempotencyKey,
        type: event.type,
        gitHubEventId: source.gitHubEventId ?? null,
        repositoryId: source.repositoryId ?? null,
        gitHubInstallationId: event.gitHubInstallationId,
        data: event,
        occurredAt: new Date(event.occurredAt),
      })
      .onConflictDoNothing({ target: domainEvents.idempotencyKey })
      .returning();

    if (inserted) {
      return { id: inserted.id, idempotencyKey: inserted.idempotencyKey, isNew: true };
    }

    const [existing] = await this.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.idempotencyKey, event.idempotencyKey))
      .limit(1);
    if (!existing) {
      throw new Error(`fact ${event.idempotencyKey} conflicted but could not be read back.`);
    }
    return { id: existing.id, idempotencyKey: existing.idempotencyKey, isNew: false };
  }

  /** Move a delivery to its terminal state. */
  async markProcessed(id: string): Promise<void> {
    await this.setStatus(id, "PROCESSED");
  }

  /**
   * Nothing here reads this event type, which is ordinary.
   *
   * Kept apart from `FAILED` because most of what GitHub sends is something
   * Kreds does not read, and recording that as failure would make the failure
   * count permanently meaningless.
   */
  async markIgnored(id: string): Promise<void> {
    await this.setStatus(id, "IGNORED");
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.db
      .update(gitHubEvents)
      .set({ status: "FAILED", processedAt: new Date(), failureReason: reason.slice(0, 500) })
      .where(eq(gitHubEvents.id, id));
  }

  private async setStatus(id: string, status: EventStatus): Promise<void> {
    await this.db
      .update(gitHubEvents)
      .set({ status, processedAt: new Date(), failureReason: null })
      .where(eq(gitHubEvents.id, id));
  }

  /**
   * Deliveries that never reached a terminal state.
   *
   * A process killed mid-delivery leaves rows in `RECEIVED` or `PROCESSING`
   * forever, and without a way to list them the pipeline loses events silently,
   * which is the failure mode worth engineering against. Oldest first, so a
   * replay preserves the order things happened in.
   */
  async findUnfinished(limit = 100): Promise<readonly RecordedDelivery[]> {
    const rows = await this.db
      .select()
      .from(gitHubEvents)
      .where(inArray(gitHubEvents.status, ["RECEIVED", "QUEUED", "PROCESSING"]))
      .orderBy(asc(gitHubEvents.receivedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      gitHubDeliveryId: row.gitHubDeliveryId,
      eventType: row.eventType,
      status: row.status,
      isRedelivery: false,
    }));
  }

  /**
   * Every review recorded against one pull request.
   *
   * Read from the domain events rather than from a reviews table, because the
   * facts are already there and a second copy would be a second truth. 25 needs
   * this to answer whether a merge had independent human validation, which is
   * the question that decides whether it may create money at all.
   */
  async findReviewsFor(
    gitHubRepositoryId: number,
    pullRequestNumber: number,
  ): Promise<readonly DomainEvent[]> {
    const rows = await this.db
      .select()
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.type, "REVIEW_SUBMITTED"),
          sql`${domainEvents.data} ->> 'repositoryId' = ${String(gitHubRepositoryId)}`,
          sql`(${domainEvents.data} -> 'pullRequestNumber')::int = ${pullRequestNumber}`,
        ),
      )
      .orderBy(asc(domainEvents.occurredAt));
    return rows.map((row) => row.data as DomainEvent);
  }

  async findDomainEvent(idempotencyKey: string): Promise<DomainEvent | null> {
    const [row] = await this.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.idempotencyKey, idempotencyKey))
      .limit(1);
    return row ? (row.data as DomainEvent) : null;
  }

  /** Facts recorded for a repository, oldest first. */
  async findDomainEventsForRepository(
    repositoryId: string,
    type?: DomainEvent["type"],
  ): Promise<readonly DomainEvent[]> {
    const rows = await this.db
      .select()
      .from(domainEvents)
      .where(
        type
          ? and(eq(domainEvents.repositoryId, repositoryId), eq(domainEvents.type, type))
          : eq(domainEvents.repositoryId, repositoryId),
      )
      .orderBy(asc(domainEvents.occurredAt));
    return rows.map((row) => row.data as DomainEvent);
  }
}
