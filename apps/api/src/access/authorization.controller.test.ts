import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { ActiveConsent } from "@kreds/database";

import { SESSION_COOKIE, SessionService } from "../auth/session.service.js";
import { AuthorizationController } from "./authorization.controller.js";

const ISAAC = 4242;
const JOSE = 5555;
const GRANTED = new Date("2026-08-01T09:00:00Z");
const GRANTED_PRIVATE = new Date("2026-08-02T09:00:00Z");
const NO_CONSENT = { PUBLIC_ACTIVITY: null, PRIVATE_ACTIVITY: null };
const config = {
  get: (key: string) => (key === "AUTH_SECRET" ? "a".repeat(48) : "https://api.kreds.sh"),
} as never;

function harness(options: { cipherConfigured?: boolean } = {}) {
  const sessions = new SessionService(config);
  const authorizations = {
    isAuthorized: vi.fn(async () => true),
    standingOf: vi.fn(
      async (): Promise<{ scopes: string[]; lastPolledAt: Date | null } | null> => ({
        scopes: ["read:user", "read:org", "repo"],
        lastPolledAt: new Date("2026-09-01T12:00:00Z"),
      }),
    ),
    revoke: vi.fn(async () => true),
  };
  const consents = {
    activeOf: vi.fn(async (): Promise<Record<string, ActiveConsent | null>> => ({
      PUBLIC_ACTIVITY: { version: "public-activity-v1", grantedAt: GRANTED },
      PRIVATE_ACTIVITY: { version: "private-activity-v1", grantedAt: GRANTED_PRIVATE },
    })),
    revokeAll: vi.fn(async () => 2),
  };
  const identities = {
    findAccount: vi.fn(async (id: number) =>
      id === ISAAC ? { user: { id: "user-isaac" }, identity: { login: "isaac" } } : null,
    ),
  };
  const controller = new AuthorizationController(
    sessions,
    identities as never,
    options.cipherConfigured === false ? null : (authorizations as never),
    consents as never,
  );

  /** A request carrying a session the real service issued. */
  const as = (payload: { userId: string; gitHubUserId: number } | null) => {
    if (!payload) return { cookies: {} } as unknown as Request;
    const cookies = new Map<string, string>();
    const response = {
      cookie: (name: string, value: string) => cookies.set(name, value),
    } as unknown as Response;
    sessions.issueSession(response, payload);
    return { cookies: { [SESSION_COOKIE]: cookies.get(SESSION_COOKIE) } } as unknown as Request;
  };

  return { controller, authorizations, consents, as };
}

const isaac = { userId: "user-isaac", gitHubUserId: ISAAC };

/**
 * "A user's control over their own authorization." Own is the operative word:
 * revoking somebody else's would let anyone switch off anyone's delegated
 * query, and reading it would tell anyone who opted in.
 */
