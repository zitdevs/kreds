import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorizationRevokedError, RateBudgetExhaustedError } from "@kreds/database";
import { factKey } from "@kreds/domain";

import { normalize } from "../github/normalizer.js";
import { DelegatedQueryService } from "./delegated-query.service.js";

const ISAAC = 4242;
const JOSE = 5555;
const NOW = new Date("2026-09-01T12:00:00Z");
const PUBLIC_GRANT = ["read:user", "read:org"];
const PRIVATE_GRANT = ["read:user", "read:org", "repo"];

const API = "https://api.github.com";

function repository(over: Record<string, unknown> = {}) {
  return {
    id: 77_001,
    node_id: "R_kgDO",
    full_name: "zitdevs/kreds",
    private: false,
    visibility: "public",
    default_branch: "main",
    ...over,
  };
}

/** GitHub's REST pull request, with fields Kreds does not read, so pass-through is visible. */
function pullRequest(number: number, over: Record<string, unknown> = {}) {
  return {
    id: 1_000 + number,
    node_id: `PR_kw${number}`,
    number,
    state: "closed",
    title: `Change ${number}`,
    body: "Fixes #1",
    merged: true,
    merged_at: "2026-08-20T10:00:00Z",
    closed_at: "2026-08-20T10:00:00Z",
    additions: 10,
    deletions: 2,
    user: { id: ISAAC, login: "isaac", type: "User" },
    merged_by: { id: JOSE, login: "jose", type: "User" },
    base: { ref: "main", repo: repository() },
    some_field_kreds_never_reads: { kept: true },
    ...over,
  };
}

function review(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    node_id: `PRR_kw${id}`,
    user: { id: ISAAC, login: "isaac", type: "User" },
    body: "Looks right",
    state: "APPROVED",
    submitted_at: "2026-08-19T09:00:00Z",
    ...over,
  };
}

function searchHit(number: number, merged = true) {
  return {
    number,
    node_id: `PR_kw${number}`,
    repository_url: `${API}/repos/zitdevs/kreds`,
    pull_request: { merged_at: merged ? "2026-08-20T10:00:00Z" : null },
  };
}

interface World {
  authored?: unknown[];
  reviewed?: unknown[];
  pulls?: Record<number, unknown>;
  reviews?: Record<number, unknown[]>;
  /** Status to answer for a path, instead of a body. */
  failing?: Record<string, number>;
}

