import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { Consents, UnpublishedConsentError } from "./consents.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

const ISAAC = 4242;
const JOSE = 4343;
const ISAAC_USER = "00000000-0000-4000-8000-000000004242";
const JOSE_USER = "00000000-0000-4000-8000-000000004343";
const T0 = new Date("2026-11-01T12:00:00Z");
const T1 = new Date("2026-11-02T12:00:00Z");
const T2 = new Date("2026-11-03T12:00:00Z");

let db: Database;
let consents: Consents;

const publicV1 = { kind: "PUBLIC_ACTIVITY", version: "public-activity-v1" } as const;
const privateV1 = { kind: "PRIVATE_ACTIVITY", version: "private-activity-v1" } as const;

describeWithDatabase("Consents", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 4 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(sql`truncate table activity_consents, github_identities, users cascade`);
    for (const [id, userId, login] of [
      [ISAAC, ISAAC_USER, "isaac"],
      [JOSE, JOSE_USER, "jose"],
    ] as const) {
      await db.execute(sql`insert into users (id, display_name) values (${userId}, ${login})`);
      await db.execute(
        sql`insert into github_identities (github_user_id, login, user_id) values (${id}, ${login}, ${userId})`,
      );
    }
    consents = new Consents(db);
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  const record = (
    terms: { kind: "PUBLIC_ACTIVITY" | "PRIVATE_ACTIVITY"; version: string },
    at: Date,
    who: { gitHubUserId: number; userId: string } = { gitHubUserId: ISAAC, userId: ISAAC_USER },
  ) => consents.record({ ...who, ...terms, at });

  describe("recording what a person agreed to", () => {
    it("reports the active consent of each kind with its version and when", async () => {
      expect(await consents.activeOf(ISAAC)).toEqual({
        PUBLIC_ACTIVITY: null,
        PRIVATE_ACTIVITY: null,
      });

      await record(publicV1, T0);
      await record(privateV1, T1);

      expect(await consents.activeOf(ISAAC)).toEqual({
        PUBLIC_ACTIVITY: { version: "public-activity-v1", grantedAt: T0 },
        PRIVATE_ACTIVITY: { version: "private-activity-v1", grantedAt: T1 },
      });
      expect(await consents.activeOf(JOSE)).toEqual({
        PUBLIC_ACTIVITY: null,
        PRIVATE_ACTIVITY: null,
      });
    });

    /** Every clickwrap is its own act, so a second agreement is a second row. */
    it("appends a second agreement rather than rewriting the first", async () => {
      await record(publicV1, T0);
      await record(publicV1, T1);

      const rows = await db.execute<{ granted_at: string }>(
        sql`select granted_at from activity_consents where github_user_id = ${ISAAC} order by granted_at`,
      );
      expect(rows.map((row) => new Date(row.granted_at).toISOString())).toEqual([
        T0.toISOString(),
        T1.toISOString(),
      ]);
      expect((await consents.activeOf(ISAAC)).PUBLIC_ACTIVITY?.grantedAt).toEqual(T1);
    });

    /** A version nobody was ever shown is not something anybody agreed to. */
    it("refuses a version that was never published", async () => {
      await expect(
        record({ kind: "PUBLIC_ACTIVITY", version: "public-activity-v0" }, T0),
      ).rejects.toThrow(UnpublishedConsentError);
    });

    it("refuses a version published for the other kind", async () => {
      await expect(
        record({ kind: "PUBLIC_ACTIVITY", version: "private-activity-v1" }, T0),
      ).rejects.toThrow(UnpublishedConsentError);
    });
  });

  describe("revocation", () => {
    it("marks every active consent revoked and reports how many", async () => {
      await record(publicV1, T0);
      await record(privateV1, T1);
      await record(publicV1, T0, { gitHubUserId: JOSE, userId: JOSE_USER });

      expect(await consents.revokeAll(ISAAC, T2)).toBe(2);

      expect(await consents.activeOf(ISAAC)).toEqual({
        PUBLIC_ACTIVITY: null,
        PRIVATE_ACTIVITY: null,
      });
      expect((await consents.activeOf(JOSE)).PUBLIC_ACTIVITY).not.toBeNull();
    });

    it("keeps the history: rows are marked, never removed", async () => {
      await record(publicV1, T0);
      await consents.revokeAll(ISAAC, T2);

      const rows = await db.execute<{ revoked_at: string | null; version: string }>(
        sql`select revoked_at, version from activity_consents where github_user_id = ${ISAAC}`,
      );
      expect(rows).toHaveLength(1);
      expect(new Date(rows[0]?.revoked_at ?? 0).toISOString()).toBe(T2.toISOString());
      expect(rows[0]?.version).toBe("public-activity-v1");
    });

    it("leaves an earlier revocation's date alone", async () => {
      await record(publicV1, T0);
      await consents.revokeAll(ISAAC, T1);
      expect(await consents.revokeAll(ISAAC, T2)).toBe(0);

      const rows = await db.execute<{ revoked_at: string }>(
        sql`select revoked_at from activity_consents where github_user_id = ${ISAAC}`,
      );
      expect(new Date(rows[0]?.revoked_at ?? 0).toISOString()).toBe(T1.toISOString());
    });

    it("lets a person agree again after revoking", async () => {
      await record(publicV1, T0);
      await consents.revokeAll(ISAAC, T1);
      await record(publicV1, T2);

      expect((await consents.activeOf(ISAAC)).PUBLIC_ACTIVITY).toEqual({
        version: "public-activity-v1",
        grantedAt: T2,
      });
    });
  });

  /**
   * The table is a record of what people agreed to. The database itself
   * refuses to forget a row or to change what one says, so a future code path
   * that tried would fail loudly instead of quietly rewriting history.
   */
  describe("the record cannot be rewritten", () => {
    it("refuses to delete a consent", async () => {
      await record(publicV1, T0);
      await expect(db.execute(sql`delete from activity_consents`)).rejects.toThrow();
    });

    it("refuses to change what a consent says", async () => {
      await record(publicV1, T0);
      await expect(
        db.execute(sql`update activity_consents set version = 'public-activity-v9'`),
      ).rejects.toThrow();
      await expect(
        db.execute(sql`update activity_consents set granted_at = ${T2.toISOString()}::timestamptz`),
      ).rejects.toThrow();
    });

    it("refuses to un-revoke or re-date a revocation", async () => {
      await record(publicV1, T0);
      await consents.revokeAll(ISAAC, T1);
      await expect(
        db.execute(sql`update activity_consents set revoked_at = null`),
      ).rejects.toThrow();
      await expect(
        db.execute(sql`update activity_consents set revoked_at = ${T2.toISOString()}::timestamptz`),
      ).rejects.toThrow();
    });
  });
});
