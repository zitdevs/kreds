import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { dirname, join } from "node:path";

import { createDatabase, type Database } from "../client.js";
import { runMigrations } from "../migrate.js";
import { TokenCipher, TokenDecryptionError, TokenKeyError } from "../crypto/token-cipher.js";
import {
  AuthorizationRevokedError,
  Authorizations,
  RateBudgetExhaustedError,
} from "./authorizations.js";

const url = process.env["DATABASE_URL"];
const describeWithDatabase = url ? describe : describe.skip;

const KEY = randomBytes(32).toString("base64");
const TOKEN = "gho_averyrealisticlookinggithubtokenvalue0000";
const ISAAC = 4242;
const JOSE = 4343;
const NOW = new Date("2026-08-22T12:00:00Z");
const MINUTE = 60_000;

let db: Database;
let authorizations: Authorizations;

describe("TokenCipher", () => {
  const cipher = new TokenCipher(KEY);

  it("round-trips a token", () => {
    expect(cipher.open(cipher.seal(TOKEN))).toBe(TOKEN);
  });

  /** A reused nonce in GCM is catastrophic, so every seal gets a fresh one. */
  it("never reuses a nonce, so the same token seals differently every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => cipher.seal(TOKEN).nonce));
    expect(nonces.size).toBe(50);
  });

  it("leaks nothing about the token into the ciphertext it stores", () => {
    const sealed = cipher.seal(TOKEN);
    expect(sealed.ciphertext).not.toContain("gho_");
    expect(sealed.ciphertext).not.toContain(TOKEN.slice(0, 8));
  });

  /**
   * GCM's tag is why this is GCM. A modified ciphertext must fail rather than
   * decrypt to something: a token that decrypts to the wrong bytes gets sent to
   * GitHub, and a token sent to GitHub can leave in a log line on the way.
   */
  it("refuses a ciphertext somebody edited", () => {
    const sealed = cipher.seal(TOKEN);
    const tampered = { ...sealed, ciphertext: Buffer.from("evil").toString("base64") };
    expect(() => cipher.open(tampered)).toThrow(TokenDecryptionError);
  });

  it("refuses a tag somebody edited", () => {
    const sealed = cipher.seal(TOKEN);
    expect(() => cipher.open({ ...sealed, tag: randomBytes(16).toString("base64") })).toThrow(
      TokenDecryptionError,
    );
  });

  it("refuses a token sealed under a different key", () => {
    const sealed = new TokenCipher(randomBytes(32).toString("base64")).seal(TOKEN);
    expect(() => cipher.open(sealed)).toThrow(TokenDecryptionError);
  });

  /**
   * A key this process invented would change on restart, silently orphaning
   * every stored authorization. So a short or malformed key is a startup
   * failure, not something to pad.
   */
  it("refuses a key that is not exactly 32 bytes", () => {
    expect(() => new TokenCipher(randomBytes(16).toString("base64"))).toThrow(TokenKeyError);
    expect(() => new TokenCipher("")).toThrow(TokenKeyError);
  });

  /**
   * The usual redaction shows leading characters, which is wrong here: GitHub
   * tokens carry a fixed prefix, so the "safe" part identifies the token type
   * and the rest is what was left to guess.
   */
  it("redacts without deriving anything from the secret", async () => {
    const { redacted } = await import("../crypto/token-cipher.js");
    expect(redacted()).not.toContain("gho");
    expect(redacted()).toBe("[redacted authorization]");
  });
});

