import { relations, sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { gitHubIdentities } from "./identity";
import { organizations } from "./github";

/**
 * Delegated access, and the authority that binds an organization.
 *
 * Amendment A04. 26: Kreds learns what happened either because "the provider
 * pushes it" or because "Kreds asks the provider" with delegated authorization,
 * and in both cases the evidence travels through a channel the beneficiary does
 * not control.
 *
 * That second mode is what these tables exist for. Nothing here ever holds a
 * claim about what happened: an authorization grants access, and 26 draws the
 * line in one sentence, which is worth having next to the schema:
 *
 * > "A user may grant access to their activity. A user may never report their
 * > activity."
 */

/**
 * One user's standing authorization to read their GitHub activity.
 *
 * There is **no plaintext token column**, and that is the design rather than a
 * precaution: a column that could hold one is a column something eventually
 * writes one into. What is stored is ciphertext, its nonce and its tag, which
 * are useless without a key this database does not contain.
 */
export const delegatedAuthorizations = pgTable(
  "delegated_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Unique, so one identity has at most one live authorization. A second row
     * would mean two tokens for the same person, and revoking one would leave
     * the other polling.
     */
    gitHubUserId: bigint("github_user_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => gitHubIdentities.gitHubUserId, { onDelete: "cascade" }),
    /** AES-256-GCM ciphertext, base64. Never a token, never a prefix of one. */
    sealedToken: text("sealed_token").notNull(),
    tokenNonce: text("token_nonce").notNull(),
    tokenTag: text("token_tag").notNull(),
    /**
     * What the user actually granted.
     *
     * Recorded so an operator can tell what Kreds may reach without decrypting
     * anything, and so a scope that turns out to be wider than the economy needs
     * is visible rather than buried in an OAuth app's settings.
     */
    scopes: text("scopes").array().notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * When the authorization stopped being usable.
     *
     * 26: "New activity simply stops being observed. Nothing is inferred about a
     * period Kreds cannot see." Revocation is recorded rather than deleted,
     * because the row is also the record that access once existed, and 26 keeps
     * recorded history unaffected by revocation.
     */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** For the per-user rate budget, so one large account cannot starve the rest. */
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    /** Requests spent in the current budget window. */
    pollBudgetSpent: integer("poll_budget_spent").notNull().default(0),
    pollWindowStartedAt: timestamp("poll_window_started_at", { withTimezone: true }),
  },
  (table) => [
    // The sweep: who is still authorized, oldest polled first.
    index("delegated_authorizations_poll_idx").on(table.revokedAt, table.lastPolledAt),
    check("delegated_authorizations_budget_non_negative", sql`${table.pollBudgetSpent} >= 0`),
    check("delegated_authorizations_scopes_present", sql`array_length(${table.scopes}, 1) >= 1`),
  ],
);

/**
 * An organization's own grant of authority over its economy.
 *
 * Law XXXVI, Only Organization Authority Binds an Organization. 26: "Without
 * this, an outside contributor to a single public repository could claim the
 * organization's economy, its treasury, and its monetary policy."
 *
 * A separate table from `installations` on purpose. An installation is a fact
 * about an application being present; a grant is a fact about authority being
 * given, and conflating them is precisely the conflation A04 removed.
 */
export const organizationGrants = pgTable(
  "organization_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unique: an organization has one grant, not a pile of competing claims. */
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "restrict" }),
    /** GitHub's id for the organization, so a grant can be checked without a join. */
    gitHubOrganizationId: bigint("github_organization_id", { mode: "number" }).notNull(),
    /** The account that held organization authority when the grant was made. */
    grantedByGitHubUserId: bigint("granted_by_github_user_id", { mode: "number" }).notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * When Kreds last confirmed with GitHub that the authority still holds.
     *
     * 26 requires re-verification before treasury-affecting actions, and the
     * reason is ordinary: the owner who granted it can leave, lose their role,
     * or revoke the authorization, and none of those events edits this row.
     */
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("organization_grants_github_idx").on(table.gitHubOrganizationId, table.revokedAt),
    // A grant cannot have been verified before it was made.
    check(
      "organization_grants_verified_after_granted",
      sql`${table.verifiedAt} >= ${table.grantedAt}`,
    ),
  ],
);

export const delegatedAuthorizationRelations = relations(delegatedAuthorizations, ({ one }) => ({
  identity: one(gitHubIdentities, {
    fields: [delegatedAuthorizations.gitHubUserId],
    references: [gitHubIdentities.gitHubUserId],
  }),
}));

export const organizationGrantRelations = relations(organizationGrants, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationGrants.organizationId],
    references: [organizations.id],
  }),
}));