function stubGitHub(world: World) {
  const fetch = vi.fn(async (url: string) => {
    const path = url.replace(API, "");
    const failing = Object.entries(world.failing ?? {}).find(([prefix]) => path.startsWith(prefix));
    if (failing) {
      return new Response('{"message":"Validation Failed","echo":"tok-fake-secret"}', {
        status: failing[1],
      });
    }

    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (path.startsWith("/search/issues")) {
      const q = new URL(url).searchParams.get("q") ?? "";
      const items = q.includes("reviewed-by:") ? world.reviewed : world.authored;
      return json({ total_count: (items ?? []).length, items: items ?? [] });
    }
    const reviews = path.match(/^\/repos\/zitdevs\/kreds\/pulls\/(\d+)\/reviews/);
    if (reviews) return json(world.reviews?.[Number(reviews[1])] ?? []);
    const pull = path.match(/^\/repos\/zitdevs\/kreds\/pulls\/(\d+)$/);
    if (pull) {
      const body = world.pulls?.[Number(pull[1])];
      return body ? json(body) : new Response("{}", { status: 404 });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function harness(
  options: {
    login?: string | null;
    /** Throw `RateBudgetExhaustedError` once this many requests have been spent. */
    budget?: number;
    /** Throw `AuthorizationRevokedError` from `withToken` after this many uses. */
    revokeAfter?: number;
  } = {},
) {
  let spent = 0;
  let used = 0;
  const authorizations = {
    spendBudget: vi.fn(async (id: number) => {
      if (options.budget !== undefined && spent >= options.budget) {
        throw new RateBudgetExhaustedError(id, 1);
      }
      spent += 1;
      return spent;
    }),
    withToken: vi.fn(async (id: number, use: (token: string) => Promise<unknown>) => {
      if (options.revokeAfter !== undefined && used >= options.revokeAfter) {
        throw new AuthorizationRevokedError(id);
      }
      used += 1;
      return use("tok-fake-secret");
    }),
  };
  const login = options.login === undefined ? "isaac" : options.login;
  const identities = {
    findByGitHubUserId: vi.fn(async () => (login === null ? null : { login })),
  };
  // The real normalizer, so these tests prove the payloads the poll builds are
  // ones the shared pipeline actually understands, not just that they were sent.
  const ingestion = {
    ingest: vi.fn(async (input: { eventType: string; payload: unknown }) => {
      const event = normalize(input.eventType, input.payload);
      return { outcome: event ? ("PROCESSED" as const) : ("IGNORED" as const) };
    }),
  };
  const service = new DelegatedQueryService(
    authorizations as never,
    identities as never,
    ingestion as never,
    { requestsPerWindow: 60, windowMs: 900_000 },
  );
  return { service, authorizations, identities, ingestion };
}

const ingested = (ingestion: ReturnType<typeof harness>["ingestion"]) =>
  ingestion.ingest.mock.calls.map(([input]) => input as Record<string, unknown>);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("discovery searches by login, because GitHub's search does", () => {
  /**
   * `author:4242` is answered with HTTP 422: search qualifiers take a login,
   * never a numeric id. The first version sent the id and so never found a
   * single merge.
   */
  it("asks for the user's merged pull requests and reviews by their login", async () => {
    const fetch = stubGitHub({});
    const { service } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    const queries = fetch.mock.calls
      .map(([url]) => new URL(url).searchParams.get("q"))
      .filter(Boolean);
    expect(queries).toContain("author:isaac is:pr is:merged");
    expect(queries).toContain("reviewed-by:isaac is:pr");
    expect(queries.join(" ")).not.toContain(String(ISAAC));
  });

  /** A login is interpolated into a query, so one that is not a GitHub login is never sent. */
  it("reads nothing for an identity it cannot name safely", async () => {
    for (const login of [null, "isaac is:private", "isaac+repo:x"]) {
      const fetch = stubGitHub({});
      const { service } = harness({ login });

      const result = await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

      expect(result.outcome).toBe("UNKNOWN_IDENTITY");
      expect(fetch).not.toHaveBeenCalled();
    }
  });
});

describe("an authored merge", () => {
  it("is read from the canonical record and handed on as GitHub's own object", async () => {
    const pr = pullRequest(7);
    stubGitHub({ authored: [searchHit(7)], pulls: { 7: pr } });
    const { service, ingestion } = harness();

    const result = await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(result).toMatchObject({ outcome: "OK", ingested: 1 });
    const [call] = ingested(ingestion);
    expect(call).toMatchObject({ eventType: "pull_request", ingestionMode: "USER_ACTIVITY_POLL" });
    // Unchanged: the normalizer decides which fields matter, not this service.
    expect(call?.["payload"]).toEqual({
      action: "closed",
      pull_request: pr,
      repository: pr.base.repo,
    });
  });

  /**
   * 26 (A05): idempotency keys "derive from canonical provider identifiers,
   * never from the observing token or source".
   */
  it("is keyed by the provider's ids, never by who looked", async () => {
    stubGitHub({ authored: [searchHit(7)], pulls: { 7: pullRequest(7) } });
    const { service, ingestion } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(ingested(ingestion)[0]?.["deliveryId"]).toBe(
      factKey({ kind: "PULL_REQUEST_MERGED", gitHubRepositoryId: 77_001, gitHubNodeId: "PR_kw7" }),
    );
  });

  /**
   * "Discovery is not verification." Search matched a login, and logins are
   * renamed and then reused by somebody else. Only the numeric id on the
   * canonical record says whose work this is.
   */
  it("is refused when the canonical author is somebody else", async () => {
    stubGitHub({
      authored: [searchHit(7)],
      pulls: { 7: pullRequest(7, { user: { id: JOSE, login: "isaac", type: "User" } }) },
    });
    const { service, ingestion } = harness();

    const result = await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(ingestion.ingest).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "OK", ingested: 0 });
  });

  it("is refused when the canonical record says it was never merged", async () => {
    stubGitHub({
      authored: [searchHit(7)],
      pulls: { 7: pullRequest(7, { merged: false, merged_at: null }) },
    });
    const { service, ingestion } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(ingestion.ingest).not.toHaveBeenCalled();
  });
});

describe("a review", () => {
  const authoredByJose = () => pullRequest(8, { user: { id: JOSE, login: "jose", type: "User" } });

  it("is handed on as GitHub's own review, pull request and repository", async () => {
    const pr = authoredByJose();
    const mine = review(9_001);
    stubGitHub({ reviewed: [searchHit(8)], pulls: { 8: pr }, reviews: { 8: [mine] } });
    const { service, ingestion } = harness();

    const result = await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(result).toMatchObject({ outcome: "OK", ingested: 1 });
    const [call] = ingested(ingestion);
    expect(call).toMatchObject({
      eventType: "pull_request_review",
      ingestionMode: "USER_ACTIVITY_POLL",
      deliveryId: factKey({
        kind: "REVIEW_SUBMITTED",
        gitHubRepositoryId: 77_001,
        gitHubNodeId: "PRR_kw9001",
      }),
    });
    expect(call?.["payload"]).toEqual({
      action: "submitted",
      review: mine,
      pull_request: pr,
      repository: pr.base.repo,
    });
    // And the pipeline reads it as the same fact the webhook would have.
    expect(normalize("pull_request_review", call?.["payload"])?.idempotencyKey).toBe(
      "REVIEW_SUBMITTED:9001",
    );
  });

  /**
   * The reviews endpoint lists everybody's reviews on the pull request. Only
   * the authorized user's own, verified by numeric id, are theirs to have read.
   */
  it("is taken only when the canonical reviewer is the authorized user", async () => {
    stubGitHub({
      reviewed: [searchHit(8)],
      pulls: { 8: authoredByJose() },
      reviews: {
        8: [
          review(9_001),
          review(9_002, { user: { id: JOSE, login: "jose", type: "User" } }),
          // Renamed accounts keep their id, so a matching login proves nothing.
          review(9_003, { user: { id: 777, login: "isaac", type: "User" } }),
        ],
      },
    });
    const { service, ingestion } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(ingested(ingestion).map((call) => call["deliveryId"])).toEqual([
      factKey({ kind: "REVIEW_SUBMITTED", gitHubRepositoryId: 77_001, gitHubNodeId: "PRR_kw9001" }),
    ]);
  });

  /** A pending review has not happened yet. The webhook only reports a submission. */
  it("is not taken before it was submitted", async () => {
    stubGitHub({
      reviewed: [searchHit(8)],
      pulls: { 8: authoredByJose() },
      reviews: { 8: [review(9_004, { state: "PENDING", submitted_at: undefined })] },
    });
    const { service, ingestion } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(ingestion.ingest).not.toHaveBeenCalled();
  });
});

describe("reach comes from what GitHub granted", () => {
  const privateWorld = () => ({
    authored: [searchHit(7)],
    pulls: {
      7: pullRequest(7, {
        base: { ref: "main", repo: repository({ private: true, visibility: "private" }) },
      }),
    },
  });

  it("reads nothing from a private repository under a public-only grant", async () => {
    stubGitHub(privateWorld());
    const { service, ingestion } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(ingestion.ingest).not.toHaveBeenCalled();
  });

  it("reads a private repository once the user granted it", async () => {
    stubGitHub(privateWorld());
    const { service, ingestion } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PRIVATE_GRANT }, NOW);

    expect(ingestion.ingest).toHaveBeenCalledOnce();
  });
});

