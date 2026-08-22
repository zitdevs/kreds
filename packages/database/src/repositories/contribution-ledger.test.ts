import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import { gitHubUserId } from "@kreds/domain";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { ContributionLedger, type AwardInput } from "./contribution-ledger.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

let db: Database;
let ledger: ContributionLedger;

const ISAAC = gitHubUserId(4242);
const JOSE = gitHubUserId(9001);

const award = (over: Partial<AwardInput> = {}): AwardInput => ({
  idempotencyKey: "PULL_REQUEST_MERGED:77001:412",
  kind: "PULL_REQUEST_MERGED",
  gitHubUserId: ISAAC,
  points: 40,
  qualityScore: 75,
  rulesVersion: "v0.4",
  occurredAt: new Date("2026-08-22T10:00:00Z"),
  ...over,
});

describeWithDatabase("ContributionLedger", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 1 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(sql`truncate table contribution_entries cascade`);
    ledger = new ContributionLedger(db);
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  describe("recognising work", () => {
    it("records an award and derives the score from it", async () => {
      const result = await ledger.award(award());
      expect(result.isNew).toBe(true);

      const score = await ledger.scoreFor(ISAAC);
      expect(score.points).toBe(40);
    });

    /** A redelivered webhook, a backfill, or a replay recognises the same merge once. */
    it("is idempotent, so the same merge is recognised once", async () => {
      await ledger.award(award());
      const again = await ledger.award(award());

      expect(again.isNew).toBe(false);
      expect((await ledger.scoreFor(ISAAC)).points).toBe(40);
    });

    /**
     * The first recognition is the true one. Letting a replay rewrite it would
     * let a later scoring bug quietly restate what someone earned.
     */
    it("does not let a replay restate what was earned", async () => {
      await ledger.award(award());
      await ledger.award(award({ points: 999, qualityScore: 100 }));

      expect((await ledger.scoreFor(ISAAC)).points).toBe(40);
    });

    it("refuses a negative award rather than storing one", async () => {
      await expect(ledger.award(award({ points: -5 }))).rejects.toThrow(RangeError);
    });

    /**
     * 24: work outside a connected organization is still work. Points are
     * earned; only the organization scope is empty.
     */
    it("recognises work that belongs to no organization", async () => {
      await ledger.award(award({ organizationId: null }));
      expect((await ledger.scoreFor(ISAAC)).points).toBe(40);
    });
  });

  describe("taking recognition back", () => {
    /**
     * 05: Reversals. The award stays and a second entry cancels it, so the
     * history of a caught farmer is a trail rather than a gap.
     */
    it("cancels with a compensating entry and keeps the original", async () => {
      await ledger.award(award());
      const cancelled = await ledger.invalidate(award().idempotencyKey, "CONFIRMED_FARMING");

      expect(cancelled).not.toBeNull();
      expect((await ledger.scoreFor(ISAAC)).points).toBe(0);

      const [rows] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from contribution_entries`,
      );
      // Two rows: the award, and the entry that cancels it.
      expect(rows?.count).toBe("2");
    });

    it("does not subtract twice when the same revert arrives again", async () => {
      await ledger.award(award());
      await ledger.invalidate(award().idempotencyKey, "PR_REVERTED");
      const second = await ledger.invalidate(award().idempotencyKey, "PR_REVERTED");

      expect(second).toBeNull();
      expect((await ledger.scoreFor(ISAAC)).points).toBe(0);
    });

    it("reports nothing for an award it has never seen", async () => {
      expect(await ledger.invalidate("PULL_REQUEST_MERGED:0:0", "PR_REVERTED")).toBeNull();
    });

    /**
     * The compensating entry cancels what was actually given, so it carries the
     * version that produced the award rather than today's. Law XV: rules may
     * change, history may not.
     */
    it("cancels under the rules that made the award", async () => {
      await ledger.award(award({ rulesVersion: "v0.3" }));
      await ledger.invalidate(award().idempotencyKey, "PR_REVERTED");

      const [row] = await db.execute<{ rules_version: string }>(
        sql`select rules_version from contribution_entries where entry_type = 'INVALIDATION'`,
      );
      expect(row?.rules_version).toBe("v0.3");
    });

    /**
     * Law XXVII, the load-bearing one. There is no economic path to this
     * method: it cannot be reached without naming a trigger, and none of the
     * triggers is an economic event. This test states the guarantee that the
     * type system already enforces, so a future signature change has to break
     * something visible.
     */
    it("offers no way to reduce a score for an economic reason", () => {
      const surface = Object.getOwnPropertyNames(ContributionLedger.prototype);
      for (const name of surface) {
        expect(name).not.toMatch(/spend|transfer|exchange|convert|debit|charge/i);
      }
    });
  });

  describe("scopes", () => {
    const ZITDEVS = "11111111-1111-1111-1111-111111111111";

    beforeEach(async () => {
      await db.execute(
        sql`insert into organizations (id, github_organization_id, login) values (${ZITDEVS}, 9001, 'zitdevs') on conflict do nothing`,
      );
    });

    it("separates the global score from the organization score", async () => {
      await ledger.award(award({ organizationId: ZITDEVS, points: 30 }));
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:88001:1", organizationId: null, points: 20 }),
      );

      expect((await ledger.scoreFor(ISAAC)).points).toBe(50);
      expect((await ledger.scoreFor(ISAAC, ZITDEVS)).points).toBe(30);
    });
  });

  describe("the leaderboard", () => {
    it("ranks by points, highest first", async () => {
      await ledger.award(award({ gitHubUserId: ISAAC, points: 30 }));
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:77001:413", gitHubUserId: JOSE, points: 70 }),
      );

      const board = await ledger.leaderboard();
      expect(board.map((row) => row.gitHubUserId)).toEqual([JOSE, ISAAC]);
      expect(board[0]?.points).toBe(70);
    });

    /** A cancelled award must not still be ranking somebody. */
    it("reflects invalidations rather than raw awards", async () => {
      await ledger.award(award({ gitHubUserId: ISAAC, points: 90 }));
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:77001:413", gitHubUserId: JOSE, points: 70 }),
      );
      await ledger.invalidate(award().idempotencyKey, "CONFIRMED_FARMING");

      const board = await ledger.leaderboard();
      expect(board.map((row) => row.gitHubUserId)).toEqual([JOSE]);
    });

    it("is empty when nobody has contributed", async () => {
      expect(await ledger.leaderboard()).toEqual([]);
    });
  });
});
