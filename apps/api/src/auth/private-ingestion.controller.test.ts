import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PRIVATE_ACTIVITY_CONSENT } from "@kreds/domain";

import { GitHubOAuthService } from "./github-oauth.service.js";
import { PrivateIngestionController } from "./private-ingestion.controller.js";
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, SessionService } from "./session.service.js";

const ENV: Record<string, string> = {
  AUTH_SECRET: "a".repeat(48),
  AUTH_GITHUB_ID: "Ov23liEXAMPLE",
  AUTH_GITHUB_SECRET: "shhh",
  KREDS_API_URL: "https://api.kreds.sh",
  KREDS_APP_URL: "https://app.kreds.sh",
};
const config = { get: (key: string) => ENV[key] } as never;

const ISAAC = 4242;
const MALLORY = 6666;

/** Captures cookies and the redirect without a real response. */
function fakeResponse() {
  const cookies = new Map<string, string>();
  const response = {
    cookie: vi.fn((name: string, value: string) => cookies.set(name, value)),
    clearCookie: vi.fn((name: string) => cookies.delete(name)),
    redirect: vi.fn(),
  };
  return { response: response as unknown as Response, cookies, redirect: response.redirect };
}

function harness(options: { cipherConfigured?: boolean } = {}) {
  const sessions = new SessionService(config);
  const oauth = new GitHubOAuthService(config);
  const authorizations = { grant: vi.fn(async () => undefined) };
  const consents = { record: vi.fn(async () => undefined) };
  const identities = {
    findAccount: vi.fn(async (id: number) =>
      id === ISAAC ? { user: { id: "user-isaac" }, identity: { login: "isaac" } } : null,
    ),
  };
  const controller = new PrivateIngestionController(
    oauth,
    sessions,
    identities as never,
    config,
    options.cipherConfigured === false ? null : (authorizations as never),
    consents as never,
  );

  /** A session cookie for Isaac, issued by the real service. */
  const signedIn = () => {
    const { response, cookies } = fakeResponse();
    sessions.issueSession(response, { userId: "user-isaac", gitHubUserId: ISAAC });
    return cookies.get(SESSION_COOKIE) as string;
  };

  return { controller, sessions, authorizations, consents, identities, signedIn };
}

