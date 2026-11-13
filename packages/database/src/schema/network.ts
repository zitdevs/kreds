import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * What Core offered the Kreds Network, and what the Network answered.
 *
 * `@kreds/network-client` says it in one line: "Core submits evidence. Network
 * decides money." These two tables are Core's memory of that exchange and
 * nothing more. Neither holds an amount, neither is read by the ledger, and no
 * balance, ledger entry or Contribution Point moves because a row appears here.
 * Law I: "Official KREDS can only be issued by the Kreds Network."
 *
 * Both are history. The migration adds triggers: a candidate may only advance
 * its delivery bookkeeping, and a decision may never be changed or removed.
 * Law XV: "Economic rules are versioned and forward-only", and a decision is
 * stored with the `rules_version` the Network said produced it.
 */

/** Mirrors `CandidateKind` in `@kreds/network-client`. */
export const networkCandidateKind = pgEnum("network_candidate_kind", [
  "PULL_REQUEST_MERGED",
  "REVIEW_SUBMITTED",
]);

/**
 * Whether the Network has ever answered for this candidate.
 *
 * Two states and no more. `UNSUBMITTED` covers "never tried" and "tried, and
 * the Network did not answer": both mean no decision exists, and the retry
 * sweep treats them the same. An outage is never a decision (see
 * `NetworkUnavailableError`), so it has no state of its own to be mistaken for
 * one.
 */
export const networkSubmissionStatus = pgEnum("network_submission_status", [
  "UNSUBMITTED",
  "SUBMITTED",
]);

/** Mirrors `EconomicDecision.outcome` in `@kreds/network-client`. */
export const networkDecisionOutcome = pgEnum("network_decision_outcome", [
  "ISSUED",
  "DECLINED",
  "DEFERRED",
]);

/**
 * Mirrors `DecisionReason` in `@kreds/network-client`, a closed set.
 *
 * An enum rather than text so that a reason the protocol does not define cannot
 * be written at all. Free text is how a threshold would cross into this public
 * repository through a column nobody thought of as sensitive.
 */
export const networkDecisionReason = pgEnum("network_decision_reason", [
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
 * One economic candidate, exactly as Core built it.
 *
 * Keyed on the protocol's idempotency key, which is the fact's own key: the
 * same merge produces the same row whichever delivery carried it. The
 * candidate is stored whole so that a retry resubmits precisely the evidence
 * first offered, rather than whatever Core would assemble on a later day.
 *
 * `candidate`, `kind`, `idempotency_key` and `recorded_at` never change after
 * insert. Only the delivery bookkeeping does, and `status` only forward.
 */
export const networkCandidates = pgTable(
  "network_candidates",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    kind: networkCandidateKind("kind").notNull(),
    /** The `EconomicCandidate` as serialised for the wire. Carries no amount. */
    candidate: jsonb("candidate").notNull(),
    status: networkSubmissionStatus("status").notNull().default("UNSUBMITTED"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    /** The last time Core asked, answered or not. Orders the retry sweep. */
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [
    index("network_candidates_retry_idx").on(table.status, table.lastAttemptedAt),
    check("network_candidates_attempts_non_negative", sql`${table.attempts} >= 0`),
  ],
);

/**
 * Every distinct answer the Network gave for a candidate, in the order Core
 * received them.
 *
 * Append only. A deferred candidate that is later declined keeps its deferral
 * on file: what the Network said, under which rules version, is history.
 *
 * `received_at` is when Core received the answer. The protocol's
 * `EconomicDecision` carries no decision time, so Core records the one fact it
 * actually knows rather than inventing the Network's.
 */
export const networkDecisions = pgTable(
  "network_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key")
      .notNull()
      .references(() => networkCandidates.idempotencyKey, { onDelete: "restrict" }),
    outcome: networkDecisionOutcome("outcome").notNull(),
    reason: networkDecisionReason("reason").notNull(),
    /** Law XV: "every transaction stores the `rulesVersion` that produced it." */
    rulesVersion: text("rules_version").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("network_decisions_candidate_idx").on(table.idempotencyKey, table.receivedAt)],
);

export const networkCandidateRelations = relations(networkCandidates, ({ many }) => ({
  decisions: many(networkDecisions),
}));

export const networkDecisionRelations = relations(networkDecisions, ({ one }) => ({
  candidate: one(networkCandidates, {
    fields: [networkDecisions.idempotencyKey],
    references: [networkCandidates.idempotencyKey],
  }),
}));
