import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";

import { OAUTH_STATE_COOKIE, SESSION_COOKIE, SessionService } from "./session.service.js";

const SECRET = "a".repeat(32);

function serviceFor(apiUrl = "https://api.kreds.sh") {
  const config = {
    get: (key: string) => (key === "AUTH_SECRET" ? SECRET : apiUrl),
  };
  return new SessionService(config as never);
}

/** Captures what was written to the cookie jar without needing a real response. */
function fakeResponse() {
  const cookies = new Map<string, { value: string; options: Record<string, unknown> }>();
  const cleared: string[] = [];
  const response = {
    cookie: vi.fn((name: string, value: string, options: Record<string, unknown>) => {
      cookies.set(name, { value, options });
    }),
    clearCookie: vi.fn((name: string) => cleared.push(name)),
  } as unknown as Response;
  return { response, cookies, cleared };
}

describe("sessions are signed, not merely encoded", () => {
  it("round-trips the payload it issued", () => {
    const service = serviceFor();
    const { response, cookies } = fakeResponse();
    service.issueSession(response, { userId: "user-1", gitHubUserId: 4242 });

    const token = cookies.get(SESSION_COOKIE)?.value;
    const payload = service.readSession(token);
    expect(payload?.userId).toBe("user-1");
    expect(payload?.gitHubUserId).toBe(4242);
  });

  /**
   * The point of signing. The body is base64url, so anyone can read and rewrite
   * it; what they cannot do is produce a matching signature.
   */
  it("rejects a token whose payload was edited", () => {
    const service = serviceFor();
    const { response, cookies } = fakeResponse();
    service.issueSession(response, { userId: "user-1", gitHubUserId: 4242 });

    const [body = "", signature = ""] = (cookies.get(SESSION_COOKIE)?.value ?? "").split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<
      string,
      unknown
    >;
    decoded["userId"] = "user-2";
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;

    expect(service.readSession(forged)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const { response, cookies } = fakeResponse();
    serviceFor().issueSession(response, { userId: "user-1", gitHubUserId: 4242 });
    const token = cookies.get(SESSION_COOKIE)?.value;

    const other = new SessionService({
      get: (key: string) => (key === "AUTH_SECRET" ? "b".repeat(32) : "https://api.kreds.sh"),
    } as never);
    expect(other.readSession(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    const service = serviceFor();
    const { response, cookies } = fakeResponse();
    service.issueSession(response, { userId: "user-1", gitHubUserId: 4242 });
    const token = cookies.get(SESSION_COOKIE)?.value;

    // Thirty-one days, one past the cookie's own lifetime.
    vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(service.readSession(token)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects nonsense rather than throwing", () => {
    const service = serviceFor();
    for (const token of ["", "no-dot", "a.b", "....", undefined]) {
      expect(service.readSession(token)).toBeNull();
    }
  });
});

describe("the session cookie cannot be read by scripts or sent cross-site", () => {
  it("sets httpOnly, sameSite lax and a path", () => {
    const service = serviceFor();
    const { response, cookies } = fakeResponse();
    service.issueSession(response, { userId: "user-1", gitHubUserId: 4242 });

    const options = cookies.get(SESSION_COOKIE)?.options;
    expect(options?.["httpOnly"]).toBe(true);
    // `lax` rather than `strict`: the OAuth callback is a cross-site
    // navigation, and `strict` withholds the cookie on exactly that request.
    expect(options?.["sameSite"]).toBe("lax");
    expect(options?.["path"]).toBe("/");
  });

  it("marks the cookie secure on https", () => {
    const { response, cookies } = fakeResponse();
    serviceFor("https://api.kreds.sh").issueSession(response, { userId: "u", gitHubUserId: 1 });
    expect(cookies.get(SESSION_COOKIE)?.options["secure"]).toBe(true);
  });

  /**
   * A cookie marked `secure` is never sent over plain HTTP, which would make
   * local development against `http://localhost` impossible.
   */
  it("does not mark it secure on http, so local development works", () => {
    const { response, cookies } = fakeResponse();
    serviceFor("http://localhost:4000").issueSession(response, { userId: "u", gitHubUserId: 1 });
    expect(cookies.get(SESSION_COOKIE)?.options["secure"]).toBe(false);
  });
});

/**
 * Without state, anyone can send a victim to the callback carrying an
 * attacker's authorization code and silently sign them into the attacker's
 * account.
 */
describe("OAuth state ties the redirect to the callback", () => {
  it("accepts the nonce it issued", () => {
    const service = serviceFor();
    const issuing = fakeResponse();
    const nonce = service.issueState(issuing.response);
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value;

    const consuming = fakeResponse();
    expect(service.consumeState(consuming.response, cookie, nonce)).not.toBeNull();
  });

  it("rejects a nonce that does not match the cookie", () => {
    const service = serviceFor();
    const issuing = fakeResponse();
    service.issueState(issuing.response);
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value;

    const consuming = fakeResponse();
    expect(service.consumeState(consuming.response, cookie, "attacker-nonce")).toBeNull();
  });

  it("rejects a callback with no state at all", () => {
    const service = serviceFor();
    const issuing = fakeResponse();
    service.issueState(issuing.response);
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value;

    const consuming = fakeResponse();
    expect(service.consumeState(consuming.response, cookie, undefined)).toBeNull();
  });

  it("rejects a state cookie that was never issued", () => {
    const service = serviceFor();
    const { response } = fakeResponse();
    expect(service.consumeState(response, "forged.token", "anything")).toBeNull();
  });

  /** One-time. Clearing it on every attempt is what makes replay impossible. */
  it("clears the state cookie whether or not it matched", () => {
    const service = serviceFor();
    const issuing = fakeResponse();
    const nonce = service.issueState(issuing.response);
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value;

    const good = fakeResponse();
    service.consumeState(good.response, cookie, nonce);
    expect(good.cleared).toContain(OAUTH_STATE_COOKIE);

    const bad = fakeResponse();
    service.consumeState(bad.response, cookie, "wrong");
    expect(bad.cleared).toContain(OAUTH_STATE_COOKIE);
  });
});

/**
 * 26: signing in and having private work ingested are "two different decisions
 * with two different grants". A state issued for one must not complete the
 * other, or a sign-in round trip could be replayed into the callback that
 * stores a token.
 */
describe("OAuth state is bound to the decision it was issued for", () => {
  function issued(purpose?: "SIGN_IN" | "PRIVATE_INGESTION") {
    const service = serviceFor();
    const issuing = fakeResponse();
    const nonce = service.issueState(issuing.response, purpose);
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value;
    return { service, nonce, cookie };
  }

  it("completes the decision it was issued for", () => {
    const { service, nonce, cookie } = issued("PRIVATE_INGESTION");
    expect(
      service.consumeState(fakeResponse().response, cookie, nonce, "PRIVATE_INGESTION"),
    ).not.toBeNull();
  });

  it("refuses to complete a private-ingestion grant with a sign-in state", () => {
    const { service, nonce, cookie } = issued();
    expect(
      service.consumeState(fakeResponse().response, cookie, nonce, "PRIVATE_INGESTION"),
    ).toBeNull();
  });

  it("refuses to complete a sign-in with a private-ingestion state", () => {
    const { service, nonce, cookie } = issued("PRIVATE_INGESTION");
    expect(service.consumeState(fakeResponse().response, cookie, nonce)).toBeNull();
  });
});

/**
 * Which consent text the person was shown is decided by the server when it
 * starts the round trip, and comes back sealed. The callback reads it from
 * here, so nothing the browser sends can change what is recorded.
 */
describe("OAuth state carries the consent version the server chose", () => {
  it("returns the version sealed into it", () => {
    const service = serviceFor();
    const issuing = fakeResponse();
    const nonce = service.issueState(issuing.response, "SIGN_IN", "public-activity-v1");
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value;

    expect(service.consumeState(fakeResponse().response, cookie, nonce)).toEqual({
      purpose: "SIGN_IN",
      consentVersion: "public-activity-v1",
    });
  });

  it("carries none when none was chosen", () => {
    const service = serviceFor();
    const issuing = fakeResponse();
    const nonce = service.issueState(issuing.response);
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value;

    expect(service.consumeState(fakeResponse().response, cookie, nonce)?.consentVersion).toBeNull();
  });

  /** The version travels inside the signed cookie, so editing it breaks the seal. */
  it("refuses a state whose version was edited", () => {
    const service = serviceFor();
    const issuing = fakeResponse();
    const nonce = service.issueState(issuing.response, "SIGN_IN", "public-activity-v1");
    const cookie = issuing.cookies.get(OAUTH_STATE_COOKIE)?.value ?? "";
    const [body, signature] = cookie.split(".");
    const edited = JSON.parse(Buffer.from(body ?? "", "base64url").toString()) as Record<
      string,
      unknown
    >;
    edited["consentVersion"] = "public-activity-v0";
    const forged = `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${signature}`;

    expect(service.consumeState(fakeResponse().response, forged, nonce)).toBeNull();
  });
});
