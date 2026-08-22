import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import {
  buildIdempotencyKey,
  fromIso,
  gitHubInstallationId,
  gitHubUserId,
  repositoryId,
  type DomainEvent,
  type PullRequestMerged,
} from "@kreds/domain";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { EventStore } from "./event-store.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

let db: Database;
let store: EventStore;

const delivery = (over: Record<string, unknown> = {}) => ({
  gitHubDeliveryId: "11111111-2222-3333-4444-555555555555",
  eventType: "pull_request",
  action: "closed",
  payload: { action: "closed", pull_request: { number: 412 } },
  ...over,
});

function mergedEvent(prNumber = 412): PullRequestMerged {
  return {
    type: "PULL_REQUEST_MERGED",
    idempotencyKey: buildIdempotencyKey("PULL_REQUEST_MERGED", 77_001, prNumber),
    occurredAt: fromIso("2026-08-22T10:00:00Z"),
    repositoryId: repositoryId("77001"),
    gitHubInstallationId: gitHubInstallationId(48_291_037),
    pullRequestNumber: prNumber,
    authorGitHubUserId: gitHubUserId(4242),
    authorActorType: "HUMAN",
    authorLogin: "isaac",
    coAuthorGitHubUserIds: [],
    mergedToPrimaryBranch: true,
    mergedByGitHubUserId: gitHubUserId(9001),
    signals: { changedLines: 120, hasDescription: true, linksIssue: true },
  };
}

