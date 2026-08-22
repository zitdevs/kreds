import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

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
 */
const SCOPES = "read:user read:org";

const tokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  scope: z.string().optional(),
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

    if (!response.ok) {
      this.logger.warn(`GitHub token exchange returned ${response.status}`);
      throw new UnauthorizedException("GitHub rejected the sign-in.");
    }

    // GitHub answers a bad code with HTTP 200 and an `error` field, so status
    // alone is not enough to conclude the exchange worked.
    const parsed = tokenResponse.safeParse(await response.json());
    if (!parsed.success) {
      this.logger.warn("GitHub token response did not contain an access token.");
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