describe("every request is paced and re-checked", () => {
  it("spends the user's budget once per request to GitHub", async () => {
    const fetch = stubGitHub({
      authored: [searchHit(7)],
      reviewed: [searchHit(8)],
      pulls: { 7: pullRequest(7), 8: pullRequest(8) },
      reviews: { 8: [] },
    });
    const { service, authorizations } = harness();

    await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(fetch.mock.calls.length).toBeGreaterThan(2);
    expect(authorizations.spendBudget).toHaveBeenCalledTimes(fetch.mock.calls.length);
    expect(authorizations.withToken).toHaveBeenCalledTimes(fetch.mock.calls.length);
  });

  it("stops where the budget runs out instead of finishing the batch", async () => {
    const fetch = stubGitHub({
      authored: [searchHit(7), searchHit(9)],
      pulls: { 7: pullRequest(7), 9: pullRequest(9) },
    });
    const { service } = harness({ budget: 2 });

    const result = await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(result).toMatchObject({ outcome: "RATE_BUDGET_EXHAUSTED", ingested: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  /** 26: "New activity simply stops being observed." Between two requests, not after the batch. */
  it("stops between two requests when the user revokes", async () => {
    const fetch = stubGitHub({
      authored: [searchHit(7), searchHit(9)],
      pulls: { 7: pullRequest(7), 9: pullRequest(9) },
    });
    const { service } = harness({ revokeAfter: 2 });

    const result = await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(result.outcome).toBe("REVOKED");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("a provider error stays out of the logs", () => {
  /** A GitHub error body can echo what was sent, and what was sent carried a token. */
  it("logs neither the token nor GitHub's error body", async () => {
    stubGitHub({ failing: { "/search/issues": 422 } });
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { service } = harness();

    const result = await service.poll({ gitHubUserId: ISAAC, scopes: PUBLIC_GRANT }, NOW);

    expect(result.outcome).toBe("PROVIDER_UNAVAILABLE");
    for (const [message] of warn.mock.calls) {
      expect(String(message)).not.toMatch(/tok-fake-secret|Validation Failed/);
    }
  });
});
