import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CLIENT_ROLES, INGESTION_MODES } from "@kreds/domain";

import { mayRead, PRIVATE_INGESTION_SCOPES, reachOf, SIGN_IN_SCOPES } from "./scopes.js";

/**
 * The API's source root. From the working directory rather than `import.meta`,
 * because this package compiles to CommonJS.
 */
const apiSource = join(process.cwd(), "src");

function every(suffix: string): { path: string; source: string }[] {
  const found: { path: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(suffix)) {
        found.push({ path: full, source: readFileSync(full, "utf8") });
      }
    }
  };
  walk(apiSource);
  return found;
}

/**
 * Source with its comments removed. Comments quote the law, and a quotation is
 * not an endpoint.
 *
 * The line-comment pattern requires the `//` not to be preceded by `:`, which is
 * not fussiness: without it this ate `https://api.github.com` and the host check
 * passed against an empty string.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Amendment A04's definition of done, from the API's side.
 *
 * > "No endpoint accepts client-originated economic input."
 *
 * A text scan, which is coarse, and coarse is the point: it will notice a route
 * added in a hurry by somebody who never read Law XXXV. The same shape as the
 * Phase 8 mint scan, for the same reason.
 */
describe("Law XXXV, no economic claim originates from a client", () => {
  /**
   * The webhook is the one write that carries provider data, and GitHub sends
   * it. Everything else that writes must be a user acting on their own
   * authorization, never reporting their own activity.
   */
  const ALLOWED_WRITES = [
    // GitHub posts here, with a signature Kreds verifies.
    "github/webhook",
    // A user ending their own session.
    "auth/signout",
    // A user taking their own authorization back.
    "access/authorization",
  ];

  it("has no write route anywhere that could carry an economic claim", () => {
    const offenders: string[] = [];

    for (const { path, source } of every(".controller.ts")) {
      const controller = code(source).match(/@Controller\("([^"]*)"\)/)?.[1] ?? "";
      const routes = code(source).match(/@(Post|Put|Patch|Delete)\(\s*"?([^)"]*)"?\s*\)/g) ?? [];

      for (const route of routes) {
        const segment = route.match(/\(\s*"([^"]*)"/)?.[1] ?? "";
        const full = [controller, segment].filter(Boolean).join("/");
        if (!ALLOWED_WRITES.some((allowed) => full.startsWith(allowed))) {
          offenders.push(`${full || "(root)"} in ${path}`);
        }
      }
    }

    expect(offenders, "a write route Law XXXV does not account for").toEqual([]);
  });

  /**
   * The other half, which the route list alone cannot see: a route that is
   * allowed but has grown a body carrying an amount, a score, or a claim.
   *
   * 26: "Anything a client is trusted to send, an attacker sends directly with
   * curl: no repository, no account history, no work."
   */
  it("has no controller reading an economic value out of a request body", () => {
    const economic =
      /@Body\([^)]*\)\s*\w+\s*:\s*[^;]*\b(amount|kred|kredbits|balance|points|score|reward|value|eligib)/i;

    for (const { path, source } of every(".controller.ts")) {
      expect(code(source), `in ${path}`).not.toMatch(economic);
    }
  });

  /**
   * The channels are a closed set, and this is where a third one would show up
   * first: something constructing evidence with a mode the domain does not have.
   */
  it("names exactly two ingestion channels, with no client among them", () => {
    expect([...INGESTION_MODES]).toEqual(["PROVIDER_WEBHOOK", "SERVER_SIDE_DELEGATED_QUERY"]);
    expect([...CLIENT_ROLES]).toEqual(["DISPLAY_ONLY"]);

    for (const mode of INGESTION_MODES) {
      expect(mode).not.toMatch(/client|extension|agent|plugin|cli|local/i);
    }
  });

  /**
   * Signing is the clever fix the law forecloses in advance: "A key held on the
   * claimant's machine is a key the claimant can extract and forge with."
   *
   * The webhook signature is GitHub's, verified by Kreds, and is the opposite
   * arrangement: the attestor is the provider, not the beneficiary.
   */
  it("verifies no signature that a claimant could hold the key for", () => {
    const signing = every(".ts").filter(
      ({ path, source }) =>
        // Tests name the thing they forbid, so they are not evidence of it.
        !path.endsWith(".test.ts") &&
        !path.includes("webhook") &&
        /verifySignature|verifyClaim|clientSignature|attestation/i.test(code(source)),
    );
    expect(signing.map((s) => s.path)).toEqual([]);
  });
});

