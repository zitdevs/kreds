import { relations } from "drizzle-orm";
import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Extensionless, unlike every other import in this package, and it has to be.
// drizzle-kit loads these files through CJS `require`, which does not apply
// TypeScript's `.js` to `.ts` mapping, so `./github.js` resolves to a file that
// does not exist on disk and migration generation dies. Both tsconfigs here
// accept the extensionless form, and the emitted CommonJS resolves it fine.
// identity.ts never hit this because it imports nothing.
import { repositories } from "./github";

/** Mirrors `EventStatus` in `@kreds/domain`. */
export const eventStatus = pgEnum("event_status", [
  "RECEIVED",
  "QUEUED",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "IGNORED",
]);

/** Mirrors `DomainEventType` in `@kreds/domain`. */
export const domainEventType = pgEnum("domain_event_type", [
  "PULL_REQUEST_MERGED",
  "PULL_REQUEST_CLOSED",
  "REVIEW_SUBMITTED",
  "REPOSITORY_CONNECTED",
  "REPOSITORY_DISCONNECTED",
]);

/**
 * Every webhook GitHub has ever handed us, exactly as it arrived.
 *
 * The raw log, and it is append-only in spirit: this is what makes it possible
 * to answer "why did this person get paid" a year later, and to rebuild the
 * derived state if the normaliser turns out to have had a bug. 06: Ledger
 * requires history to stay reconstructible, and a pipeline that only kept its
 * conclusions could not honour that.
 *
 * The payload is stored whole rather than filtered down to the fields Kreds
 * reads today. A field that seemed uninteresting is exactly what an
 * investigation needs, and the alternative is discovering months later that the
 * evidence was discarded at the door.
 */
/**
 * How evidence reached Kreds.
 *
 * Law XXXV, A04: "from the source provider through a channel the beneficiary
 * does not control." Exactly two channels, and the enum has no third member, so
 * an event with no lawful provenance cannot be written at all.
 */
export const ingestionMode = pgEnum("ingestion_mode", [
  "PROVIDER_WEBHOOK",
  "SERVER_SIDE_DELEGATED_QUERY",
]);

export const gitHubEvents = pgTable(
  "github_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * GitHub's `X-GitHub-Delivery`, unique.
     *
     * This deduplicates **retries**: GitHub redelivers a failed webhook with the
     * same id, so a second arrival hits this constraint and is recognised
     * rather than reprocessed. It does not deduplicate *facts*, because a human
     * pressing Redeliver produces a new id for the same event. That is what
     * `domain_events.idempotency_key` is for, and the two constraints are
     * separate because they catch different mistakes.
     */
    gitHubDeliveryId: text("github_delivery_id").notNull().unique(),
    /**
     * How this evidence reached Kreds.
     *
     * Law XXXV, A04: evidence arrives "from the source provider through a
     * channel the beneficiary does not control", and there are exactly two such
     * channels. Recorded on the row rather than inferred later, so an auditor
     * can answer "where did this come from" without reconstructing it, and so
     * that a row with no lawful provenance cannot be written at all: the column
     * is not null and the enum has no third member.
     */
    ingestionMode: ingestionMode("ingestion_mode").notNull().default("PROVIDER_WEBHOOK"),
    /**
     * The installation GitHub named, if it named one.
     *
     * Deliberately **not** a foreign key, and the first version had it wrong.
     *
     * A delivery can legitimately arrive for an installation Kreds has not
     * recorded: the `installation.created` webhook may have failed, or arrived
     * out of order, or the App may have been installed while this instance was
     * down. With a foreign key, Postgres rejects the insert and the raw log
     * refuses the evidence at exactly the moment something has already gone
     * wrong, which is the moment the evidence is worth most.
     *
     * The raw log records what GitHub said. Whether we can resolve it is a
     * separate question, asked later, by code that can report not knowing.
     */
    gitHubInstallationId: bigint("github_installation_id", { mode: "number" }),
    eventType: text("event_type").notNull(),
    /** GitHub's `action`. Absent on events that have none. */
    action: text("action"),
    payload: jsonb("payload").notNull(),
    status: eventStatus("status").notNull().default("RECEIVED"),
    /** Set when processing ends, whichever way it ended. */
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /**
     * Why processing failed, when it did.
     *
     * A message, never a payload excerpt: the payload is already stored beside
     * it, and copying part of it here would put the same personal data in two
     * places with two retention stories.
     */
    failureReason: text("failure_reason"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The queue: everything not yet finished, oldest first.
    index("github_events_status_idx").on(table.status, table.receivedAt),
    index("github_events_installation_idx").on(table.gitHubInstallationId),
    index("github_events_type_idx").on(table.eventType),
  ],
);

/**
 * What Kreds understood, one row per fact.
 *
 * The `idempotency_key` is unique and that single constraint is the whole of
 * the Phase 3 guarantee: GitHub can replay the same webhook ten times, through
 * ten different delivery ids, and this table still holds one row. Everything
 * downstream reads from here, so one row is one piece of economic activity.
 *
 * 06: Ledger, Idempotency. The key is derived from the fact rather than from
 * the delivery, so a backfill next year lands on the same key and changes
 * nothing.
 */
export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    type: domainEventType("type").notNull(),
    /**
     * The delivery that produced this fact first.
     *
     * `set null` rather than `cascade`, and it matters: pruning the raw log
     * must never delete economic history. The fact survives its evidence.
     */
    gitHubEventId: uuid("github_event_id").references(() => gitHubEvents.id, {
      onDelete: "set null",
    }),
    repositoryId: uuid("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    gitHubInstallationId: bigint("github_installation_id", { mode: "number" }),
    /** The normalised event. Read by everything above this layer. */
    data: jsonb("data").notNull(),
    /** When it happened on GitHub, not when we heard about it. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("domain_events_repository_idx").on(table.repositoryId, table.occurredAt),
    index("domain_events_type_idx").on(table.type, table.occurredAt),
  ],
);

export const gitHubEventRelations = relations(gitHubEvents, ({ many }) => ({
  domainEvents: many(domainEvents),
}));

export const domainEventRelations = relations(domainEvents, ({ one }) => ({
  source: one(gitHubEvents, {
    fields: [domainEvents.gitHubEventId],
    references: [gitHubEvents.id],
  }),
  repository: one(repositories, {
    fields: [domainEvents.repositoryId],
    references: [repositories.id],
  }),
}));