describeWithDatabase("Authorizations", () => {
  beforeEach(async () => {
    db ??= createDatabase({ url: url as string, max: 4 });
    const here = dirname(new URL(import.meta.url).pathname);
    await runMigrations(url as string, join(here, "..", "..", "migrations"));
    await db.execute(sql`truncate table delegated_authorizations, github_identities cascade`);
    for (const [id, login] of [
      [ISAAC, "isaac"],
      [JOSE, "jose"],
    ] as const) {
      await db.execute(
        sql`insert into github_identities (github_user_id, login) values (${id}, ${login})`,
      );
    }
    authorizations = new Authorizations(db, new TokenCipher(KEY));
  });

  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  describe("a token is stored sealed and never anywhere else", () => {
    it("puts no plaintext token in any column of any table", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);

      const rows = await db.execute<Record<string, unknown>>(
        sql`select * from delegated_authorizations`,
      );
      const everything = JSON.stringify(rows);
      expect(everything).not.toContain(TOKEN);
      expect(everything).not.toContain("gho_");
    });

    /**
     * The schema-level version of the same claim, which survives a future
     * developer adding a column with a helpful name.
     */
    it("has no column anywhere that could hold a plaintext token", async () => {
      const columns = await db.execute<{ name: string }>(
        sql`select table_name || '.' || column_name as name
            from information_schema.columns
            where table_schema = 'public' and column_name ~ 'token|secret|password'`,
      );
      expect(columns.map((c) => c.name).sort()).toEqual([
        "delegated_authorizations.sealed_token",
        "delegated_authorizations.token_nonce",
        "delegated_authorizations.token_tag",
      ]);
    });

    it("hands the token to server-side code and returns it to nobody", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);

      let seen = "";
      const result = await authorizations.withToken(ISAAC, async (token) => {
        seen = token;
        return "asked github";
      });

      expect(seen).toBe(TOKEN);
      expect(result).toBe("asked github");
      // What the caller gets back is whatever the callback returned. There is
      // no method on this class that answers "what is the token".
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it("refuses an authorization that grants nothing", async () => {
      await expect(authorizations.grant(ISAAC, TOKEN, [])).rejects.toThrow(RangeError);
    });

    it("replaces a token on re-grant rather than accumulating rows", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.grant(ISAAC, "gho_second", ["repo", "read:org"]);

      const rows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from delegated_authorizations where github_user_id = ${ISAAC}`,
      );
      expect(rows[0]?.count).toBe("1");
      await authorizations.withToken(ISAAC, async (token) => expect(token).toBe("gho_second"));
    });
  });

  describe("revocation is immediate and authoritative", () => {
    /**
     * 26: "New activity simply stops being observed. Nothing is inferred about
     * a period Kreds cannot see."
     */
    it("stops the next use the moment it is revoked", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      expect(await authorizations.revoke(ISAAC, NOW)).toBe(true);

      await expect(
        authorizations.withToken(ISAAC, async () => "should not happen"),
      ).rejects.toThrow(AuthorizationRevokedError);
    });

    /**
     * The requirement that made `withToken` re-read rather than take a cached
     * token: a poll over a hundred repositories must not finish with a token
     * revoked after the tenth.
     */
    it("cuts a poll already in flight, between one request and the next", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);

      const reached: number[] = [];
      const poll = async () => {
        for (let repository = 0; repository < 5; repository++) {
          await authorizations.withToken(ISAAC, async () => {
            reached.push(repository);
            if (repository === 1) await authorizations.revoke(ISAAC, NOW);
          });
        }
      };

      await expect(poll()).rejects.toThrow(AuthorizationRevokedError);
      // It got through the repository where revocation happened, and stopped
      // before the next one rather than finishing the batch.
      expect(reached).toEqual([0, 1]);
    });

    it("keeps the record that access once existed", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.revoke(ISAAC, NOW);

      const rows = await db.execute<{ revoked_at: Date | null }>(
        sql`select revoked_at from delegated_authorizations where github_user_id = ${ISAAC}`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.revoked_at).not.toBeNull();
    });

    it("reports honestly that a second revocation changed nothing", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      expect(await authorizations.revoke(ISAAC, NOW)).toBe(true);
      expect(await authorizations.revoke(ISAAC, NOW)).toBe(false);
    });

    it("lets a user come back, with a fresh budget", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.revoke(ISAAC, NOW);
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);

      expect(await authorizations.isAuthorized(ISAAC)).toBe(true);
      expect(await authorizations.spendBudget(ISAAC, budget(2), NOW)).toBe(1);
    });
  });

  const budget = (requestsPerWindow: number) => ({ requestsPerWindow, windowMs: 15 * MINUTE });

  describe("one user cannot starve ingestion for everybody else", () => {
    /**
     * A04 moved this decision to Kreds. Under organization webhooks GitHub
     * decided how much traffic arrived; under delegated query one account with
     * several thousand repositories would consume the whole provider allowance.
     */
    it("spends the window and then refuses", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);

      expect(await authorizations.spendBudget(ISAAC, budget(3), NOW)).toBe(1);
      expect(await authorizations.spendBudget(ISAAC, budget(3), NOW)).toBe(2);
      expect(await authorizations.spendBudget(ISAAC, budget(3), NOW)).toBe(3);
      await expect(authorizations.spendBudget(ISAAC, budget(3), NOW)).rejects.toThrow(
        RateBudgetExhaustedError,
      );
    });

    it("leaves everybody else's budget untouched", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.grant(JOSE, TOKEN, ["repo"]);

      await authorizations.spendBudget(ISAAC, budget(1), NOW);
      await expect(authorizations.spendBudget(ISAAC, budget(1), NOW)).rejects.toThrow(
        RateBudgetExhaustedError,
      );

      expect(await authorizations.spendBudget(JOSE, budget(1), NOW)).toBe(1);
    });

    it("starts a fresh window once the old one has passed", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.spendBudget(ISAAC, budget(1), NOW);

      const later = new Date(NOW.getTime() + 16 * MINUTE);
      expect(await authorizations.spendBudget(ISAAC, budget(1), later)).toBe(1);
    });

    /**
     * The check lives in the WHERE clause, so two concurrent pollers cannot both
     * read "one left" and both spend it.
     */
    it("spends exactly the allowance when several pollers race", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);

      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, () => authorizations.spendBudget(ISAAC, budget(4), NOW)),
      );
      const granted = attempts.filter((a) => a.status === "fulfilled");
      expect(granted).toHaveLength(4);
    });

    it("refuses a budget of zero, which would stop ingestion rather than pace it", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await expect(
        authorizations.spendBudget(ISAAC, { requestsPerWindow: 0, windowMs: MINUTE }, NOW),
      ).rejects.toThrow(RangeError);
    });

    it("tells a revoked user that they are revoked, not that they are rate limited", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.revoke(ISAAC, NOW);
      await expect(authorizations.spendBudget(ISAAC, budget(5), NOW)).rejects.toThrow(
        AuthorizationRevokedError,
      );
    });
  });

  describe("who gets polled next", () => {
    it("puts a never-polled authorization ahead of a recently polled one", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.spendBudget(ISAAC, budget(5), NOW);
      await authorizations.grant(JOSE, TOKEN, ["repo"]);

      const due = await authorizations.dueForPolling(10);
      expect(due[0]?.gitHubUserId).toBe(JOSE);
    });

    it("returns identities and scopes, and no tokens at all", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      const due = await authorizations.dueForPolling(10);

      expect(JSON.stringify(due)).not.toContain(TOKEN);
      expect(Object.keys(due[0] ?? {}).sort()).toEqual(["gitHubUserId", "scopes"]);
    });

    it("skips revoked authorizations", async () => {
      await authorizations.grant(ISAAC, TOKEN, ["repo"]);
      await authorizations.revoke(ISAAC, NOW);
      expect(await authorizations.dueForPolling(10)).toEqual([]);
    });
  });
});
