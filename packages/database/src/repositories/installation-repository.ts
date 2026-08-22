import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  fromDate,
  gitHubInstallationId as toInstallationId,
  gitHubLogin,
  organizationId as toOrganizationId,
  repositoryId as toRepositoryId,
  type GitHubInstallationId,
  type Installation,
  type InstallationAccountType,
  type InstallationStatus,
  type Organization,
  type Repository,
  type RepositoryTrustTier,
} from "@kreds/domain";

import type { Database } from "../client.js";
import { installations, organizations, repositories } from "../schema/index.js";

interface InstallationRow {
  gitHubInstallationId: number;
  accountType: InstallationAccountType;
  accountLogin: string;
  accountGitHubId: number;
  organizationId: string | null;
  status: InstallationStatus;
  installedAt: Date;
}

interface RepositoryRow {
  id: string;
  gitHubRepositoryId: number;
  organizationId: string | null;
  nameWithOwner: string;
  isPrivate: boolean;
  isPersonallyOwned: boolean;
  trustTier: RepositoryTrustTier;
  primaryBranch: string;
}

function toInstallation(row: InstallationRow): Installation {
  return {
    gitHubInstallationId: toInstallationId(row.gitHubInstallationId),
    accountType: row.accountType,
    accountLogin: gitHubLogin(row.accountLogin),
    accountGitHubId: row.accountGitHubId,
    organizationId: row.organizationId ? toOrganizationId(row.organizationId) : null,
    status: row.status,
    installedAt: fromDate(row.installedAt),
  };
}

function toRepository(row: RepositoryRow): Repository {
  return {
    id: toRepositoryId(row.id),
    gitHubRepositoryId: row.gitHubRepositoryId,
    organizationId: row.organizationId ? toOrganizationId(row.organizationId) : null,
    nameWithOwner: row.nameWithOwner,
    isPrivate: row.isPrivate,
    isPersonallyOwned: row.isPersonallyOwned,
    trustTier: row.trustTier,
    primaryBranch: row.primaryBranch,
  };
}

/** What a webhook tells us about the account the App was installed on. */
export interface InstallationAccount {
  readonly gitHubInstallationId: GitHubInstallationId;
  readonly accountType: InstallationAccountType;
  readonly accountLogin: string;
  readonly accountGitHubId: number;
}

/** What a webhook tells us about one repository. */
export interface RepositoryInput {
  readonly gitHubRepositoryId: number;
  readonly nameWithOwner: string;
  readonly isPrivate: boolean;
  readonly primaryBranch?: string | null;
}

export interface InstallationWithRepositories {
  readonly installation: Installation;
  readonly organization: Organization | null;
  readonly repositories: readonly Repository[];
}

/**
 * The connection between Kreds and a GitHub account.
 *
 * Every method here is idempotent, and that is a requirement rather than a
 * nicety: GitHub delivers webhooks at least once, so the same installation
 * event arrives more than once as a matter of course. 06: Ledger states the
 * rule for the economic layer, and it starts here, at the point the duplicate
 * enters the system.
 */
export class InstallationRepository {
  constructor(private readonly db: Database) {}

