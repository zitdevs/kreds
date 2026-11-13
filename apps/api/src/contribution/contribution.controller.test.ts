import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE, SessionService } from "../auth/session.service.js";
import { ContributionController } from "./contribution.controller.js";

const ISAAC = 4242;
const config = {
  get: (key: string) => (key === "AUTH_SECRET" ? "a".repeat(48) : "https://api.kreds.sh"),
} as never;

function entry(over: Record<string, unknown> = {}) {
  return {
    id: "8f9c2a3e-0000-4000-8000-000000000001",
    kind: "PULL_REQUEST_MERGED",
    points: 40,
    observed: false,
    occurredAt: new Date("2026-08-20T10:00:00Z"),
    rulesVersion: "v0.7",
    invalidated: false,
    repository: { nameWithOwner: "isaac/side", isPrivate: true },
    source: { pullRequestNumber: 412, reviewId: null },
    // What the row holds and the dashboard must never see.
    qualityScore: 75,
    unobservedSignals: "checksPassed",
    ...over,
  };
}

function harness(
  page: { entries: unknown[]; next: { occurredAt: Date; id: string } | null } = {
    entries: [entry()],
    next: null,
  },
) {
  const sessions = new SessionService(config);
  const ledger = {
    entriesFor: vi.fn(async () => page),
    summaryFor: vi.fn(async () => ({
      points: 52,
      rank: 3,
      byKind: { PULL_REQUEST_MERGED: 1, CODE_REVIEW: 1, ISSUE_RESOLVED: 0, REVIEW_FOLLOW_UP: 0 },
    })),
  };
  const identities = {
    findAccount: vi.fn(async (id: number) =>
      id === ISAAC ? { user: { id: "user-isaac" }, identity: { login: "isaac" } } : null,
    ),
  };
  const controller = new ContributionController(ledger as never, identities as never, sessions);

  const signedIn = () => {
    const cookies = new Map<string, string>();
    sessions.issueSession(
      { cookie: (n: string, v: string) => cookies.set(n, v) } as unknown as Response,
      { userId: "user-isaac", gitHubUserId: ISAAC },
    );
    return { cookies: { [SESSION_COOKIE]: cookies.get(SESSION_COOKIE) } } as unknown as Request;
  };
  const anonymous = { cookies: {} } as unknown as Request;

  return { controller, ledger, signedIn, anonymous };
}

describe("GET /contributions/me", () => {
  it("refuses a caller with no session", async () => {
    const { controller, ledger, anonymous } = harness();
    await expect(controller.mine(anonymous)).rejects.toThrow(UnauthorizedException);
    expect(ledger.entriesFor).not.toHaveBeenCalled();
  });

  /** The session decides whose history this is. There is no parameter that could name another. */
  it("reads the signed-in user's own entries", async () => {
    const { controller, ledger, signedIn } = harness();

    const page = await controller.mine(signedIn());

    expect(ledger.entriesFor).toHaveBeenCalledWith(ISAAC, { limit: 20 });
    expect(page.gitHubUserId).toBe(ISAAC);
  });

  /**
   * Exactly these fields. Quality internals and unobserved signals describe how
   * scoring works, and 24 keeps caps unpublished, so `observed` is the most
   * this says about them.
   */
  it("returns the contract fields and nothing else", async () => {
    const { controller, signedIn } = harness();

    const { entries, nextCursor } = await controller.mine(signedIn());

    expect(nextCursor).toBeNull();
    expect(entries).toEqual([
      {
        id: "8f9c2a3e-0000-4000-8000-000000000001",
        kind: "PULL_REQUEST_MERGED",
        points: 40,
        observed: false,
        occurredAt: "2026-08-20T10:00:00.000Z",
        rulesVersion: "v0.7",
        invalidated: false,
        repository: { nameWithOwner: "isaac/side", isPrivate: true },
        url: "https://github.com/isaac/side/pull/412",
      },
    ]);
  });

  it("links a review to the review itself, and links nothing it cannot derive", async () => {
    const { controller, signedIn } = harness({
      entries: [
        entry({ kind: "CODE_REVIEW", source: { pullRequestNumber: 9, reviewId: 55001 } }),
        entry({ repository: null }),
        entry({ source: { pullRequestNumber: null, reviewId: null } }),
        entry({ kind: "CODE_REVIEW", source: { pullRequestNumber: 9, reviewId: null } }),
        entry({ repository: { nameWithOwner: "not a/real?name", isPrivate: false } }),
      ],
      next: null,
    });

    const { entries } = await controller.mine(signedIn());

    expect(entries.map((e) => e.url)).toEqual([
      "https://github.com/isaac/side/pull/9#pullrequestreview-55001",
      null,
      null,
      null,
      null,
    ]);
  });

  it("hands back a cursor that resumes exactly where the page ended", async () => {
    const end = {
      occurredAt: new Date("2026-08-01T00:00:00Z"),
      id: "8f9c2a3e-0000-4000-8000-0000000000aa",
    };
    const { controller, ledger, signedIn } = harness({ entries: [entry()], next: end });

    const first = await controller.mine(signedIn(), undefined, "5");
    expect(ledger.entriesFor).toHaveBeenLastCalledWith(ISAAC, { limit: 5 });
    expect(typeof first.nextCursor).toBe("string");

    await controller.mine(signedIn(), first.nextCursor ?? undefined, "5");
    expect(ledger.entriesFor).toHaveBeenLastCalledWith(ISAAC, { limit: 5, before: end });
  });

  it("refuses a cursor it did not issue", async () => {
    const { controller, signedIn } = harness();
    for (const cursor of ["nonsense", Buffer.from('{"t":"x","i":"y"}').toString("base64url")]) {
      await expect(controller.mine(signedIn(), cursor)).rejects.toThrow(BadRequestException);
    }
  });

  it("refuses a page size outside 1 to 50", async () => {
    const { controller, signedIn } = harness();
    for (const limit of ["0", "51", "-3", "2.5", "many"]) {
      await expect(controller.mine(signedIn(), undefined, limit)).rejects.toThrow(
        BadRequestException,
      );
    }
  });
});

describe("GET /contributions/me/summary", () => {
  it("refuses a caller with no session", async () => {
    const { controller, ledger, anonymous } = harness();
    await expect(controller.mySummary(anonymous)).rejects.toThrow(UnauthorizedException);
    expect(ledger.summaryFor).not.toHaveBeenCalled();
  });

  it("summarises the signed-in user's own standing", async () => {
    const { controller, ledger, signedIn } = harness();

    await expect(controller.mySummary(signedIn())).resolves.toEqual({
      gitHubUserId: ISAAC,
      points: 52,
      rank: 3,
      byKind: { PULL_REQUEST_MERGED: 1, CODE_REVIEW: 1, ISSUE_RESOLVED: 0, REVIEW_FOLLOW_UP: 0 },
    });
    expect(ledger.summaryFor).toHaveBeenCalledWith(ISAAC);
  });
});