describe("reading whether Kreds may look", () => {
  it("refuses a caller with no session", async () => {
    const { controller, authorizations, as } = harness();
    await expect(controller.status(as(null), ISAAC)).rejects.toThrow(UnauthorizedException);
    expect(authorizations.isAuthorized).not.toHaveBeenCalled();
  });

  it("refuses to read somebody else's", async () => {
    const { controller, authorizations, as } = harness();
    await expect(controller.status(as(isaac), JOSE)).rejects.toThrow(ForbiddenException);
    expect(authorizations.isAuthorized).not.toHaveBeenCalled();
  });

  /** Reach from what GitHub granted, and when Kreds last asked, for the dashboard. */
  it("answers for the signed-in user's own, with reach and last poll", async () => {
    const { controller, as } = harness();
    await expect(controller.status(as(isaac), ISAAC)).resolves.toEqual({
      gitHubUserId: ISAAC,
      authorized: true,
      delegatedQueryConfigured: true,
      reach: "INCLUDES_PRIVATE",
      lastPolledAt: "2026-09-01T12:00:00.000Z",
      publicConsent: { version: "public-activity-v1", grantedAt: "2026-08-01T09:00:00.000Z" },
      privateConsent: { version: "private-activity-v1", grantedAt: "2026-08-02T09:00:00.000Z" },
    });
  });

  /**
   * Somebody who signed in before Kreds asked has a grant and no consent. Kreds
   * does not read their activity, and the status says so, so the dashboard can
   * offer them the choice.
   */
  it("reports no reach for a live grant nobody consented to", async () => {
    const { controller, consents, as } = harness();
    consents.activeOf.mockResolvedValueOnce(NO_CONSENT);
    await expect(controller.status(as(isaac), ISAAC)).resolves.toMatchObject({
      authorized: true,
      reach: null,
      publicConsent: null,
      privateConsent: null,
    });
  });

  /** Reach is what Kreds reads, which a private grant without private consent is not. */
  it("reports public-only reach for a private grant without the private consent", async () => {
    const { controller, consents, as } = harness();
    consents.activeOf.mockResolvedValueOnce({
      PUBLIC_ACTIVITY: { version: "public-activity-v1", grantedAt: GRANTED },
      PRIVATE_ACTIVITY: null,
    });
    await expect(controller.status(as(isaac), ISAAC)).resolves.toMatchObject({
      authorized: true,
      reach: "PUBLIC_ONLY",
      privateConsent: null,
    });
  });

  it("reports public-only reach for a grant without private scope", async () => {
    const { controller, authorizations, as } = harness();
    authorizations.standingOf.mockResolvedValueOnce({ scopes: ["read:user"], lastPolledAt: null });
    await expect(controller.status(as(isaac), ISAAC)).resolves.toMatchObject({
      authorized: true,
      reach: "PUBLIC_ONLY",
      lastPolledAt: null,
    });
  });

  it("reports no reach when there is no live grant", async () => {
    const { controller, authorizations, as } = harness();
    authorizations.standingOf.mockResolvedValueOnce(null);
    await expect(controller.status(as(isaac), ISAAC)).resolves.toMatchObject({
      gitHubUserId: ISAAC,
      authorized: false,
      delegatedQueryConfigured: true,
      reach: null,
      lastPolledAt: null,
    });
  });

  it("reports no reach on an instance with no delegated query", async () => {
    const { controller, consents, as } = harness({ cipherConfigured: false });
    consents.activeOf.mockResolvedValueOnce(NO_CONSENT);
    await expect(controller.status(as(isaac), ISAAC)).resolves.toEqual({
      gitHubUserId: ISAAC,
      authorized: false,
      delegatedQueryConfigured: false,
      reach: null,
      lastPolledAt: null,
      publicConsent: null,
      privateConsent: null,
    });
  });

  /** Read through to the database: a cookie whose account no longer matches is nobody. */
  it("refuses a session whose account no longer matches", async () => {
    const { controller, as } = harness();
    await expect(
      controller.status(as({ userId: "someone-else", gitHubUserId: ISAAC }), ISAAC),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe("taking the authorization back", () => {
  it("refuses a caller with no session", async () => {
    const { controller, authorizations, as } = harness();
    await expect(controller.revoke(as(null), ISAAC)).rejects.toThrow(UnauthorizedException);
    expect(authorizations.revoke).not.toHaveBeenCalled();
  });

  it("refuses to revoke somebody else's", async () => {
    const { controller, authorizations, as } = harness();
    await expect(controller.revoke(as(isaac), JOSE)).rejects.toThrow(ForbiddenException);
    expect(authorizations.revoke).not.toHaveBeenCalled();
  });

  it("revokes the signed-in user's own grant and every active consent, and keeps history", async () => {
    const { controller, authorizations, consents, as } = harness();
    await expect(controller.revoke(as(isaac), ISAAC)).resolves.toEqual({
      gitHubUserId: ISAAC,
      revoked: true,
      consentsRevoked: 2,
      historyRetained: true,
    });
    expect(authorizations.revoke).toHaveBeenCalledWith(ISAAC, expect.any(Date));
    expect(consents.revokeAll).toHaveBeenCalledWith(ISAAC, expect.any(Date));
  });

  it("does not touch anybody's consents for a caller it refused", async () => {
    const { controller, consents, as } = harness();
    await expect(controller.revoke(as(isaac), JOSE)).rejects.toThrow(ForbiddenException);
    await expect(controller.revoke(as(null), ISAAC)).rejects.toThrow(UnauthorizedException);
    expect(consents.revokeAll).not.toHaveBeenCalled();
  });

  /** A consent with no grant left behind it is still a consent the person can take back. */
  it("counts revoking only consents as revoking", async () => {
    const { controller, authorizations, as } = harness();
    authorizations.revoke.mockResolvedValueOnce(false);
    await expect(controller.revoke(as(isaac), ISAAC)).resolves.toMatchObject({
      revoked: true,
      consentsRevoked: 2,
    });
  });

  it("still requires the session on an instance with no delegated query", async () => {
    const { controller, consents, as } = harness({ cipherConfigured: false });
    consents.revokeAll.mockResolvedValueOnce(0);
    await expect(controller.revoke(as(null), ISAAC)).rejects.toThrow(UnauthorizedException);
    await expect(controller.revoke(as(isaac), ISAAC)).resolves.toEqual({
      gitHubUserId: ISAAC,
      revoked: false,
      consentsRevoked: 0,
      historyRetained: true,
    });
  });
});
