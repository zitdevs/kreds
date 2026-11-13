import { BadRequestException } from "@nestjs/common";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_ACTIVITY_CONSENT } from "@kreds/domain";

import { AuthController } from "./auth.controller.js";
import { GitHubOAuthService } from "./github-oauth.service.js";
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
const SIGN_IN_SCOPES = "read:org,read:user";

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
  const order: string[] = [];
  const authorizations = {
    grant: vi.fn(async () => {
      order.push("grant");
    }),
  };
  const consents = {
    record: vi.fn(async () => {
      order.push("consent");
    }),
  };
  const identities = {
    claim: vi.fn(async () => ({ user: { id: "user-isaac" }, hadPriorHistory: false })),
  };
  const controller = new AuthController(
    oauth,
    sessions,
    identities as never,
    config,
    options.cipherConfigured === false ? null : (authorizations as never),
    consents as never,
  );
  return { controller, sessions, authorizations, consents, identities, order };
}

/** GitHub's token endpoint and `/user`, answering for Isaac. */
/** `null`: GitHub names no scopes at all. */
function gitHub(scope: string | null = SIGN_IN_SCOPES) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/login/oauth/access_token")) {
      return new Response(
        JSON.stringify({
          access_token: "gho_signin",
          token_type: "bearer",
          ...(scope === null ? {} : { scope }),
        }),
        { status: 200 },
      );
    }
    if (String(url) === "https://api.github.com/user") {
      return new Response(JSON.stringify({ id: ISAAC, login: "isaac" }), { status: 200 });
    }
    throw new Error(`unexpected request to ${String(url)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** What GitHub sends back to the callback after `start`, cookies included. */
function startedBy(h: ReturnType<typeof harness>) {
  const started = fakeResponse();
  h.controller.start(started.response);
  const state = new URL(started.redirect.mock.calls[0]?.[0] as string).searchParams.get("state");
  return {
    request: {
      cookies: { [OAUTH_STATE_COOKIE]: started.cookies.get(OAUTH_STATE_COOKIE) },
    } as unknown as Request,
    state: state as string,
  };
}

/** A round trip whose state was sealed with a version of the test's choosing. */
function startedWithVersion(h: ReturnType<typeof harness>, version?: string) {
  const issuing = fakeResponse();
  const state = h.sessions.issueState(issuing.response, "SIGN_IN", version);
  return {
    request: {
      cookies: { [OAUTH_STATE_COOKIE]: issuing.cookies.get(OAUTH_STATE_COOKIE) },
    } as unknown as Request,
    state,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("starting sign-in", () => {
  it("asks GitHub for the sign-in grant only", () => {
    const { controller } = harness();
    const { response, redirect } = fakeResponse();
    controller.start(response);

    const url = new URL(redirect.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get("scope")).toBe("read:user read:org");
  });

  /** The version is the server's decision, sealed into the state with the purpose. */
  it("seals the current public-activity consent version into the state", () => {
    const h = harness();
    const { request, state } = startedBy(h);

    const opened = h.sessions.consumeState(
      fakeResponse().response,
      (request.cookies as Record<string, string>)[OAUTH_STATE_COOKIE],
      state,
    );
    expect(opened?.consentVersion).toBe(PUBLIC_ACTIVITY_CONSENT.version);
  });
});

describe("completing sign-in", () => {
  it("signs the person in, stores the sign-in grant and records their consent", async () => {
    gitHub();
    const h = harness();
    const { request, state } = startedBy(h);
    const { response, redirect, cookies } = fakeResponse();

    await h.controller.callback(request, response, "code-1", state);

    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(h.authorizations.grant).toHaveBeenCalledWith(
      ISAAC,
      "gho_signin",
      ["read:org", "read:user"],
      { keepBroader: true },
    );
    expect(h.consents.record).toHaveBeenCalledWith({
      gitHubUserId: ISAAC,
      userId: "user-isaac",
      kind: "PUBLIC_ACTIVITY",
      version: PUBLIC_ACTIVITY_CONSENT.version,
      at: expect.any(Date),
    });
    // The consent follows a stored token, never the other way round.
    expect(h.order).toEqual(["grant", "consent"]);
    expect(redirect).toHaveBeenCalledWith("https://app.kreds.sh/?welcome=new");
  });

  /**
   * What is recorded is what the state says the person was shown, not whatever
   * happens to be current when they come back.
   */
  it("records the version sealed in the state", async () => {
    gitHub();
    const h = harness();
    const { request, state } = startedWithVersion(h, "public-activity-v1-as-shown");

    await h.controller.callback(request, fakeResponse().response, "code-2", state);

    expect(h.consents.record).toHaveBeenCalledWith(
      expect.objectContaining({ version: "public-activity-v1-as-shown" }),
    );
  });

  /**
   * A round trip started before Kreds asked for consent showed no text, so
   * nobody agreed to anything: sign in, store nothing.
   */
  it("stores nothing for a round trip that carried no consent", async () => {
    gitHub();
    const h = harness();
    const { request, state } = startedWithVersion(h);
    const { response, cookies } = fakeResponse();

    await h.controller.callback(request, response, "code-3", state);

    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(h.authorizations.grant).not.toHaveBeenCalled();
    expect(h.consents.record).not.toHaveBeenCalled();
  });

  /**
   * No `TOKEN_ENCRYPTION_KEY`: nothing can be kept, so nothing is recorded as
   * active either. Sign-in still works; the dashboard says reading is not
   * available on this instance.
   */
  it("still signs in, storing and recording nothing, without an encryption key", async () => {
    gitHub();
    const h = harness({ cipherConfigured: false });
    const { request, state } = startedBy(h);
    const { response, cookies, redirect } = fakeResponse();

    await h.controller.callback(request, response, "code-4", state);

    expect(cookies.has(SESSION_COOKIE)).toBe(true);
    expect(h.consents.record).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("https://app.kreds.sh/?welcome=new");
  });

  it("records no consent when GitHub granted nothing to store", async () => {
    gitHub(null);
    const h = harness();
    const { request, state } = startedBy(h);

    await h.controller.callback(request, fakeResponse().response, "code-5", state);

    expect(h.authorizations.grant).not.toHaveBeenCalled();
    expect(h.consents.record).not.toHaveBeenCalled();
  });

  it("records no consent when the token could not be stored", async () => {
    gitHub();
    const h = harness();
    h.authorizations.grant.mockRejectedValueOnce(new Error("database down"));
    const { request, state } = startedBy(h);

    await expect(
      h.controller.callback(request, fakeResponse().response, "code-6", state),
    ).rejects.toThrow("database down");
    expect(h.consents.record).not.toHaveBeenCalled();
  });

  it("refuses a state that does not match, before asking GitHub anything", async () => {
    const fetchMock = gitHub();
    const h = harness();
    const { request } = startedBy(h);

    await expect(
      h.controller.callback(request, fakeResponse().response, "code-7", "attacker-state"),
    ).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.consents.record).not.toHaveBeenCalled();
  });

  it("refuses a state issued for the private grant", async () => {
    gitHub();
    const h = harness();
    const issuing = fakeResponse();
    const state = h.sessions.issueState(
      issuing.response,
      "PRIVATE_INGESTION",
      "public-activity-v1",
    );
    const request = {
      cookies: { [OAUTH_STATE_COOKIE]: issuing.cookies.get(OAUTH_STATE_COOKIE) },
    } as unknown as Request;

    await expect(
      h.controller.callback(request, fakeResponse().response, "code-8", state),
    ).rejects.toThrow(BadRequestException);
    expect(h.authorizations.grant).not.toHaveBeenCalled();
  });

  it("sends a person who pressed Cancel back, recording nothing", async () => {
    const h = harness();
    const { response, redirect } = fakeResponse();

    await h.controller.callback(
      { cookies: {} } as unknown as Request,
      response,
      undefined,
      undefined,
      "access_denied",
    );

    expect(redirect).toHaveBeenCalledWith("https://app.kreds.sh/?signin=cancelled");
    expect(h.consents.record).not.toHaveBeenCalled();
  });
});