describeWithDatabase("EventStore", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 1 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(sql`truncate table domain_events, github_events cascade`);
    store = new EventStore(db);
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  describe("the raw log", () => {
    it("stores a delivery whole", async () => {
      const recorded = await store.record(delivery());
      expect(recorded.isRedelivery).toBe(false);
      expect(recorded.status).toBe("RECEIVED");
    });

    /**
     * GitHub retries a failed webhook with the same delivery id. That is
     * ordinary traffic, so it must be recognised rather than raise.
     */
    it("recognises a retry instead of throwing", async () => {
      const first = await store.record(delivery());
      const retry = await store.record(delivery());

      expect(retry.isRedelivery).toBe(true);
      expect(retry.id).toBe(first.id);
    });

    it("keeps the payload it was given, unedited", async () => {
      const recorded = await store.record(
        delivery({ payload: { action: "closed", odd: { nested: [1, 2, 3] } } }),
      );
      const [row] = await db.execute<{ payload: unknown }>(
        sql`select payload from github_events where id = ${recorded.id}`,
      );
      expect(row?.payload).toEqual({ action: "closed", odd: { nested: [1, 2, 3] } });
    });

    /**
     * The bug the end-to-end run caught and the unit tests missed, because
     * they never set an installation id.
     *
     * A delivery can legitimately arrive for an installation Kreds has not
     * recorded: the installation webhook failed, or arrived out of order, or
     * the App was installed while this instance was down. With a foreign key on
     * the column, Postgres rejected the insert and the raw log refused the
     * evidence at exactly the moment something had already gone wrong.
     */
    it("accepts a delivery for an installation it has never heard of", async () => {
      const recorded = await store.record(
        delivery({ gitHubInstallationId: gitHubInstallationId(999_999_999) }),
      );
      expect(recorded.isRedelivery).toBe(false);

      const [row] = await db.execute<{ github_installation_id: string }>(
        sql`select github_installation_id from github_events where id = ${recorded.id}`,
      );
      expect(Number(row?.github_installation_id)).toBe(999_999_999);
    });

    it("moves a delivery to its terminal state", async () => {
      const recorded = await store.record(delivery());

      await store.markProcessed(recorded.id);
      const [processed] = await db.execute<{ status: string; processed_at: string | null }>(
        sql`select status, processed_at from github_events where id = ${recorded.id}`,
      );
      expect(processed?.status).toBe("PROCESSED");
      expect(processed?.processed_at).not.toBeNull();
    });

    /**
     * Ignoring and failing are different facts. Most of what GitHub sends is
     * something Kreds does not read; recording that as failure would make the
     * failure count permanently meaningless.
     */
    it("keeps ignoring apart from failing", async () => {
      const ignored = await store.record(delivery());
      await store.markIgnored(ignored.id);

      const failed = await store.record(delivery({ gitHubDeliveryId: "other" }));
      await store.markFailed(failed.id, "the normaliser threw");

      const rows = await db.execute<{ status: string; failure_reason: string | null }>(
        sql`select status, failure_reason from github_events order by status`,
      );
      const statuses = rows.map((r) => r.status);
      expect(statuses).toContain("IGNORED");
      expect(statuses).toContain("FAILED");
      expect(rows.find((r) => r.status === "FAILED")?.failure_reason).toContain("normaliser");
    });

    /**
     * A process killed mid-delivery leaves rows that never reached a terminal
     * state. Without a way to list them the pipeline loses events silently,
     * which is the failure mode worth engineering against.
     */
    it("can list deliveries that never finished", async () => {
      const stuck = await store.record(delivery());
      const done = await store.record(delivery({ gitHubDeliveryId: "done" }));
      await store.markProcessed(done.id);

      const unfinished = await store.findUnfinished();
      expect(unfinished.map((d) => d.id)).toEqual([stuck.id]);
    });
  });

  describe("the fact", () => {
    it("records a domain event once", async () => {
      const result = await store.recordDomainEvent(mergedEvent());
      expect(result.isNew).toBe(true);

      const found = await store.findDomainEvent(result.idempotencyKey);
      expect(found?.type).toBe("PULL_REQUEST_MERGED");
    });

    /**
     * The Phase 3 guarantee, stated as its own test:
     *
     * > GitHub can replay the same webhook 10 times without creating duplicate
     * > domain activity.
     *
     * Ten *different* delivery ids, which is what pressing Redeliver produces,
     * so the raw log's uniqueness does not catch them. One fact.
     */
    it("survives ten replays through ten different deliveries", async () => {
      const deliveries: string[] = [];
      for (let i = 0; i < 10; i++) {
        const recorded = await store.record(delivery({ gitHubDeliveryId: `redelivery-${i}` }));
        deliveries.push(recorded.id);
        await store.recordDomainEvent(mergedEvent(), { gitHubEventId: recorded.id });
      }

      const [raw] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from github_events`,
      );
      const [facts] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from domain_events`,
      );

      // Every delivery is on file, because the evidence matters.
      expect(raw?.count).toBe("10");
      expect(new Set(deliveries).size).toBe(10);
      // Exactly one piece of economic activity.
      expect(facts?.count).toBe("1");
    });

    it("reports the repeat as not new, so a caller can tell", async () => {
      await store.recordDomainEvent(mergedEvent());
      const again = await store.recordDomainEvent(mergedEvent());
      expect(again.isNew).toBe(false);
    });

    /**
     * The first recording of a fact is the true one. Letting a later delivery
     * overwrite it would let a replayed webhook rewrite history that has
     * already been paid out.
     */
    it("does not let a replay overwrite the fact on file", async () => {
      const original = mergedEvent();
      await store.recordDomainEvent(original);

      const tampered: PullRequestMerged = {
        ...original,
        mergedToPrimaryBranch: false,
        pullRequestNumber: 999,
      };
      await store.recordDomainEvent(tampered);

      const stored = await store.findDomainEvent(original.idempotencyKey);
      expect(stored).toMatchObject({ mergedToPrimaryBranch: true, pullRequestNumber: 412 });
    });

    it("keeps different facts apart", async () => {
      await store.recordDomainEvent(mergedEvent(412));
      await store.recordDomainEvent(mergedEvent(413));

      const [facts] = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from domain_events`,
      );
      expect(facts?.count).toBe("2");
    });

    /**
     * Pruning the raw log must never delete economic history: the fact outlives
     * its evidence.
     */
    it("keeps the fact when its raw delivery is deleted", async () => {
      const recorded = await store.record(delivery());
      const fact = await store.recordDomainEvent(mergedEvent(), { gitHubEventId: recorded.id });

      await db.execute(sql`delete from github_events where id = ${recorded.id}`);

      const stored = await store.findDomainEvent(fact.idempotencyKey);
      expect(stored).not.toBeNull();
    });
  });
});
