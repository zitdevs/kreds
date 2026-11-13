import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE, SessionService } from "../auth/session.service.js";
import { AuthorizationController } from "./authorization.controller.js";

const ISAAC = 4242;
const JOSE = 5555;
const config = {
  get: (key: string) => (key === "AUTH_SECRET" ? "a".repeat(48) : "https://api.kreds.sh"),
} as never;

function harness(options: { cipherConfigured?: boolean } = {}) {
  const sessions = new SessionService(config);
  const authorizations = {
    isAuthorized: vi.fn(async () => true),
    revoke: vi.fn(async () => true),
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

  return { controller, authorizations, as };
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

  it("answers for the signed-in user's own", async () => {
    const { controller, as } = harness();
    await expect(controller.status(as(isaac), ISAAC)).resolves.toEqual({
      gitHubUserId: ISAAC,
      authorized: true,
      delegatedQueryConfigured: true,
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

  it("revokes the signed-in user's own, and keeps history", async () => {
    const { controller, authorizations, as } = harness();
    await expect(controller.revoke(as(isaac), ISAAC)).resolves.toEqual({
      gitHubUserId: ISAAC,
      revoked: true,
      historyRetained: true,
    });
    expect(authorizations.revoke).toHaveBeenCalledWith(ISAAC, expect.any(Date));
  });

  it("still requires the session on an instance with no delegated query", async () => {
    const { controller, as } = harness({ cipherConfigured: false });
    await expect(controller.revoke(as(null), ISAAC)).rejects.toThrow(UnauthorizedException);
    await expect(controller.revoke(as(isaac), ISAAC)).resolves.toEqual({
      gitHubUserId: ISAAC,
      revoked: false,
    });
  });
});
