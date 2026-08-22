import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, repositories } from "./github";

/** Mirrors `ContributionKind` in `@kreds/domain`. */
export const contributionKind = pgEnum("contribution_kind", [
  "PULL_REQUEST_MERGED",
  "CODE_REVIEW",
  "ISSUE_RESOLVED",
  "REVIEW_FOLLOW_UP",
]);

/**
 * Whether an entry recognises work or takes recognition back.
 *
 * Two directions rather than a signed number, so that a query cannot forget the
 * sign and a reader cannot mistake one for the other. The score is the awards
 * minus the invalidations, derived and never stored (Law II).
 */
export const contributionEntryType = pgEnum("contribution_entry_type", ["AWARD", "INVALIDATION"]);

/**
 * Why recognition was taken back.
 *
 * These are exactly the triggers the published policy names, and the column is
 * an enum so that nothing else can become one. Law XXVII makes points immune to
 * *economic* events: spending KRED, carrying debt and going underwater have no
 * value here to reach for, which is the point of the type being closed.
 */
export const invalidationTrigger = pgEnum("invalidation_trigger", [
  "PR_REVERTED",
  "CONFIRMED_FRAUD",
  "CONFIRMED_FARMING",
  "ACTOR_RECLASSIFIED_NON_HUMAN",
]);

/**
 * The contribution ledger: append-only recognition of verified work.
 *
 * A ledger rather than a counter, for the same reason the KRED ledger is one.
 * 05: Reversals requires that history is never deleted and that a correction is
 * a compensating entry, so an invalidated contribution keeps its award row and
 * gains a second row that cancels it. "Why did this score change" stays
 * answerable, and a farmer whose scheme is caught leaves a trail rather than a
 * gap.
 *
 * There is deliberately no `kredbits` column, no ledger entry reference, and no
 * transaction id. Law XXVI keeps the two systems independent, and the cheapest
 * way to keep them independent is to give this table no way to point at money.
 */
export const contributionEntries = pgTable(
  "contribution_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The identity of the fact this entry records.
     *
     * Unique, so the same merge recognised twice is one entry. An invalidation
     * carries its own key derived from the award it cancels, so a repeated
     * revert does not subtract twice.
     */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    entryType: contributionEntryType("entry_type").notNull(),
    kind: contributionKind("kind").notNull(),

    /**
     * Attributed to the GitHub identity, never to a Kreds account.
     *
     * 24: "your contribution history also starts before your account does.
     * Points are claimed together with the identity." Keying on the account
     * would mean work done before signing up belonged to nobody.
     */
    gitHubUserId: bigint("github_user_id", { mode: "number" }).notNull(),

    repositoryId: uuid("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    /** Null for work outside any connected organization. Points are still earned. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),

    /**
     * Always a positive magnitude. The direction lives in `entryType`.
     *
     * `integer` rather than a decimal: points are whole counts of recognition,
     * and unlike money they have no subunit to lose.
     */
    points: integer("points").notNull(),
    /** `0` to `100`. Points are a range over quality, not a count of events. */
    qualityScore: integer("quality_score").notNull(),

    /**
     * Signals Kreds could not evaluate when it scored this, comma separated.
     *
     * Kept because a low score has two very different causes: thin work, or a
     * permission Kreds never asked for. Without this the two are
     * indistinguishable a month later, and the second one is a bug in Kreds
     * that would look like a judgement about a person.
     */
    unobservedSignals: text("unobserved_signals"),

    /** Set only on an invalidation, and one of the published triggers. */
    trigger: invalidationTrigger("trigger"),
    /** The award this entry cancels. Set only on an invalidation. */
    cancelsEntryId: uuid("cancels_entry_id"),

    /** Law XV: the version that decided travels with the decision. */
    rulesVersion: text("rules_version").notNull(),
    /** When the work happened on GitHub, not when Kreds heard about it. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The global score, and the profile page.
    index("contribution_entries_user_idx").on(table.gitHubUserId, table.occurredAt),
    // The per organization score and leaderboard.
    index("contribution_entries_org_idx").on(table.organizationId, table.gitHubUserId),
    index("contribution_entries_repository_idx").on(table.repositoryId),
  ],
);

export const contributionEntryRelations = relations(contributionEntries, ({ one }) => ({
  repository: one(repositories, {
    fields: [contributionEntries.repositoryId],
    references: [repositories.id],
  }),
  organization: one(organizations, {
    fields: [contributionEntries.organizationId],
    references: [organizations.id],
  }),
}));
