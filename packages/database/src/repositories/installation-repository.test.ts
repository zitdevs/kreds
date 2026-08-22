import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import { gitHubInstallationId } from "@kreds/domain";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import {
  InstallationRepository,
  type InstallationAccount,
  type RepositoryInput,
} from "./installation-repository.js";

/**
 * Against a real Postgres, for the same reason the identity suite is: the
 * things worth checking are the unique constraints, the upserts and the
 * transaction, and a fake has none of them.
 */
const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

let db: Database;
let repository: InstallationRepository;

const ORG: InstallationAccount = {
  gitHubInstallationId: gitHubInstallationId(48_291_037),
  accountType: "ORGANIZATION",
  accountLogin: "zitdevs",
  accountGitHubId: 9_001,
};

const PERSON: InstallationAccount = {
  gitHubInstallationId: gitHubInstallationId(48_291_038),
  accountType: "USER",
  accountLogin: "isaac",
  accountGitHubId: 4_242,
};

const repo = (over: Partial<RepositoryInput> = {}): RepositoryInput => ({
  gitHubRepositoryId: 77_001,
  nameWithOwner: "zitdevs/kreds",
  isPrivate: false,
  ...over,
});

describeWithDatabase("InstallationRepository", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 1 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(sql`truncate table repositories, installations, organizations cascade`);
    repository = new InstallationRepository(db);
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  describe("installing", () => {
    it("connects an organization and its repositories", async () => {
      const result = await repository.install(ORG, [repo()]);

      expect(result.organization?.login).toBe("zitdevs");
      expect(result.installation.accountType).toBe("ORGANIZATION");
      expect(result.installation.status).toBe("ACTIVE");
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0]?.organizationId).toBe(result.organization?.id);
      expect(result.repositories[0]?.isPersonallyOwned).toBe(false);
    });

    /**
     * 02: "Creating a Kreds Team requires connecting a real GitHub
     * Organization." A personal installation is legitimate and forms no Team,
     * so there must be no organization row standing in for one.
     */
    it("creates no organization for a personal account", async () => {
      const result = await repository.install(PERSON, [
        repo({ gitHubRepositoryId: 77_002, nameWithOwner: "isaac/dotfiles" }),
      ]);

      expect(result.organization).toBeNull();
      expect(result.installation.organizationId).toBeNull();
      expect(result.repositories[0]?.organizationId).toBeNull();
      expect(result.repositories[0]?.isPersonallyOwned).toBe(true);
    });

    /**
     * GitHub delivers webhooks at least once. The same installation event
     * arriving twice is ordinary traffic, not an error.
     */
    it("is idempotent, so a redelivered installation duplicates nothing", async () => {
      const first = await repository.install(ORG, [repo()]);
      const second = await repository.install(ORG, [repo()]);

      expect(second.organization?.id).toBe(first.organization?.id);
      expect(second.repositories[0]?.id).toBe(first.repositories[0]?.id);

      const [orgs] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from organizations`,
      );
      const [repos] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from repositories`,
      );
      expect(orgs?.count).toBe("1");
      expect(repos?.count).toBe("1");
    });

    it("refreshes a renamed organization and repository without moving the row", async () => {
      const first = await repository.install(ORG, [repo()]);
      const renamed = await repository.install({ ...ORG, accountLogin: "zit-devs" }, [
        repo({ nameWithOwner: "zit-devs/kreds" }),
      ]);

      expect(renamed.organization?.id).toBe(first.organization?.id);
      expect(renamed.organization?.login).toBe("zit-devs");
      expect(renamed.repositories[0]?.id).toBe(first.repositories[0]?.id);
      expect(renamed.repositories[0]?.nameWithOwner).toBe("zit-devs/kreds");
    });
  });

  describe("coverage", () => {
    it("adds repositories to an existing installation", async () => {
      await repository.install(ORG, [repo()]);
      const added = await repository.addRepositories(ORG.gitHubInstallationId, [
        repo({ gitHubRepositoryId: 77_003, nameWithOwner: "zitdevs/kreds-laws", isPrivate: true }),
      ]);

      expect(added).toHaveLength(1);
      expect(added[0]?.isPrivate).toBe(true);
      const covered = await repository.findCoveredRepositories(ORG.gitHubInstallationId);
      expect(covered).toHaveLength(2);
    });

    /**
     * Removal ends coverage without erasing the repository. 06: Ledger needs
     * history to stay reconstructible, and work already recorded against a
     * repository does not stop having happened when the App is unselected.
     */
    it("stops covering a repository without forgetting it", async () => {
      await repository.install(ORG, [repo()]);
      const removed = await repository.removeRepositories(ORG.gitHubInstallationId, [77_001]);

      expect(removed).toBe(1);
      expect(await repository.findCoveredRepositories(ORG.gitHubInstallationId)).toHaveLength(0);
      // Still on file.
      expect(await repository.findRepository(77_001)).not.toBeNull();
    });

    it("resumes the same row when a repository is added back", async () => {
      const first = await repository.install(ORG, [repo()]);
      await repository.removeRepositories(ORG.gitHubInstallationId, [77_001]);
      const again = await repository.addRepositories(ORG.gitHubInstallationId, [repo()]);

      expect(again[0]?.id).toBe(first.repositories[0]?.id);
      expect(await repository.findCoveredRepositories(ORG.gitHubInstallationId)).toHaveLength(1);
    });

    /**
     * The bug this guards: a rename arriving for a repository its owner had
     * deselected must not quietly put it back under coverage. The event says
     * what the repository is called, not that Kreds may watch it again.
     */
    it("refreshing a deselected repository does not re-cover it", async () => {
      await repository.install(ORG, [repo()]);
      await repository.removeRepositories(ORG.gitHubInstallationId, [77_001]);

      const refreshed = await repository.refreshRepository(
        repo({ nameWithOwner: "zitdevs/kreds-renamed" }),
      );

      expect(refreshed?.nameWithOwner).toBe("zitdevs/kreds-renamed");
      expect(await repository.findCoveredRepositories(ORG.gitHubInstallationId)).toHaveLength(0);
    });

    it("refreshing a repository it has never seen reports nothing", async () => {
      expect(await repository.refreshRepository(repo({ gitHubRepositoryId: 999 }))).toBeNull();
    });

    it("removing the same repository twice reports the second as a no-op", async () => {
      await repository.install(ORG, [repo()]);
      expect(await repository.removeRepositories(ORG.gitHubInstallationId, [77_001])).toBe(1);
      expect(await repository.removeRepositories(ORG.gitHubInstallationId, [77_001])).toBe(0);
    });

    /**
     * A repository's economic standing is earned under 25, over time, from
     * signals no webhook carries. If reinstalling reset it, toggling the App
     * off and on would launder an untrusted repository into a fresh start.
     */
    it("never resets a repository's trust tier", async () => {
      const first = await repository.install(ORG, [repo()]);
      await db.execute(
        sql`update repositories set trust_tier = 'RELEVANT' where id = ${first.repositories[0]?.id}`,
      );

      await repository.install(ORG, [repo()]);

      const after = await repository.findRepository(77_001);
      expect(after?.trustTier).toBe("RELEVANT");
    });
  });

  describe("lifecycle", () => {
    it("suspends and resumes without losing the installation", async () => {
      await repository.install(ORG, [repo()]);

      const suspended = await repository.setStatus(ORG.gitHubInstallationId, "SUSPENDED");
      expect(suspended.status).toBe("SUSPENDED");

      const resumed = await repository.setStatus(ORG.gitHubInstallationId, "ACTIVE");
      expect(resumed.status).toBe("ACTIVE");
      expect(await repository.findCoveredRepositories(ORG.gitHubInstallationId)).toHaveLength(1);
    });

    /**
     * GitHub reuses installation ids. A stale REMOVED left on the row would
     * leave a reconnected account permanently mute.
     */
    it("revives the row when the App is installed again after removal", async () => {
      await repository.install(ORG, [repo()]);
      await repository.setStatus(ORG.gitHubInstallationId, "REMOVED");

      const again = await repository.install(ORG, [repo()]);
      expect(again.installation.status).toBe("ACTIVE");
    });

    it("refuses to change the status of an installation it has never seen", async () => {
      await expect(repository.setStatus(gitHubInstallationId(1), "REMOVED")).rejects.toThrow(
        /not recorded/,
      );
    });

    it("refuses to add repositories to an installation it has never seen", async () => {
      await expect(repository.addRepositories(gitHubInstallationId(1), [repo()])).rejects.toThrow(
        /not recorded/,
      );
    });
  });
});
