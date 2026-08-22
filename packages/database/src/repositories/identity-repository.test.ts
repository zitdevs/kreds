import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { gitHubUserId } from "@kreds/domain";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { dirname, join } from "node:path";
import { IdentityRepository } from "./identity-repository.js";

/**
 * These run against a real Postgres, because the things worth checking here are
 * the things an in-memory fake would not have: the unique constraint on the
 * GitHub id, the upsert, and the transaction around a claim. A repository
 * verified only against a stub is a repository that has not been verified.
 *
 * CI provides the database as a service. Locally it needs `docker compose up -d
 * db`, and without `DATABASE_URL` the suite skips rather than failing, so a
 * clone with no Docker still gets a green `pnpm test`.
 */
const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

let db: Database;
let repository: IdentityRepository;

describeWithDatabase("IdentityRepository", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 1 });
    // Explicit folder: this file runs through vitest rather than the compiled
    // CommonJS build, where the default resolution lives.
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    // Identities reference users, so the order matters.
    await db.execute(sql`truncate table github_identities, users cascade`);
    repository = new IdentityRepository(db);
  });

  afterAll(async () => {
    // postgres-js keeps the process alive on an open pool.
    await db?.$client.end({ timeout: 5 });
  });

  const profile = (over: Partial<Parameters<IdentityRepository["observe"]>[0]> = {}) => ({
    gitHubUserId: gitHubUserId(4242),
    login: "maria",
    avatarUrl: "https://avatars.githubusercontent.com/u/4242",
    ...over,
  });

  /**
   * Law XVII, Unclaimed Identity Can Have History: an identity may be recorded
   * before anyone signs in, and Law XVIII keeps it passive until they do.
   */
  describe("observing an identity Kreds has seen on GitHub", () => {
    it("creates it unclaimed", async () => {
      const identity = await repository.observe(profile());
      expect(identity.status).toBe("UNCLAIMED");
      expect(identity.claimedAt).toBeNull();
      expect(identity.userId).toBeUndefined();
    });

    /**
     * 03: Pull Requests: classification comes from a registry, not from having
     * been seen. `UNKNOWN` earns nothing, which is the correct default until
     * that registry exists (Law XVI).
     */
    it("leaves the actor unclassified rather than assuming a human", async () => {
      const identity = await repository.observe(profile());
      expect(identity.actorType).toBe("UNKNOWN");
    });

    it("is idempotent, so a repeated webhook does not duplicate anyone", async () => {
      await repository.observe(profile());
      const again = await repository.observe(profile());
      expect(again.gitHubUserId).toBe(4242);
      const count = await db.execute(sql`select count(*)::int as n from github_identities`);
      expect((count as unknown as { n: number }[])[0]?.n).toBe(1);
    });

    /**
     * 09: Identity: logins are renameable and reusable, the numeric id is not.
     * A rename must update the display without moving any history.
     */
    it("follows a renamed login while keeping the same row", async () => {
      const before = await repository.observe(profile());
      const after = await repository.observe(profile({ login: "maria-dev" }));
      expect(after.login).toBe("maria-dev");
      expect(after.gitHubUserId).toBe(before.gitHubUserId);
      expect(after.observedAt).toBe(before.observedAt);
    });
  });

  describe("claiming an identity by signing in", () => {
    it("creates the account and attaches it", async () => {
      const { user, identity, hadPriorHistory } = await repository.claim(
        profile({ displayName: "Maria" }),
      );
      expect(user.displayName).toBe("Maria");
      expect(identity.status).toBe("CLAIMED");
      expect(identity.userId).toBe(user.id);
      expect(identity.claimedAt).not.toBeNull();
      expect(hadPriorHistory).toBe(false);
    });

    it("falls back to the login when GitHub has no display name", async () => {
      const { user } = await repository.claim(profile({ displayName: null }));
      expect(user.displayName).toBe("maria");
    });

    /**
     * The moment the whole design exists for. 09: Identity: "Your Kreds history
     * starts before your Kreds account does."
     */
    it("attaches an identity that was already earning, and says so", async () => {
      const observed = await repository.observe(profile());
      const { identity, hadPriorHistory } = await repository.claim(profile());
      expect(hadPriorHistory).toBe(true);
      expect(identity.status).toBe("CLAIMED");
      // Same row, so whatever it earned while unclaimed came with it.
      expect(identity.observedAt).toBe(observed.observedAt);
    });

    it("is idempotent, so signing in twice is not an event", async () => {
      const first = await repository.claim(profile());
      const second = await repository.claim(profile());
      expect(second.user.id).toBe(first.user.id);
      expect(second.hadPriorHistory).toBe(false);
      const count = await db.execute(sql`select count(*)::int as n from users`);
      expect((count as unknown as { n: number }[])[0]?.n).toBe(1);
    });

    /**
     * Regression. The early return for an already-claimed identity used to skip
     * the update entirely, so a rename never reached anyone who had signed in,
     * which is exactly the population that sees their own handle.
     */
    it("refreshes the handle and avatar when a returning person has been renamed", async () => {
      await repository.claim(profile({ displayName: "Maria" }));
      const again = await repository.claim(
        profile({ login: "maria-dev", avatarUrl: "https://example.test/new.png" }),
      );
      expect(again.identity.login).toBe("maria-dev");

      const account = await repository.findAccount(gitHubUserId(4242));
      expect(account?.identity.login).toBe("maria-dev");
      expect(account?.avatarUrl).toBe("https://example.test/new.png");
    });

    /**
     * The account's own name belongs to the Kreds account, not to GitHub.
     * Overwriting it on every sign-in would silently undo an edit the moment a
     * profile page exists.
     */
    it("does not overwrite the account name from GitHub on a later sign-in", async () => {
      const first = await repository.claim(profile({ displayName: "Maria" }));
      const second = await repository.claim(profile({ displayName: "Someone Else" }));
      expect(second.user.displayName).toBe("Maria");
      expect(second.user.id).toBe(first.user.id);
    });

    it("keeps two different GitHub identities apart", async () => {
      const a = await repository.claim(profile());
      const b = await repository.claim(profile({ gitHubUserId: gitHubUserId(99), login: "jose" }));
      expect(b.user.id).not.toBe(a.user.id);
    });
  });

  /**
   * A session check needs the person's name, which lives on the account, and
   * their handle and avatar, which are mirrored from GitHub onto the identity.
   */
  describe("reading an identity together with its account", () => {
    it("returns both halves once claimed", async () => {
      await repository.claim(profile({ displayName: "Maria" }));
      const account = await repository.findAccount(gitHubUserId(4242));
      expect(account?.user.displayName).toBe("Maria");
      expect(account?.identity.login).toBe("maria");
      expect(account?.avatarUrl).toContain("avatars.githubusercontent.com");
    });

    /** Unclaimed means nobody is signed in, which is the same answer as unknown. */
    it("returns null while the identity is only observed", async () => {
      await repository.observe(profile());
      expect(await repository.findAccount(gitHubUserId(4242))).toBeNull();
    });

    it("returns null for an identity Kreds has never seen", async () => {
      expect(await repository.findAccount(gitHubUserId(1234))).toBeNull();
    });
  });

  describe("looking an identity up", () => {
    it("returns null for one Kreds has never seen", async () => {
      expect(await repository.findByGitHubUserId(gitHubUserId(1234))).toBeNull();
    });

    it("returns the identity once observed", async () => {
      await repository.observe(profile());
      const found = await repository.findByGitHubUserId(gitHubUserId(4242));
      expect(found?.login).toBe("maria");
    });
  });
});
