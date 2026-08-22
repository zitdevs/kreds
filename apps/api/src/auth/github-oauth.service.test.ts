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

    await expect(service().exchange("code-1")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("incorrect_client_credentials"));
  });

  it("includes GitHub's description when there is one", async () => {
    tokenEndpointReturns(
      JSON.stringify({ error: "bad_verification_code", error_description: "The code expired." }),
    );
    const warn = captureWarnings();

    await expect(service().exchange("code-2")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("The code expired."));
  });

  it("survives a body that is not JSON at all", async () => {
    tokenEndpointReturns("<html>502 Bad Gateway</html>", 502);
    const warn = captureWarnings();

    await expect(service().exchange("code-3")).rejects.toBeInstanceOf(UnauthorizedException);
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

    await expect(service().exchange("code-4")).rejects.toBeInstanceOf(UnauthorizedException);

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
