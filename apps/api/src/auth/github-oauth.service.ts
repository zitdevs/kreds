import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

import { PRIVATE_INGESTION_SCOPES, SIGN_IN_SCOPES } from "../access/scopes.js";

import { gitHubUserId, type GitHubUserId } from "@kreds/domain";

import type { Env } from "../config/env.js";
import type { OAuthPurpose } from "./session.service.js";

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
const SCOPES: Record<OAuthPurpose, string> = {
  SIGN_IN: SIGN_IN_SCOPES.join(" "),
  // Only ever requested from a signed-in user who asked for it. 26: signing in
  // and having private work ingested are "two different decisions with two
  // different grants".
  PRIVATE_INGESTION: PRIVATE_INGESTION_SCOPES.join(" "),
};

/**
 * Where each decision returns to.
 *
 * Each must be registered on the OAuth App as its own redirect URI. GitHub
 * matches a `redirect_uri` exactly unless wildcard matching is enabled for that
 * URI, and wildcard matching is off by default for apps created since
 * 2026-08-03. Kreds does not rely on it: it would widen where GitHub sends a
 * token. The self-hosting guide lists both paths.
 */
const CALLBACK_PATHS: Record<OAuthPurpose, string> = {
  SIGN_IN: "/auth/callback/github",
  PRIVATE_INGESTION: "/auth/callback/github/private-ingestion",
};

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

/**
 * A delegated grant, for the moment it takes to store it.
 *
 * Handed to a callback and never returned, so the token cannot drift into a
 * variable, a response, or a log line on its way to being sealed.
 */
export interface GrantedToken {
  readonly gitHubUserId: GitHubUserId;
  readonly token: string;
  /**
   * What GitHub says it granted, from the token response's `scope`. Never what
   * Kreds asked for: a user can narrow a grant on GitHub's own screen, and
   * assuming otherwise would have Kreds attempting reads it has no right to.
   */
  readonly scopes: readonly string[];
}

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
  private readonly apiUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get("AUTH_GITHUB_ID", { infer: true });
    this.clientSecret = config.get("AUTH_GITHUB_SECRET", { infer: true });
    this.apiUrl = config.get("KREDS_API_URL", { infer: true });
  }

  private callbackUrl(purpose: OAuthPurpose): string {
    return `${this.apiUrl}${CALLBACK_PATHS[purpose]}`;
  }

  authorizeUrl(state: string, purpose: OAuthPurpose = "SIGN_IN"): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl(purpose),
      scope: SCOPES[purpose],
      state,
      // Somebody granting access to private work already has an account.
      allow_signup: purpose === "SIGN_IN" ? "true" : "false",
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Trade a sign-in code for a token, ask GitHub who it belongs to, and hand
   * both to `use`.
   *
   * The sign-in grant answers "who are you", and, for a person who agreed to
   * the public-activity consent shown above the button, is also what Kreds
   * reads their public activity with. So `use` may store it. It never leaves
   * through this method's return value, and the scopes are what GitHub
   * granted.
   */
  async withSignInGrant<T>(
    code: string,
    use: (user: GitHubUser, grant: GrantedToken) => Promise<T>,
  ): Promise<T> {
    const { token, scopes } = await this.requestToken(code, "SIGN_IN");
    const user = await this.fetchUser(token);
    return use(user, { gitHubUserId: user.gitHubUserId, token, scopes });
  }

  /**
   * Trade a private-ingestion code for a token, and hand it to `use` to store.
   *
   * Unlike sign-in, this token is kept: 26 has Kreds asking the provider on a
   * schedule. It still never leaves through this method's return value, and the
   * identity it belongs to is read from GitHub with the token itself, so the
   * caller can check it against the person who is signed in.
   */
  async withGrantedToken<T>(code: string, use: (grant: GrantedToken) => Promise<T>): Promise<T> {
    const { token, scopes } = await this.requestToken(code, "PRIVATE_INGESTION");
    const user = await this.fetchUser(token);
    return use({ gitHubUserId: user.gitHubUserId, token, scopes });
  }

  private async requestToken(
    code: string,
    purpose: OAuthPurpose,
  ): Promise<{ token: string; scopes: readonly string[] }> {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl(purpose),
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
    return {
      token: parsed.data.access_token,
      // Comma separated in GitHub's answer. Absent means none were granted,
      // never "whatever was asked for".
      scopes: (parsed.data.scope ?? "").split(/[\s,]+/).filter(Boolean),
    };
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