describe("delegated query reads the provider and nothing else", () => {
  const service = () =>
    readFileSync(join(apiSource, "access", "delegated-query.service.ts"), "utf8");

  /**
   * 26: the evidence travels "from GitHub to a Kreds server". Every value this
   * service acts on must have come out of a response, so the only host it may
   * talk to is GitHub's.
   */
  it("talks to api.github.com and to no other host", () => {
    const hosts = code(service()).match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
    expect([...new Set(hosts)]).toEqual(["https://api.github.com"]);
  });

  /**
   * A poll must stop the moment a user takes their authorization back, rather
   * than finishing the batch. Every provider read goes through `withToken`,
   * which re-reads the row.
   */
  it("reaches the provider only through a call that re-checks authorization", () => {
    const source = code(service());
    const fetches = source.match(/\bfetch\(/g) ?? [];
    const guarded = source.match(/withToken\(/g) ?? [];

    expect(fetches.length).toBeGreaterThan(0);
    expect(guarded.length).toBeGreaterThan(0);
    // One `fetch`, in one private helper, reached only through `withToken`.
    expect(fetches).toHaveLength(1);
  });

  /**
   * A token in a log line is a token that has left the process. The error paths
   * here log a user id and a status, never a request and never an error object
   * whose message could carry the header that was sent.
   */
  it("never logs anything that could carry a token", () => {
    const logs = code(service()).match(/this\.logger\.\w+\([^)]*\)/g) ?? [];
    for (const line of logs) {
      expect(line).not.toMatch(/token|error\b|authorization|headers|\berr\b/i);
    }
  });

  /**
   * Priced by when GitHub says it happened. Law XV has rules change
   * forward-only, so a backfill of last month's work must be worth what it was
   * worth then, not what today's rules would pay.
   */
  it("prices by the provider's timestamp, never by when Kreds looked", () => {
    const source = code(service());
    expect(source).toMatch(/occurredAt:\s*Date\.parse\(/);
    expect(source).not.toMatch(/occurredAt:\s*now/);
  });
});

describe("the narrowest scope the economy needs", () => {
  /**
   * A04 requires the narrowest scope, and 26's ladder is built on the open path
   * asking for nothing extra. Signing in and having private work ingested are
   * two decisions with two grants, rather than one grant sized for the larger
   * case.
   */
  it("keeps sign-in unable to read anybody's code", () => {
    expect([...SIGN_IN_SCOPES]).toEqual(["read:user", "read:org"]);
    expect(SIGN_IN_SCOPES).not.toContain("repo");
  });

  it("asks for the broader grant only where private work is the point", () => {
    expect(PRIVATE_INGESTION_SCOPES).toContain("repo");
    // And it is a superset, so opting in never removes anything.
    for (const scope of SIGN_IN_SCOPES) {
      expect(PRIVATE_INGESTION_SCOPES).toContain(scope);
    }
  });

  /**
   * Read from what GitHub granted, never from what Kreds asked for. A user can
   * narrow a grant on GitHub's own screen, and assuming otherwise would have
   * Kreds attempting reads it has no right to.
   */
  it("reads reach from the granted scopes rather than the requested ones", () => {
    expect(reachOf(["read:user", "read:org"])).toBe("PUBLIC_ONLY");
    expect(reachOf([...PRIVATE_INGESTION_SCOPES])).toBe("INCLUDES_PRIVATE");
    expect(reachOf([])).toBe("PUBLIC_ONLY");
  });

  it("refuses a private repository under a public-only grant", () => {
    expect(mayRead("PUBLIC_ONLY", "private")).toBe(false);
    expect(mayRead("PUBLIC_ONLY", "public")).toBe(true);
    expect(mayRead("INCLUDES_PRIVATE", "private")).toBe(true);
  });

  /**
   * 25 gates issuance and the safe direction is to withhold. A repository whose
   * visibility Kreds could not determine is one it should not be reading.
   */
  it("fails closed on a visibility it could not determine", () => {
    expect(mayRead("INCLUDES_PRIVATE", "unknown")).toBe(false);
    expect(mayRead("PUBLIC_ONLY", "unknown")).toBe(false);
  });
});

describe("a token never reaches the ledger", () => {
  /**
   * A04: tokens are "never in ledger metadata". Metadata is the field most
   * likely to receive one, because it accepts anything and nobody reviews what
   * goes in.
   *
   * The check is structural: nothing that writes a ledger entry may be in a
   * file that can obtain a token.
   */
  it("has no file that both reads a token and writes a ledger entry", () => {
    const offenders = every(".ts")
      .filter(({ path }) => !path.endsWith(".test.ts"))
      .filter(({ source }) => {
        const body = code(source);
        const touchesToken = /withToken\(|sealedToken|access_token|Authorization:\s*`Bearer/.test(
          body,
        );
        const writesLedger = /\.post\(|ledgerEntries|metadata:\s*\{/.test(body);
        return touchesToken && writesLedger;
      });

    expect(offenders.map((o) => o.path)).toEqual([]);
  });
});
