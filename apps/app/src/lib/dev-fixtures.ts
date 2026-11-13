/**
 * Development-only stand-in for the API, for drawing states a local API
 * cannot easily be made to produce.
 *
 * Loaded only by `http.ts`, behind a check that is the constant `false` in a
 * production build, so none of this ships. Enable with
 * `NEXT_PUBLIC_KREDS_FIXTURES=1 pnpm dev`, then pick a scenario with
 * `?fixture=<name>`. The choice is kept for the tab, because the app drops its
 * query string after reading it.
 *
 * Every number here is made up for layout. None of it is policy.
 */

import type {
  AccessStatus,
  ContributionEntry,
  ContributionKind,
  ContributionPage,
  ContributionSummary,
} from "@/features/dashboard/types";

import type { SessionUser } from "./session";

const SCENARIOS = [
  "content",
  "private",
  "empty",
  "unconfigured",
  "error",
  "offline",
  "loading",
  "more-error",
  "expired",
  "signed-out",
] as const;
type Scenario = (typeof SCENARIOS)[number];

const STORAGE_KEY = "kreds:fixture";
const LATENCY_MS = 500;
const USER_ID = 1024;

function scenario(): Scenario {
  const fromUrl = new URLSearchParams(window.location.search).get("fixture");
  if (fromUrl && (SCENARIOS as readonly string[]).includes(fromUrl)) {
    window.sessionStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl as Scenario;
  }
  const kept = window.sessionStorage.getItem(STORAGE_KEY);
  return kept && (SCENARIOS as readonly string[]).includes(kept) ? (kept as Scenario) : "content";
}

/** Revoking changes what the status read returns, as it would against the API. */
let revoked = false;

const user: SessionUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Ada Lovelace",
  login: "ada-lovelace",
  avatarUrl: "https://avatars.githubusercontent.com/u/9919?v=4",
  gitHubUserId: USER_ID,
};

const REPOS = [
  { nameWithOwner: "zitdevs/kreds", isPrivate: false },
  { nameWithOwner: "vercel/next.js", isPrivate: false },
  {
    nameWithOwner: "ada-lovelace/analytical-engine-firmware-with-a-very-long-name",
    isPrivate: true,
  },
  { nameWithOwner: "tailwindlabs/tailwindcss", isPrivate: false },
] as const;

const HOUR = 60 * 60 * 1000;

function entries(): ContributionEntry[] {
  const kinds: ContributionKind[] = ["PULL_REQUEST_MERGED", "CODE_REVIEW", "CODE_REVIEW"];
  return Array.from({ length: 26 }, (_, index) => {
    const repo = REPOS[index % REPOS.length]!;
    const kind = kinds[index % kinds.length]!;
    const isPrivate = repo.isPrivate;
    return {
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind,
      points: kind === "PULL_REQUEST_MERGED" ? 40 + (index % 5) * 10 : 15 + (index % 3) * 5,
      observed: index === 2 || index === 9 ? false : index > 22 ? null : true,
      occurredAt: new Date(Date.now() - (index * index + 1) * 3 * HOUR).toISOString(),
      rulesVersion: "0.7",
      invalidated: index === 4,
      repository: index === 7 ? null : { nameWithOwner: repo.nameWithOwner, isPrivate },
      url:
        index === 7
          ? null
          : `https://github.com/${repo.nameWithOwner}/pull/${1200 - index}${kind === "CODE_REVIEW" ? "#pullrequestreview" : ""}`,
    };
  });
}

function summary(s: Scenario): ContributionSummary {
  if (s === "empty" || s === "unconfigured") {
    return {
      gitHubUserId: USER_ID,
      points: 0,
      rank: null,
      byKind: { PULL_REQUEST_MERGED: 0, CODE_REVIEW: 0, ISSUE_RESOLVED: 0, REVIEW_FOLLOW_UP: 0 },
    };
  }
  return {
    gitHubUserId: USER_ID,
    points: 12840,
    rank: 37,
    byKind: {
      PULL_REQUEST_MERGED: 23,
      CODE_REVIEW: 41,
      ISSUE_RESOLVED: s === "private" ? 2 : 0,
      REVIEW_FOLLOW_UP: 0,
    },
  };
}

function access(s: Scenario): AccessStatus {
  const configured = s !== "unconfigured";
  const authorized = configured && !revoked && s !== "empty";
  return {
    gitHubUserId: USER_ID,
    authorized,
    delegatedQueryConfigured: configured,
    reach: authorized ? (s === "private" ? "INCLUDES_PRIVATE" : "PUBLIC_ONLY") : null,
    lastPolledAt: authorized ? new Date(Date.now() - 2 * HOUR).toISOString() : null,
  };
}

function page(s: Scenario, cursor: string | null): ContributionPage {
  if (s === "empty" || s === "unconfigured") {
    return { gitHubUserId: USER_ID, entries: [], nextCursor: null };
  }
  const all = entries();
  const start = cursor ? Number(cursor) : 0;
  const end = start + 20;
  return {
    gitHubUserId: USER_ID,
    entries: all.slice(start, end),
    nextCursor: end < all.length ? String(end) : null,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function fixtureResponse(url: string, init: RequestInit): Promise<Response> {
  const s = scenario();
  const { pathname, searchParams } = new URL(url);
  const method = init.method ?? "GET";

  if (s === "loading" && pathname !== "/auth/session") return new Promise<Response>(() => {});
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

  if (pathname === "/auth/session") return json({ user: s === "signed-out" ? null : user });
  if (pathname === "/auth/signout") return json(null, 204);
  if (s === "offline") throw new TypeError("Failed to fetch");
  if (s === "expired") return json({ message: "Not signed in." }, 401);

  if (pathname === "/contributions/me/summary") {
    return s === "error" ? json({ message: "boom" }, 500) : json(summary(s));
  }
  if (pathname === "/contributions/me") {
    const cursor = searchParams.get("cursor");
    if (s === "error" || (s === "more-error" && cursor)) return json({ message: "boom" }, 500);
    return json(page(s, cursor));
  }
  if (pathname.startsWith("/access/status/")) return json(access(s));
  if (pathname.startsWith("/access/authorization/") && method === "DELETE") {
    const had = access(s).authorized;
    revoked = true;
    return json({ gitHubUserId: USER_ID, revoked: had, historyRetained: true });
  }
  return json({ message: `No fixture for ${method} ${pathname}` }, 404);
}
