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

      const { entries: board } = await ledger.leaderboard(null, { limit: 25 });
      expect(board.map((row) => row.gitHubUserId)).toEqual([JOSE, ISAAC]);
      expect(board[0]?.points).toBe(70);
      expect(board.map((row) => row.rank)).toEqual([1, 2]);
    });

    /** A cancelled award must not still be ranking somebody. */
    it("reflects invalidations rather than raw awards", async () => {
      await ledger.award(award({ gitHubUserId: ISAAC, points: 90 }));
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:77001:413", gitHubUserId: JOSE, points: 70 }),
      );
      await ledger.invalidate(award().idempotencyKey, "CONFIRMED_FARMING");

      const { entries: board } = await ledger.leaderboard(null, { limit: 25 });
      expect(board.map((row) => row.gitHubUserId)).toEqual([JOSE]);
    });

    it("is empty when nobody has contributed", async () => {
      expect(await ledger.leaderboard(null, { limit: 25 })).toEqual({ entries: [], next: null });
    });

    /**
     * A page further down still ranks against everybody. Ranks are computed
     * over the whole board, not restarted at one on every page.
     */
    it("pages through the board with ranks that hold across pages", async () => {
      const people = [
        { id: 101, points: 90 },
        { id: 102, points: 70 },
        { id: 103, points: 70 },
        { id: 104, points: 50 },
        { id: 105, points: 10 },
      ];
      for (const person of people) {
        await ledger.award(
          award({
            idempotencyKey: `PULL_REQUEST_MERGED:${person.id}:1`,
            gitHubUserId: gitHubUserId(person.id),
            points: person.points,
          }),
        );
      }

      const first = await ledger.leaderboard(null, { limit: 2 });
      expect(first.entries.map((row) => [row.gitHubUserId, row.rank])).toEqual([
        [101, 1],
        [102, 2],
      ]);
      expect(first.next).not.toBeNull();

      const second = await ledger.leaderboard(null, { limit: 2, after: first.next! });
      expect(second.entries.map((row) => [row.gitHubUserId, row.rank])).toEqual([
        [103, 2],
        [104, 3],
      ]);

      const third = await ledger.leaderboard(null, { limit: 2, after: second.next! });
      expect(third.entries.map((row) => [row.gitHubUserId, row.rank])).toEqual([[105, 4]]);
      expect(third.next).toBeNull();
    });

    /** Somebody whose awards were all cancelled is not listed, and does not hold a rank. */
    it("leaves out anyone at zero, without spending a rank on them", async () => {
      await ledger.award(award({ gitHubUserId: ISAAC, points: 30 }));
      await ledger.invalidate(award().idempotencyKey, "PR_REVERTED");
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:77001:413", gitHubUserId: JOSE, points: 5 }),
      );

      const { entries } = await ledger.leaderboard(null, { limit: 25 });
      expect(entries).toEqual([{ rank: 1, gitHubUserId: JOSE, points: 5 }]);
    });

    it("agrees with the rank the dashboard summary reports", async () => {
      await ledger.award(award({ gitHubUserId: ISAAC, points: 30 }));
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:77001:413", gitHubUserId: JOSE, points: 70 }),
      );

      const { entries } = await ledger.leaderboard(null, { limit: 25 });
      const isaac = entries.find((row) => row.gitHubUserId === ISAAC);
      expect(isaac?.rank).toBe((await ledger.summaryFor(ISAAC)).rank);
    });
  });

  /**
   * A signed-in user's own history, for their dashboard. Only ever their own
   * rows: the caller is session-bound, and this query is the second guarantee.
   */
  describe("one user's own entries", () => {
    let repositoryId: string;

    beforeEach(async () => {
      await db.execute(sql`truncate table domain_events, repositories cascade`);
      const rows = await db.execute<{ id: string }>(sql`
        insert into repositories (github_repository_id, name_with_owner, is_private, is_personally_owned)
        values (77001, 'isaac/secret-side-project', true, true) returning id`);
      repositoryId = [...rows][0]?.id as string;
      await db.execute(sql`
        insert into domain_events (idempotency_key, type, data, occurred_at) values
        ('PULL_REQUEST_MERGED:77001:412', 'PULL_REQUEST_MERGED', '{"pullRequestNumber":412}', now()),
        ('REVIEW_SUBMITTED:55001', 'REVIEW_SUBMITTED', '{"pullRequestNumber":9}', now())`);
    });

    const at = (iso: string) => new Date(iso);

    it("lists only this user's awards, newest first, with the repository and source", async () => {
      await ledger.award(
        award({ repositoryId, observed: false, occurredAt: at("2026-08-20T10:00:00Z") }),
      );
      await ledger.award(
        award({
          idempotencyKey: "REVIEW_SUBMITTED:55001",
          kind: "CODE_REVIEW",
          repositoryId,
          observed: true,
          points: 12,
          occurredAt: at("2026-08-21T10:00:00Z"),
        }),
      );
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:77001:500", gitHubUserId: JOSE }),
      );

      const page = await ledger.entriesFor(ISAAC, { limit: 10 });

      expect(page.next).toBeNull();
      expect(page.entries).toEqual([
        expect.objectContaining({
          kind: "CODE_REVIEW",
          points: 12,
          observed: true,
          invalidated: false,
          repository: { nameWithOwner: "isaac/secret-side-project", isPrivate: true },
          source: { pullRequestNumber: 9, reviewId: 55001 },
        }),
        expect.objectContaining({
          kind: "PULL_REQUEST_MERGED",
          points: 40,
          observed: false,
          rulesVersion: "v0.4",
          source: { pullRequestNumber: 412, reviewId: null },
        }),
      ]);
    });

    /** 05: a correction is a second row. The award stays visible, marked, never hidden. */
    it("shows an invalidated award as invalidated rather than hiding it", async () => {
      await ledger.award(award());
      await ledger.invalidate(award().idempotencyKey, "PR_REVERTED");

      const page = await ledger.entriesFor(ISAAC, { limit: 10 });

      expect(page.entries).toHaveLength(1);
      expect(page.entries[0]).toMatchObject({ points: 40, invalidated: true });
    });

    it("reads an unknown repository and source as unknown", async () => {
      await ledger.award(award({ idempotencyKey: "PULL_REQUEST_MERGED:1:1" }));

      const [entry] = (await ledger.entriesFor(ISAAC, { limit: 10 })).entries;

      expect(entry).toMatchObject({
        repository: null,
        source: { pullRequestNumber: null, reviewId: null },
      });
    });

    it("pages with a cursor, without repeating or skipping an entry", async () => {
      for (let day = 1; day <= 5; day += 1) {
        await ledger.award(
          award({
            idempotencyKey: `PULL_REQUEST_MERGED:1:${day}`,
            // Three on the same instant, so a page boundary falls inside the
            // tie and the id tiebreak is what keeps the cursor exact.
            occurredAt: at(`2026-08-0${Math.min(day, 3)}T10:00:00Z`),
          }),
        );
      }

      const seen: string[] = [];
      let cursor: { occurredAt: Date; id: string } | null = null;
      do {
        const page = await ledger.entriesFor(ISAAC, {
          limit: 2,
          ...(cursor ? { before: cursor } : {}),
        });
        expect(page.entries.length).toBeLessThanOrEqual(2);
        seen.push(...page.entries.map((entry) => entry.id));
        cursor = page.next;
      } while (cursor);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });
  });

  describe("one user's summary", () => {
    it("totals as the score does, ranks as the leaderboard does, and counts standing work by kind", async () => {
      await ledger.award(award({ points: 30 }));
      await ledger.award(
        award({ idempotencyKey: "REVIEW_SUBMITTED:1", kind: "CODE_REVIEW", points: 10 }),
      );
      await ledger.award(award({ idempotencyKey: "PULL_REQUEST_MERGED:1:2", points: 5 }));
      await ledger.invalidate("PULL_REQUEST_MERGED:1:2", "PR_REVERTED");
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:9:1", gitHubUserId: JOSE, points: 70 }),
      );

      const summary = await ledger.summaryFor(ISAAC);
      const { entries: board } = await ledger.leaderboard(null, { limit: 25 });

      expect(summary.points).toBe((await ledger.scoreFor(ISAAC)).points);
      expect(summary.points).toBe(40);
      expect(summary.rank).toBe(2);
      expect(board.findIndex((row) => row.gitHubUserId === ISAAC) + 1).toBe(summary.rank);
      expect(summary.byKind).toEqual({
        PULL_REQUEST_MERGED: 1,
        CODE_REVIEW: 1,
        ISSUE_RESOLVED: 0,
        REVIEW_FOLLOW_UP: 0,
      });
    });

    it("shares a rank on equal points, as the leaderboard does", async () => {
      await ledger.award(award({ points: 70 }));
      await ledger.award(
        award({ idempotencyKey: "PULL_REQUEST_MERGED:9:1", gitHubUserId: JOSE, points: 70 }),
      );

      expect((await ledger.summaryFor(ISAAC)).rank).toBe(1);
    });

    /** Dense: two people tied above share one rank, so the next is one below them. */
    it("counts distinct higher totals, not people", async () => {
      await ledger.award(award({ points: 10 }));
      for (const [key, who] of [
        ["PULL_REQUEST_MERGED:9:1", JOSE],
        ["PULL_REQUEST_MERGED:9:2", gitHubUserId(7777)],
      ] as const) {
        await ledger.award(award({ idempotencyKey: key, gitHubUserId: who, points: 70 }));
      }

      expect((await ledger.summaryFor(ISAAC)).rank).toBe(2);
    });

    /** The leaderboard lists nobody at zero, so there is no rank to report. */
    it("has no rank with no standing points", async () => {
      expect(await ledger.summaryFor(ISAAC)).toMatchObject({ points: 0, rank: null });
    });
  });

  /**
   * The tally the chapter 24 cap is applied on. It only means something if it
   * counts exactly the unobserved points that are still standing, inside the
   * window being asked about.
   */
  describe("the unobserved tally", () => {
    const day = new Date("2026-03-14T00:00:00Z");
    const nextDay = new Date("2026-03-15T00:00:00Z");
    const unobserved = (over: Partial<AwardInput> = {}) =>
      award({ observed: false, occurredAt: new Date("2026-03-14T15:00:00Z"), ...over });

    it("counts unobserved points earned inside the window", async () => {
      await ledger.award(unobserved());

      expect(await ledger.unobservedPointsBetween(4242, day, nextDay)).toBe(40);
    });

    it("ignores observed work and work that was never evaluated", async () => {
      await ledger.award(
        unobserved({ idempotencyKey: "PULL_REQUEST_MERGED:77001:1", observed: true }),
      );
      // No `observed` at all: the shape every pre-A04 row has.
      await ledger.award(
        award({
          idempotencyKey: "PULL_REQUEST_MERGED:77001:2",
          occurredAt: new Date("2026-03-14T15:00:00Z"),
        }),
      );

      expect(await ledger.unobservedPointsBetween(4242, day, nextDay)).toBe(0);
    });

    /** A reverted pull request must stop consuming the allowance it used. */
    it("stops counting an award once it is invalidated", async () => {
      await ledger.award(unobserved());
      await ledger.invalidate(unobserved().idempotencyKey, "PR_REVERTED");

      expect(await ledger.unobservedPointsBetween(4242, day, nextDay)).toBe(0);
    });

    /**
     * Backfill arrives newest-first, so a later day can already be recorded
     * when an earlier day's merge is evaluated. It must not spend that day's
     * allowance.
     */
    it("does not count a later day's work against an earlier day", async () => {
      await ledger.award(
        unobserved({
          idempotencyKey: "PULL_REQUEST_MERGED:77001:500",
          occurredAt: new Date("2026-03-15T09:00:00Z"),
        }),
      );

      expect(await ledger.unobservedPointsBetween(4242, day, nextDay)).toBe(0);
    });
  });
});