  /**
   * Record an installation and the repositories it covers.
   *
   * One transaction, because a half-applied installation is worse than none:
   * an installation row with no repositories looks exactly like an owner who
   * selected nothing, and Kreds would sit silently watching an account it was
   * supposed to be reading.
   *
   * An organization account also creates the Team's organization row. A
   * personal account does not, and that is 02 rather than an omission:
   * "Creating a Kreds Team requires connecting a real GitHub Organization."
   */
  async install(
    account: InstallationAccount,
    covered: readonly RepositoryInput[],
  ): Promise<InstallationWithRepositories> {
    return this.db.transaction(async (tx) => {
      let organization: Organization | null = null;

      if (account.accountType === "ORGANIZATION") {
        const [row] = await tx
          .insert(organizations)
          .values({ gitHubOrganizationId: account.accountGitHubId, login: account.accountLogin })
          .onConflictDoUpdate({
            target: organizations.gitHubOrganizationId,
            // Refresh the login: orgs get renamed, and the numeric id is what
            // keys the row, so this moves nothing that matters.
            set: { login: account.accountLogin },
          })
          .returning();
        if (!row) throw new Error(`failed to connect organization ${account.accountLogin}.`);
        organization = {
          id: toOrganizationId(row.id),
          gitHubOrganizationId: row.gitHubOrganizationId,
          login: gitHubLogin(row.login),
          connectedAt: fromDate(row.connectedAt),
        };
      }

      const [installed] = await tx
        .insert(installations)
        .values({
          gitHubInstallationId: account.gitHubInstallationId,
          accountType: account.accountType,
          accountLogin: account.accountLogin,
          accountGitHubId: account.accountGitHubId,
          organizationId: organization?.id ?? null,
        })
        .onConflictDoUpdate({
          target: installations.gitHubInstallationId,
          set: {
            accountLogin: account.accountLogin,
            organizationId: organization?.id ?? null,
            // Reinstalling after a removal revives the same row. The id is
            // GitHub's and it is reused, so a stale REMOVED here would leave
            // the connection permanently mute.
            status: "ACTIVE",
            removedAt: null,
            suspendedAt: null,
          },
        })
        .returning();
      if (!installed) {
        throw new Error(`failed to record installation ${account.gitHubInstallationId}.`);
      }

      const saved = await this.upsertRepositories(tx, account, organization, covered);
      return { installation: toInstallation(installed), organization, repositories: saved };
    });
  }

