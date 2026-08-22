import { BadRequestException, Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { IdentityRepository } from "@kreds/database";
import { gitHubUserId } from "@kreds/domain";

import type { Env } from "../config/env.js";
import { GitHubOAuthService } from "./github-oauth.service.js";
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, SessionService } from "./session.service.js";

interface SessionUser {
  readonly id: string;
  /** The person's name. */
  readonly displayName: string;
  /** Their GitHub handle. Mutable, and never an identifier (09: Identity). */
  readonly login: string;
  readonly avatarUrl: string | null;
  readonly gitHubUserId: number;
}

/**
 * Phase 1, in one endpoint pair: OAuth answers "who are you", and the answer is
 * attached to a GitHub identity that may already have a history.
 */
@Controller("auth")
export class AuthController {
  private readonly appUrl: string;

  constructor(
    private readonly oauth: GitHubOAuthService,
    private readonly sessions: SessionService,
    private readonly identities: IdentityRepository,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("KREDS_APP_URL", { infer: true });
  }

  /** Start the flow. The state cookie is what makes the callback trustworthy. */
  @Get("github")
  start(@Res() response: Response): void {
    const state = this.sessions.issueState(response);
    response.redirect(this.oauth.authorizeUrl(state));
  }

  /**
   * GitHub sends the person back here.
   *
   * The path matches the one already published in `.env.example` and the
   * self-hosting guide, so an instance configured against those docs works
   * without editing its OAuth App.
   */
  @Get("callback/github")
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ): Promise<void> {
    // The person pressed Cancel on GitHub's consent screen. Not an error worth
    // a stack trace, just a sign-in that did not happen.
    if (error) {
      response.redirect(`${this.appUrl}/?signin=cancelled`);
      return;
    }

    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    if (!this.sessions.consumeState(response, cookies?.[OAUTH_STATE_COOKIE], state)) {
      throw new BadRequestException("This sign-in link is stale. Start again from Kreds.");
    }
    if (!code) throw new BadRequestException("GitHub did not return an authorization code.");

    const profile = await this.oauth.exchange(code);
    const { user, hadPriorHistory } = await this.identities.claim({
      gitHubUserId: profile.gitHubUserId,
      login: profile.login,
      displayName: profile.displayName,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    });

    this.sessions.issueSession(response, {
      userId: user.id,
      gitHubUserId: profile.gitHubUserId,
    });

    // 09: Identity, "Your Kreds history starts before your Kreds account does."
    // The product shows a different first screen when work was already waiting.
    response.redirect(`${this.appUrl}/?welcome=${hadPriorHistory ? "returning" : "new"}`);
  }

  /** Who the caller is, or `null`. The web app's session check. */
  @Get("session")
  async session(@Req() request: Request): Promise<{ user: SessionUser | null }> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const payload = this.sessions.readSession(cookies?.[SESSION_COOKIE]);
    if (!payload) return { user: null };

    // Read through to the database rather than trusting the cookie's copy. A
    // renamed handle or a revoked account should take effect immediately, not
    // whenever the session happens to expire.
    const account = await this.identities.findAccount(gitHubUserId(payload.gitHubUserId));
    if (!account || account.user.id !== payload.userId) return { user: null };

    return {
      user: {
        id: account.user.id,
        // The person's name, not their GitHub handle. Both are returned
        // because they are different things and the interface shows both.
        displayName: account.user.displayName,
        login: account.identity.login,
        avatarUrl: account.avatarUrl,
        gitHubUserId: payload.gitHubUserId,
      },
    };
  }

  @Post("signout")
  signOut(@Res() response: Response): void {
    this.sessions.clearSession(response);
    response.status(204).send();
  }
}
