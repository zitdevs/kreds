import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger, UnauthorizedException } from "@nestjs/common";

import { GitHubOAuthService } from "./github-oauth.service.js";

const ENV: Record<string, string> = {
  AUTH_GITHUB_ID: "Ov23liEXAMPLE",
  AUTH_GITHUB_SECRET: "shhh",
  KREDS_API_URL: "https://api.kreds.sh",
};

function service() {
  return new GitHubOAuthService({ get: (key: string) => ENV[key] } as never);
}

/** Answers the token endpoint with `body`, and fails any other call loudly. */
function tokenEndpointReturns(body: string, status = 200) {
  const fetchMock = vi.fn(async (url: string) => {
    if (!String(url).includes("/login/oauth/access_token")) {
      throw new Error(`unexpected request to ${String(url)}`);
    }
    return { ok: status < 400, status, text: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Nest's `Logger` is constructed per instance, so the spy goes on its
 * prototype rather than on the service's own field.
 */
function captureWarnings() {
  return vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {
    // Keep the suite's output readable; the assertions read the calls.
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a refused token exchange says why", () => {
  /**
   * The reason this test exists: the first version logged only "did not
   * contain an access token", which is true of a wrong secret, a stale code
   * and a mismatched callback alike. Debugging a live sign-in failure with
   * that line means guessing between three unrelated fixes.
   */
  it("logs the error code GitHub returned, not just that it failed", async () => {
    tokenEndpointReturns(JSON.stringify({ error: "incorrect_client_credentials" }));
    const warn = captureWarnings();

    await expect(service().withSignInGrant("code-1", async () => undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("incorrect_client_credentials"));
  });

  it("includes GitHub's description when there is one", async () => {
    tokenEndpointReturns(
      JSON.stringify({ error: "bad_verification_code", error_description: "The code expired." }),
    );
    const warn = captureWarnings();

    await expect(service().withSignInGrant("code-2", async () => undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("The code expired."));
  });

  it("survives a body that is not JSON at all", async () => {
    tokenEndpointReturns("<html>502 Bad Gateway</html>", 502);
    const warn = captureWarnings();

    await expect(service().withSignInGrant("code-3", async () => undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("502"));
  });

  /**
   * The whole point of not logging the raw body. A helper that echoes whatever
   * it was handed reads fine until the day someone calls it on the success
   * path, and then every sign-in writes a live credential into the logs.
   */
  it("never writes an access token into the log", async () => {
    const token = "gho_averyrealisticlookingtoken";
    // A token in the body *and* a shape the schema rejects, so the logging
    // branch runs with a live credential in front of it. A body that parsed
    // cleanly would skip the log entirely and the assertion below would pass
    // without ever testing anything.
    tokenEndpointReturns(JSON.stringify({ access_token: token }));
    const warn = captureWarnings();

    await expect(service().withSignInGrant("code-4", async () => undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(warn).toHaveBeenCalled();
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toContain(token);
    }
  });
});

describe("the authorize URL", () => {
  it("asks for read access only, and carries the state", () => {
    const url = new URL(service().authorizeUrl("nonce-1"));
    expect(url.searchParams.get("scope")).toBe("read:user read:org");
    expect(url.searchParams.get("state")).toBe("nonce-1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.kreds.sh/auth/callback/github");
  });
});

describe("the private-ingestion grant", () => {
  const GRANT_CALLBACK = "https://api.kreds.sh/auth/callback/github/private-ingestion";

  /**
   * Its own callback, under the sign-in one. GitHub accepts a `redirect_uri`
   * below the OAuth App's registered callback, so no instance has to edit its
   * App to offer this.
   */
  it("asks for the private grant, and returns to its own callback", () => {
    const url = new URL(service().authorizeUrl("nonce-2", "PRIVATE_INGESTION"));
    expect(url.searchParams.get("scope")).toBe("read:user read:org repo");
    expect(url.searchParams.get("state")).toBe("nonce-2");
    expect(url.searchParams.get("redirect_uri")).toBe(GRANT_CALLBACK);
    expect(
      GRANT_CALLBACK.startsWith(
        new URL(service().authorizeUrl("n")).searchParams.get("redirect_uri") ?? "-",
      ),
    ).toBe(true);
  });

  function gitHubAnswers(token: Record<string, unknown>, user: Record<string, unknown>) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/login/oauth/access_token")) {
        return new Response(JSON.stringify(token), { status: 200 });
      }
      if (String(url) === "https://api.github.com/user") {
        return new Response(JSON.stringify(user), { status: 200 });
      }
      throw new Error(`unexpected request to ${String(url)} ${String(init?.method)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  /**
   * Read from what GitHub granted, never from what Kreds asked for. The token
   * response's `scope` is GitHub saying what this token can actually do.
   */
  it("reports the scopes GitHub granted, not the ones Kreds asked for", async () => {
    const fetchMock = gitHubAnswers(
      { access_token: "gho_fake", token_type: "bearer", scope: "read:org,read:user" },
      { id: 4242, login: "isaac" },
    );

    const grant = await service().withGrantedToken("code-9", async (g) => ({
      gitHubUserId: g.gitHubUserId,
      scopes: g.scopes,
    }));

    expect(grant).toEqual({ gitHubUserId: 4242, scopes: ["read:org", "read:user"] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ redirect_uri: GRANT_CALLBACK });
  });

  it("treats a response that names no scopes as a grant of none", async () => {
    gitHubAnswers({ access_token: "gho_fake", token_type: "bearer" }, { id: 4242, login: "isaac" });
    const scopes = await service().withGrantedToken("code-10", async (g) => g.scopes);
    expect(scopes).toEqual([]);
  });

  /** The token goes to the callback that stores it, and is never returned from this service. */
  it("hands the token to the caller's use and returns only what that use returns", async () => {
    gitHubAnswers(
      { access_token: "gho_fake", token_type: "bearer", scope: "repo" },
      { id: 4242, login: "isaac" },
    );
    const seen = await service().withGrantedToken("code-11", async (g) => g.token === "gho_fake");
    expect(seen).toBe(true);
  });
});

/**
 * Signing in now keeps its token, so Kreds can read the person's public
 * activity they just agreed to. The token still never leaves through a return
 * value: it goes to the callback that seals it.
 */
describe("the sign-in grant", () => {
  function gitHubAnswers(token: Record<string, unknown>, user: Record<string, unknown>) {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes("/login/oauth/access_token")) {
        return new Response(JSON.stringify(token), { status: 200 });
      }
      if (String(url) === "https://api.github.com/user") {
        return new Response(JSON.stringify(user), { status: 200 });
      }
      throw new Error(`unexpected request to ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("hands over who signed in and what GitHub granted, on the sign-in callback", async () => {
    const fetchMock = gitHubAnswers(
      { access_token: "gho_fake", token_type: "bearer", scope: "read:org,read:user" },
      { id: 4242, login: "isaac", name: "Isaac" },
    );

    const seen = await service().withSignInGrant("code-12", async (user, grant) => ({
      login: user.login,
      displayName: user.displayName,
      gitHubUserId: grant.gitHubUserId,
      scopes: grant.scopes,
      hasToken: grant.token === "gho_fake",
    }));

    expect(seen).toEqual({
      login: "isaac",
      displayName: "Isaac",
      gitHubUserId: 4242,
      scopes: ["read:org", "read:user"],
      hasToken: true,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      redirect_uri: "https://api.kreds.sh/auth/callback/github",
    });
  });
});
