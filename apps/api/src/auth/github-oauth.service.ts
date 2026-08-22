import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

import { SIGN_IN_SCOPES } from "../access/scopes.js";

import { gitHubUserId, type GitHubUserId } from "@kreds/domain";

import type { Env } from "../config/env.js";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

/**
 * What Kreds asks for at sign-in, and nothing more.
 *
 * `.env.example` publishes this same pair, and the self-hosting guide promises
 * "This grant never touches your code." Adding a scope here would quietly break
 * that promise for every existing installation.
 *
 * A04 did not widen it. Ingesting private work needs a broader grant, and
 * asking for it at sign-in would have sized one decision for the larger case.
 * See `access/scopes.ts`.
 */
const SCOPES = SIGN_IN_SCOPES.join(" ");

const tokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  scope: z.string().optional(),
});

/**
 * How GitHub says no.
 *
 * `error` is a stable machine-readable code: `incorrect_client_credentials`,
 * `redirect_uri_mismatch`, `bad_verification_code`. Which one it is decides
 * where an operator looks, so it is worth reading rather than discarding.
 */
const tokenError = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/**
 * The subset of GitHub's user payload Kreds stores.
 *
 * `id` is the only field that matters for identity. Everything else is display
 * (09: Identity), which is why nothing below treats `login` as a key.
 */
const userResponse = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

export interface GitHubUser {
  readonly gitHubUserId: GitHubUserId;
  readonly login: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly avatarUrl: string | null;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/**
 * What GitHub said went wrong, in a form safe to write to a log.
 *
 * This deliberately never returns the raw body. On the success path that body
 * holds an access token, and a helper that echoes whatever it is handed is one
 * careless call away from printing a live credential into the logs.
 */
function reasonIn(body: string): string {
  const parsed = tokenError.safeParse(parseJson(body));
  if (!parsed.success) return "no error code in the response";
  const { error, error_description } = parsed.data;
  return error_description ? `${error} (${error_description})` : error;
}

/**
 * The server half of the GitHub OAuth flow.
 *
 * Implemented against GitHub's endpoints rather than through Auth.js, which the
 * build plan named. Auth.js is built around a framework's request handler, and
 * this service is NestJS: wiring it in would mean adapting its handler and
 * still writing the session layer by hand. The exchange itself is small enough
 * that the adapter would be the larger half.
 */
@Injectable()
export class GitHubOAuthService {
  private readonly logger = new Logger(GitHubOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get("AUTH_GITHUB_ID", { infer: true });
    this.clientSecret = config.get("AUTH_GITHUB_SECRET", { infer: true });
    this.callbackUrl = `${config.get("KREDS_API_URL", { infer: true })}/auth/callback/github`;
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: SCOPES,
      state,
      allow_signup: "true",
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Trade the one-time code for a token, then ask GitHub who it belongs to.
   *
   * The token is used once and never stored. Kreds does not act on anyone's
   * behalf with this grant: it exists to answer "who are you", and a token kept
   * around is a credential that can leak without ever being used.
   */
  async exchange(code: string): Promise<GitHubUser> {
    const token = await this.requestToken(code);
    return this.fetchUser(token);
  }

  private async requestToken(code: string): Promise<string> {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl,
      }),
    });

    // Read the body once, as text, because both branches below need it and a
    // `Response` body can only be consumed a single time.
    const body = await response.text();

    if (!response.ok) {
      this.logger.warn(`GitHub token exchange returned ${response.status}: ${reasonIn(body)}`);
      throw new UnauthorizedException("GitHub rejected the sign-in.");
    }

    // GitHub answers a bad code with HTTP 200 and an `error` field, so status
    // alone is not enough to conclude the exchange worked.
    const parsed = tokenResponse.safeParse(parseJson(body));
    if (!parsed.success) {
      this.logger.warn(`GitHub refused the token exchange: ${reasonIn(body)}`);
      throw new UnauthorizedException("GitHub rejected the sign-in.");
    }
    return parsed.data.access_token;
  }

  private async fetchUser(token: string): Promise<GitHubUser> {
    const response = await fetch(USER_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "kreds",
      },
    });

    if (!response.ok) {
      this.logger.warn(`GitHub user lookup returned ${response.status}`);
      throw new UnauthorizedException("Could not read your GitHub profile.");
    }

    const parsed = userResponse.safeParse(await response.json());
    if (!parsed.success) {
      throw new UnauthorizedException("GitHub returned a profile Kreds could not read.");
    }

    const user = parsed.data;
    return {
      gitHubUserId: gitHubUserId(user.id),
      login: user.login,
      displayName: user.name ?? null,
      email: user.email ?? null,
      avatarUrl: user.avatar_url ?? null,
    };
  }
}
