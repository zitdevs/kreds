import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";

import type { Env } from "../config/env.js";

export interface SessionPayload {
  readonly userId: string;
  readonly gitHubUserId: number;
  readonly issuedAt: number;
}

export const SESSION_COOKIE = "kreds_session";
export const OAUTH_STATE_COOKIE = "kreds_oauth_state";

/** Thirty days. Long enough not to be irritating, short enough that a stolen cookie expires. */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
/** The OAuth round trip is seconds. Ten minutes is generous and still bounded. */
const STATE_TTL_SECONDS = 60 * 10;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Signed cookies, not JWTs.
 *
 * The token never leaves this service and is never read by a third party, so
 * the only thing needed is integrity: proof that we issued it and it has not
 * been edited. A JWT would add a header, an algorithm field and a family of
 * algorithm-confusion mistakes for no benefit here.
 */
@Injectable()
export class SessionService {
  private readonly secret: string;
  private readonly secureCookies: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get("AUTH_SECRET", { infer: true });
    // A cookie marked `secure` is never sent over plain HTTP, which would make
    // local development impossible against `http://localhost`.
    this.secureCookies = config.get("KREDS_API_URL", { infer: true }).startsWith("https://");
  }

  private sign(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  private seal(payload: object, ttlSeconds: number): string {
    const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }));
    return `${body}.${this.sign(body)}`;
  }

  /**
   * @returns the payload, or `null` for anything that is not a token we issued,
   * has been edited, or has expired. Every failure returns the same `null`: a
   * caller that could tell "bad signature" from "expired" would leak which one
   * to an attacker.
   */
  private open<T>(token: string | undefined): T | null {
    if (!token) return null;
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    const expected = Buffer.from(this.sign(body));
    const actual = Buffer.from(signature);
    // Constant time, so the comparison does not leak how much of the signature
    // was correct.
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
      return payload.exp > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  issueSession(response: Response, payload: Omit<SessionPayload, "issuedAt">): void {
    const token = this.seal({ ...payload, issuedAt: Date.now() }, SESSION_TTL_SECONDS);
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.secureCookies,
      // `lax` rather than `strict`: the OAuth callback is a cross-site
      // navigation, and `strict` would withhold the cookie on exactly the
      // request that just created it.
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
  }

  readSession(token: string | undefined): SessionPayload | null {
    return this.open<SessionPayload>(token);
  }

  clearSession(response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  /**
   * A one-time value tying the redirect to the callback.
   *
   * Without it, anyone can send a victim to our callback carrying an attacker's
   * authorization code and silently sign them into the attacker's account.
   */
  issueState(response: Response): string {
    const nonce = randomBytes(16).toString("base64url");
    const token = this.seal({ nonce }, STATE_TTL_SECONDS);
    response.cookie(OAUTH_STATE_COOKIE, token, {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS * 1000,
    });
    return nonce;
  }

  consumeState(
    response: Response,
    cookie: string | undefined,
    returned: string | undefined,
  ): boolean {
    response.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    const opened = this.open<{ nonce: string }>(cookie);
    if (!opened || !returned) return false;

    const expected = Buffer.from(opened.nonce);
    const actual = Buffer.from(returned);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
