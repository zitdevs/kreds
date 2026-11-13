import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { NetworkSubmissions } from "./network-submissions.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

const T0 = new Date("2026-11-01T12:00:00Z");
const T1 = new Date("2026-11-02T12:00:00Z");
const T2 = new Date("2026-11-03T12:00:00Z");

const MERGE = "PULL_REQUEST_MERGED:77001:412";
const REVIEW = "REVIEW_SUBMITTED:77001:412:5001";

const candidate = (idempotencyKey: string) => ({
  idempotencyKey,
  kind: "PULL_REQUEST_MERGED" as const,
  candidate: { idempotencyKey, kind: "PULL_REQUEST_MERGED", structure: {} },
  at: T0,
});

const deferred = { outcome: "DEFERRED", reason: "UNDER_REVIEW", rulesVersion: "v0.8" } as const;
const declined = {
  outcome: "DECLINED",
  reason: "REPOSITORY_NOT_ELIGIBLE",
  rulesVersion: "v0.8",
} as const;

let db: Database;
let submissions: NetworkSubmissions;

describeWithDatabase("NetworkSubmissions", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 4 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(sql`truncate table network_decisions, network_candidates cascade`);
    submissions = new NetworkSubmissions(db);
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  describe("recording a candidate", () => {
    it("records it unsubmitted, once, however often it is offered", async () => {
      expect(await submissions.record(candidate(MERGE))).toEqual({ isNew: true });
      expect(await submissions.record(candidate(MERGE))).toEqual({ isNew: false });

      expect(await submissions.find(MERGE)).toMatchObject({
        status: "UNSUBMITTED",
        attempts: 0,
        decisions: [],
      });
    });

    /** A retry resubmits the evidence first offered, not a later reassembly. */
    it("keeps the evidence first offered when the same fact arrives again", async () => {
      await submissions.record(candidate(MERGE));
      await submissions.record({ ...candidate(MERGE), candidate: { changed: true } });

      expect((await submissions.find(MERGE))?.candidate).toEqual(candidate(MERGE).candidate);
    });
  });

  describe("recording what the Network answered", () => {
    it("marks the candidate submitted and keeps the rules version that decided it", async () => {
      await submissions.record(candidate(MERGE));
      await submissions.recordDecision(MERGE, deferred, T1);

      expect(await submissions.find(MERGE)).toMatchObject({
        status: "SUBMITTED",
        attempts: 1,
        lastAttemptedAt: T1,
        decisions: [{ ...deferred, receivedAt: T1 }],
      });
    });

    /** Law XV: history may not change. A later answer never erases an earlier one. */
    it("appends a different later answer and keeps the earlier one", async () => {
      await submissions.record(candidate(MERGE));
      await submissions.recordDecision(MERGE, deferred, T1);
      await submissions.recordDecision(MERGE, declined, T2);

      expect((await submissions.find(MERGE))?.decisions).toEqual([
        { ...deferred, receivedAt: T1 },
        { ...declined, receivedAt: T2 },
      ]);
    });

    /**
     * The sweep asks again about every deferral. The same answer each time is
     * one fact, not a growing pile of identical rows.
     */
    it("does not repeat an answer identical to the latest one", async () => {
      await submissions.record(candidate(MERGE));
      expect(await submissions.recordDecision(MERGE, deferred, T1)).toEqual({ appended: true });
      expect(await submissions.recordDecision(MERGE, deferred, T2)).toEqual({ appended: false });

      const found = await submissions.find(MERGE);
      expect(found?.decisions).toHaveLength(1);
      expect(found).toMatchObject({ attempts: 2, lastAttemptedAt: T2 });
    });

    it("counts an unanswered attempt without inventing a decision", async () => {
      await submissions.record(candidate(MERGE));
      await submissions.recordUnanswered(MERGE, T1);

      expect(await submissions.find(MERGE)).toMatchObject({
        status: "UNSUBMITTED",
        attempts: 1,
        lastAttemptedAt: T1,
        decisions: [],
      });
    });

    it("refuses a decision for a candidate it never recorded", async () => {
      await expect(submissions.recordDecision(MERGE, deferred, T1)).rejects.toThrow();
    });
  });

  describe("the history cannot be rewritten underneath", () => {
    it("refuses to edit or delete a decision", async () => {
      await submissions.record(candidate(MERGE));
      await submissions.recordDecision(MERGE, deferred, T1);

      await expect(
        db.execute(sql`update network_decisions set outcome = 'ISSUED', reason = 'ISSUED'`),
      ).rejects.toThrow();
      await expect(db.execute(sql`delete from network_decisions`)).rejects.toThrow();
    });

    it("refuses to rewrite the evidence, delete it, or unsubmit it", async () => {
      await submissions.record(candidate(MERGE));
      await submissions.recordDecision(MERGE, deferred, T1);

      await expect(
        db.execute(sql`update network_candidates set candidate = '{}'::jsonb`),
      ).rejects.toThrow();
      await expect(
        db.execute(sql`update network_candidates set status = 'UNSUBMITTED'`),
      ).rejects.toThrow();
      await expect(db.execute(sql`delete from network_candidates`)).rejects.toThrow();
    });

    /** A decision is the Network's answer. It reaches no balance and no ledger. */
    it("moves no ledger entry and no Contribution Point", async () => {
      const count = async () => {
        const [row] = await db.execute<{ ledger: string; points: string }>(
          sql`select (select count(*) from ledger_entries) as ledger,
                     (select count(*) from contribution_entries) as points`,
        );
        return row;
      };
      const before = await count();

      await submissions.record(candidate(MERGE));
      await submissions.recordDecision(
        MERGE,
        { outcome: "ISSUED", reason: "ISSUED", rulesVersion: "v0.8" },
        T1,
      );

      expect(await count()).toEqual(before);
    });
  });

  describe("what is due for another submission", () => {
    /**
     * Unanswered and deferred are open questions; a decline or an issuance is
     * an answer, and asking again would only invite the Network to repeat it.
     */
    it("returns unsubmitted and deferred candidates, and nothing decided", async () => {
      await submissions.record(candidate(MERGE));
      await submissions.record(candidate(REVIEW));
      await submissions.record(candidate("declined"));
      await submissions.record(candidate("issued"));
      await submissions.record(candidate("deferred-then-declined"));

      await submissions.recordDecision(REVIEW, deferred, T1);
      await submissions.recordDecision("declined", declined, T1);
      await submissions.recordDecision(
        "issued",
        { outcome: "ISSUED", reason: "ISSUED", rulesVersion: "v0.8" },
        T1,
      );
      await submissions.recordDecision("deferred-then-declined", deferred, T1);
      await submissions.recordDecision("deferred-then-declined", declined, T2);

      const due = await submissions.dueForSubmission(10);
      expect(due.map(({ idempotencyKey }) => idempotencyKey).sort()).toEqual([MERGE, REVIEW]);
      expect(due.find(({ idempotencyKey }) => idempotencyKey === MERGE)?.candidate).toEqual(
        candidate(MERGE).candidate,
      );
    });

    /** Least recently tried first, so a bounded sweep cannot starve anybody. */
    it("puts the least recently attempted first, and honours the limit", async () => {
      await submissions.record(candidate("a"));
      await submissions.record(candidate("b"));
      await submissions.record(candidate("c"));
      await submissions.recordUnanswered("a", T2);
      await submissions.recordUnanswered("b", T1);

      const due = await submissions.dueForSubmission(2);
      expect(due.map(({ idempotencyKey }) => idempotencyKey)).toEqual(["c", "b"]);
    });
  });
});
