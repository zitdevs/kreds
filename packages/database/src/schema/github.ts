import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Mirrors `InstallationAccountType` in `@kreds/domain`.
 *
 * 02: GitHub Organizations and Economic Boundaries: "Creating a Kreds Team
 * requires connecting a real GitHub Organization." A personal account is a
 * legitimate installation that forms no Team, so the two cases are an enum
 * rather than a nullable organization reference standing in for both.
 */
export const installationAccountType = pgEnum("installation_account_type", [
  "ORGANIZATION",
  "USER",
]);

/** Mirrors `InstallationStatus` in `@kreds/domain`. */
export const installationStatus = pgEnum("installation_status", ["ACTIVE", "SUSPENDED", "REMOVED"]);

/** Mirrors `RepositoryTrustTier` in `@kreds/domain`. See 25: Repository Economic Eligibility. */
export const repositoryTrustTier = pgEnum("repository_trust_tier", [
  "UNTRUSTED",
  "ESTABLISHED",
  "RELEVANT",
  "HIGH_TRUST",
]);

/**
 * A connected GitHub Organization, which is one Kreds Team.
 *
 * 02: "A GitHub Organization is therefore the default **economic boundary** of
 * a Kreds Team." The row exists only for organization installations; a personal
 * account produces repositories with no organization at all.
 *
 * Keyed on the numeric GitHub id for the same reason identities are, from 09:
 * logins are renameable and reusable, numeric ids are not. `login` is here to
 * display and is expected to change under us.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gitHubOrganizationId: bigint("github_organization_id", { mode: "number" }).notNull().unique(),
    login: text("login").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("organizations_login_idx").on(table.login)],
);

/**
 * One installation of the Kreds GitHub App.
 *
 * The primary key is GitHub's installation id rather than a generated uuid,
 * because every webhook arrives carrying that number and nothing else that
 * identifies the connection. A surrogate key would mean a lookup on every
 * delivery to learn something the delivery already told us.
 *
 * There is deliberately no access token column. Installation tokens expire in
 * an hour and are minted on demand from the App's private key, so storing one
 * would buy nothing and create a credential that can leak.
 */
export const installations = pgTable(
  "installations",
  {
    gitHubInstallationId: bigint("github_installation_id", { mode: "number" }).primaryKey(),
    accountType: installationAccountType("account_type").notNull(),
    /** The org or user the App is installed on. Display only, and renameable. */
    accountLogin: text("account_login").notNull(),
    /** Stable across renames, unlike the login. */
    accountGitHubId: bigint("account_github_id", { mode: "number" }).notNull(),
    /**
     * The Team this installation created. Null for a personal account (02).
     *
     * `set null` rather than `cascade`: deleting an organization must not erase
     * the record that the App was once installed, which is history.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    status: installationStatus("status").notNull().default("ACTIVE"),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [index("installations_organization_id_idx").on(table.organizationId)],
);

/**
 * A repository Kreds has been given sight of.
 *
 * `removedAt` rather than a delete. Taking a repository out of an installation
 * ends its coverage; it does not unmake the work already recorded against it,
 * and 06: Ledger requires history to stay reconstructible. Re-adding the
 * repository clears the timestamp and the same row resumes.
 *
 * `trustTier` defaults to `UNTRUSTED` because 25 scopes the ladder to public
 * repositories and starts everything at the bottom. Nothing in this package
 * ever promotes it: that is an economic decision made elsewhere, from signals
 * this table does not hold.
 */
export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gitHubRepositoryId: bigint("github_repository_id", { mode: "number" }).notNull().unique(),
    /**
     * The installation that currently covers this repository.
     *
     * Nullable so that a repository survives its installation being deleted
     * outright, which again is history rather than a cascade.
     */
    gitHubInstallationId: bigint("github_installation_id", { mode: "number" }).references(
      () => installations.gitHubInstallationId,
      { onDelete: "set null" },
    ),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    /** `owner/name`. Renameable and transferable, so display only, never a key. */
    nameWithOwner: text("name_with_owner").notNull(),
    isPrivate: boolean("is_private").notNull(),
    /** Whether the owner is a personal account rather than an organization. */
    isPersonallyOwned: boolean("is_personally_owned").notNull(),
    trustTier: repositoryTrustTier("trust_tier").notNull().default("UNTRUSTED"),
    primaryBranch: text("primary_branch").notNull().default("main"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while covered. Set when the repository leaves the installation. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    index("repositories_installation_id_idx").on(table.gitHubInstallationId),
    index("repositories_organization_id_idx").on(table.organizationId),
    index("repositories_name_with_owner_idx").on(table.nameWithOwner),
  ],
);

export const organizationRelations = relations(organizations, ({ many }) => ({
  installations: many(installations),
  repositories: many(repositories),
}));

export const installationRelations = relations(installations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [installations.organizationId],
    references: [organizations.id],
  }),
  repositories: many(repositories),
}));

export const repositoryRelations = relations(repositories, ({ one }) => ({
  installation: one(installations, {
    fields: [repositories.gitHubInstallationId],
    references: [installations.gitHubInstallationId],
  }),
  organization: one(organizations, {
    fields: [repositories.organizationId],
    references: [organizations.id],
  }),
}));