/** GitHub's token endpoint and `/user`, answering for whoever authorized. */
function gitHub(answer: { scope?: string; userId?: number }) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/login/oauth/access_token")) {
      return new Response(
        JSON.stringify({
          access_token: "gho_fake",
          token_type: "bearer",
          ...(answer.scope === undefined ? {} : { scope: answer.scope }),
        }),
        { status: 200 },
      );
    }
    if (String(url) === "https://api.github.com/user") {
      return new Response(JSON.stringify({ id: answer.userId ?? ISAAC, login: "isaac" }), {
        status: 200,
      });
    }
    throw new Error(`unexpected request to ${String(url)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("starting the private-ingestion grant", () => {
  it("sends a signed-in user to GitHub asking for the private grant", () => {
    const { controller, signedIn } = harness();
    const { response, redirect, cookies } = fakeResponse();

    controller.start({ cookies: { [SESSION_COOKIE]: signedIn() } } as unknown as Request, response);

    const url = new URL(redirect.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get("scope")).toBe("read:user read:org repo");
    expect(cookies.has(OAUTH_STATE_COOKIE)).toBe(true);
  });

  /** A grant is something a person gives for themselves, so there must be a person. */
  it("refuses somebody who is not signed in", () => {
    const { controller } = harness();
    const { response, redirect } = fakeResponse();

    expect(() => controller.start({ cookies: {} } as unknown as Request, response)).toThrow(
      UnauthorizedException,
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  /**
   * An instance with no `TOKEN_ENCRYPTION_KEY` has nowhere to keep a token, so
   * it says so before sending anybody to GitHub to grant one.
   */
  it("fails clearly when this instance cannot store a token", () => {
    const { controller, signedIn } = harness({ cipherConfigured: false });
    const { response, redirect } = fakeResponse();

    expect(() =>
      controller.start(
        { cookies: { [SESSION_COOKIE]: signedIn() } } as unknown as Request,
        response,
      ),
    ).toThrow(ServiceUnavailableException);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("completing the private-ingestion grant", () => {
  /** Runs `start`, then returns what GitHub would send back to the callback. */
  function roundTrip(h: ReturnType<typeof harness>) {
    const session = h.signedIn();
    const started = fakeResponse();
    h.controller.start(
      { cookies: { [SESSION_COOKIE]: session } } as unknown as Request,
      started.response,
    );
    const state = new URL(started.redirect.mock.calls[0]?.[0] as string).searchParams.get("state");
    return {
      request: {
        cookies: {
          [SESSION_COOKIE]: session,
          [OAUTH_STATE_COOKIE]: started.cookies.get(OAUTH_STATE_COOKIE),
        },
      } as unknown as Request,
      state: state as string,
    };
  }

  it("stores the authorization with the scopes GitHub granted", async () => {
    gitHub({ scope: "read:org,read:user,repo" });
    const h = harness();
    const { request, state } = roundTrip(h);
    const { response, redirect } = fakeResponse();

    await h.controller.callback(request, response, "code-1", state);

    expect(h.authorizations.grant).toHaveBeenCalledWith(ISAAC, "gho_fake", [
      "read:org",
      "read:user",
      "repo",
    ]);
    expect(redirect).toHaveBeenCalledWith("https://app.kreds.sh/?grant=private");
  });

  /**
   * 26: public and private are "two different decisions with two different
   * grants", so the private one is recorded as its own consent, with the
   * version of the text shown before the person went to GitHub.
   */
  it("records the private-activity consent with the version sealed at the start", async () => {
    gitHub({ scope: "read:org,read:user,repo" });
    const h = harness();
    const { request, state } = roundTrip(h);

    await h.controller.callback(request, fakeResponse().response, "code-1b", state);

    expect(h.consents.record).toHaveBeenCalledWith({
      gitHubUserId: ISAAC,
      userId: "user-isaac",
      kind: "PRIVATE_ACTIVITY",
      version: PRIVATE_ACTIVITY_CONSENT.version,
      at: expect.any(Date),
    });
  });

  it("records the version in the state, not whatever is current on return", async () => {
    gitHub({ scope: "read:org,read:user,repo" });
    const h = harness();
    const issuing = fakeResponse();
    const state = h.sessions.issueState(
      issuing.response,
      "PRIVATE_INGESTION",
      "private-activity-v1-as-shown",
    );
    const request = {
      cookies: {
        [SESSION_COOKIE]: h.signedIn(),
        [OAUTH_STATE_COOKIE]: issuing.cookies.get(OAUTH_STATE_COOKIE),
      },
    } as unknown as Request;

    await h.controller.callback(request, fakeResponse().response, "code-1c", state);

    expect(h.consents.record).toHaveBeenCalledWith(
      expect.objectContaining({ version: "private-activity-v1-as-shown" }),
    );
  });

  /** Nobody was shown the private text, so there is nothing to have agreed to. */
  it("refuses a round trip that carried no consent, storing nothing", async () => {
    gitHub({ scope: "read:org,read:user,repo" });
    const h = harness();
    const issuing = fakeResponse();
    const state = h.sessions.issueState(issuing.response, "PRIVATE_INGESTION");
    const request = {
      cookies: {
        [SESSION_COOKIE]: h.signedIn(),
        [OAUTH_STATE_COOKIE]: issuing.cookies.get(OAUTH_STATE_COOKIE),
      },
    } as unknown as Request;

    await expect(
      h.controller.callback(request, fakeResponse().response, "code-1d", state),
    ).rejects.toThrow(BadRequestException);

    expect(h.authorizations.grant).not.toHaveBeenCalled();
    expect(h.consents.record).not.toHaveBeenCalled();
  });

  /**
   * Reach is read from what GitHub granted. A user who declined `repo` on
   * GitHub's screen has authorized public reading, and is told so.
   */
  it("reports public-only reach when GitHub did not grant private access", async () => {
    gitHub({ scope: "read:org,read:user" });
    const h = harness();
    const { request, state } = roundTrip(h);
    const { response, redirect } = fakeResponse();

    await h.controller.callback(request, response, "code-2", state);

    expect(h.authorizations.grant).toHaveBeenCalledWith(ISAAC, "gho_fake", [
      "read:org",
      "read:user",
    ]);
    expect(redirect).toHaveBeenCalledWith("https://app.kreds.sh/?grant=public-only");
  });

  it("stores nothing when GitHub granted nothing", async () => {
    gitHub({});
    const h = harness();
    const { request, state } = roundTrip(h);
    const { response, redirect } = fakeResponse();

    await h.controller.callback(request, response, "code-3", state);

    expect(h.authorizations.grant).not.toHaveBeenCalled();
    expect(h.consents.record).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("https://app.kreds.sh/?grant=none");
  });

  /**
   * Only the signed-in user can grant for themselves. A code minted by another
   * GitHub account, carried into this person's session, must not attach that
   * account's token to them or store it at all.
   */
  it("refuses a token that belongs to somebody other than the signed-in user", async () => {
    gitHub({ scope: "repo", userId: MALLORY });
    const h = harness();
    const { request, state } = roundTrip(h);

    await expect(
      h.controller.callback(request, fakeResponse().response, "code-4", state),
    ).rejects.toThrow(ForbiddenException);
    expect(h.authorizations.grant).not.toHaveBeenCalled();
    expect(h.consents.record).not.toHaveBeenCalled();
  });

  it("refuses a callback with no session", async () => {
    const fetchMock = gitHub({ scope: "repo" });
    const h = harness();
    const { request, state } = roundTrip(h);
    const withoutSession = {
      cookies: {
        [OAUTH_STATE_COOKIE]: (request.cookies as Record<string, string>)[OAUTH_STATE_COOKIE],
      },
    } as unknown as Request;

    await expect(
      h.controller.callback(withoutSession, fakeResponse().response, "code-5", state),
    ).rejects.toThrow(UnauthorizedException);
    expect(h.authorizations.grant).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** The sign-in flow's CSRF protection, unweakened: the state must match the cookie. */
  it("refuses a state that does not match the one issued", async () => {
    const fetchMock = gitHub({ scope: "repo" });
    const h = harness();
    const { request } = roundTrip(h);

    await expect(
      h.controller.callback(request, fakeResponse().response, "code-6", "attacker-state"),
    ).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a state issued for signing in", async () => {
    gitHub({ scope: "repo" });
    const h = harness();
    const signIn = fakeResponse();
    const state = h.sessions.issueState(signIn.response);
    const request = {
      cookies: {
        [SESSION_COOKIE]: h.signedIn(),
        [OAUTH_STATE_COOKIE]: signIn.cookies.get(OAUTH_STATE_COOKIE),
      },
    } as unknown as Request;

    await expect(
      h.controller.callback(request, fakeResponse().response, "code-7", state),
    ).rejects.toThrow(BadRequestException);
    expect(h.authorizations.grant).not.toHaveBeenCalled();
  });

  it("sends a user who pressed Cancel back without storing anything", async () => {
    const h = harness();
    const { response, redirect } = fakeResponse();

    await h.controller.callback(
      { cookies: {} } as unknown as Request,
      response,
      undefined,
      undefined,
      "access_denied",
    );

    expect(redirect).toHaveBeenCalledWith("https://app.kreds.sh/?grant=cancelled");
    expect(h.authorizations.grant).not.toHaveBeenCalled();
  });
});