  /**
   * Add repositories to an existing installation.
   *
   * Used by `installation_repositories.added`, and by `install` itself, so the
   * two paths cannot drift apart on what "covered" means.
   */
  async addRepositories(
    id: GitHubInstallationId,
    covered: readonly RepositoryInput[],
  ): Promise<readonly Repository[]> {
    if (covered.length === 0) return [];
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(installations)
        .where(eq(installations.gitHubInstallationId, id))
        .limit(1);
      if (!row) throw new Error(`installation ${id} is not recorded.`);

      let organization: Organization | null = null;
      if (row.organizationId) {
        const [org] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, row.organizationId))
          .limit(1);
        if (org) {
          organization = {
            id: toOrganizationId(org.id),
            gitHubOrganizationId: org.gitHubOrganizationId,
            login: gitHubLogin(org.login),
            connectedAt: fromDate(org.connectedAt),
          };
        }
      }

      return this.upsertRepositories(
        tx,
        {
          gitHubInstallationId: id,
          accountType: row.accountType,
          accountLogin: row.accountLogin,
          accountGitHubId: row.accountGitHubId,
        },
        organization,
        covered,
      );
    });
  }

  /**
   * Stop covering repositories, without forgetting them.
   *
   * A removal ends coverage; it does not unmake the work already recorded
   * against the repository. 06: Ledger requires history to stay
   * reconstructible, so this stamps `removedAt` rather than deleting, and
   * re-adding the repository later clears it and resumes the same row.
   */
  async removeRepositories(
    id: GitHubInstallationId,
    gitHubRepositoryIds: readonly number[],
  ): Promise<number> {
    if (gitHubRepositoryIds.length === 0) return 0;
    const removed = await this.db
      .update(repositories)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(repositories.gitHubInstallationId, id),
          inArray(repositories.gitHubRepositoryId, [...gitHubRepositoryIds]),
          isNull(repositories.removedAt),
        ),
      )
      .returning({ id: repositories.id });
    return removed.length;
  }

  /**
   * Move an installation between active, suspended and removed.
   *
   * Suspension and removal are kept apart because they are different facts. A
   * suspended installation still exists on GitHub and can be resumed by its
   * owner; a removed one has to be created again. Collapsing them would make
   * an uninstall look reversible.
   */
  async setStatus(id: GitHubInstallationId, status: InstallationStatus): Promise<Installation> {
    const now = new Date();
    const [row] = await this.db
      .update(installations)
      .set({
        status,
        suspendedAt: status === "SUSPENDED" ? now : null,
        removedAt: status === "REMOVED" ? now : null,
      })
      .where(eq(installations.gitHubInstallationId, id))
      .returning();
    if (!row) throw new Error(`installation ${id} is not recorded.`);
    return toInstallation(row);
  }

  async findInstallation(id: GitHubInstallationId): Promise<Installation | null> {
    const [row] = await this.db
      .select()
      .from(installations)
      .where(eq(installations.gitHubInstallationId, id))
      .limit(1);
    return row ? toInstallation(row) : null;
  }

  /** Repositories this installation still covers. */
  async findCoveredRepositories(id: GitHubInstallationId): Promise<readonly Repository[]> {
    const rows = await this.db
      .select()
      .from(repositories)
      .where(and(eq(repositories.gitHubInstallationId, id), isNull(repositories.removedAt)));
    return rows.map(toRepository);
  }

  /**
   * Update a repository's display facts without touching its coverage.
   *
   * A rename, a transfer or a visibility flip changes what the repository is
   * called, not whether Kreds was asked to watch it. Routing those through the
   * upsert would clear `removedAt` and silently re-cover a repository its owner
   * had deselected, which is coverage granted by an event that says nothing
   * about coverage.
   *
   * @returns the updated repository, or `null` if it was never recorded.
   */
  async refreshRepository(input: RepositoryInput): Promise<Repository | null> {
    const [row] = await this.db
      .update(repositories)
      .set({
        nameWithOwner: input.nameWithOwner,
        isPrivate: input.isPrivate,
        ...(input.primaryBranch ? { primaryBranch: input.primaryBranch } : {}),
      })
      .where(eq(repositories.gitHubRepositoryId, input.gitHubRepositoryId))
      .returning();
    return row ? toRepository(row) : null;
  }

  async findRepository(gitHubRepositoryId: number): Promise<Repository | null> {
    const [row] = await this.db
      .select()
      .from(repositories)
      .where(eq(repositories.gitHubRepositoryId, gitHubRepositoryId))
      .limit(1);
    return row ? toRepository(row) : null;
  }

  /**
   * The shared write behind `install` and `addRepositories`.
   *
   * Takes the open transaction rather than opening its own, so that a caller
   * already inside one does not deadlock against itself waiting for a
   * connection it is holding.
   */
  private async upsertRepositories(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    account: InstallationAccount,
    organization: Organization | null,
    covered: readonly RepositoryInput[],
  ): Promise<readonly Repository[]> {
    if (covered.length === 0) return [];

    const saved: Repository[] = [];
    for (const input of covered) {
      const values = {
        gitHubRepositoryId: input.gitHubRepositoryId,
        gitHubInstallationId: account.gitHubInstallationId,
        organizationId: organization?.id ?? null,
        nameWithOwner: input.nameWithOwner,
        isPrivate: input.isPrivate,
        isPersonallyOwned: account.accountType === "USER",
        ...(input.primaryBranch ? { primaryBranch: input.primaryBranch } : {}),
      };

      const [row] = await tx
        .insert(repositories)
        .values(values)
        .onConflictDoUpdate({
          target: repositories.gitHubRepositoryId,
          set: {
            gitHubInstallationId: values.gitHubInstallationId,
            organizationId: values.organizationId,
            // Repositories get renamed and transferred. The numeric id keys
            // the row, so refreshing the display name moves no history.
            nameWithOwner: values.nameWithOwner,
            isPrivate: values.isPrivate,
            isPersonallyOwned: values.isPersonallyOwned,
            // Re-adding a repository resumes coverage on the same row.
            removedAt: null,
            // `trustTier` is deliberately absent from both the insert and this
            // update. It is an economic standing earned over time under 25,
            // and a webhook is not evidence about it. Listing it here would
            // let anyone reset a repository's tier by toggling the App off and
            // on, which is a way to launder an untrusted repository into a
            // trusted one and back.
            ...(input.primaryBranch ? { primaryBranch: input.primaryBranch } : {}),
          },
        })
        .returning();
      if (!row) throw new Error(`failed to record repository ${input.nameWithOwner}.`);
      saved.push(toRepository(row));
    }
    return saved;
  }
}
