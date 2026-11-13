import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Optional,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { Authorizations, Consents, IdentityRepository } from "@kreds/database";
import { gitHubUserId, PUBLIC_ACTIVITY_CONSENT } from "@kreds/domain";

import type { Env } from "../config/env.js";
import { GitHubOAuthService, type GrantedToken } from "./github-oauth.service.js";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SessionService,
  type OAuthState,
} from "./session.service.js";

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
 *
 * Signing in is also 26's Community path, "Connect GitHub -> join Community ->
 * public contribution discovery". The sign-in page shows the public-activity
 * consent directly above the button, and continuing is agreeing to it, so the
 * callback keeps the sign-in grant and records that consent. The two are one
 * act: no consent is recorded without a stored grant, and no grant is stored
 * for a round trip that showed no consent.
 */
@Controller("auth")
export class AuthController {
  private readonly appUrl: string;

  constructor(
    private readonly oauth: GitHubOAuthService,
    private readonly sessions: SessionService,
    private readonly identities: IdentityRepository,
    config: ConfigService<Env, true>,
    // `null` when no `TOKEN_ENCRYPTION_KEY` is configured. Sign-in still works;
    // nothing is stored and no consent is recorded, and `/access/status` tells
    // the dashboard reading is not available here.
    @Optional() @Inject(Authorizations) private readonly authorizations: Authorizations | null,
    private readonly consents: Consents,
  ) {
    this.appUrl = config.get("KREDS_APP_URL", { infer: true });
  }

  /**
   * Start the flow. The state cookie is what makes the callback trustworthy,
   * and it carries the version of the consent text the sign-in page shows,
   * decided here rather than taken from the browser.
   */
  @Get("github")
  start(@Res() response: Response): void {
    const state = this.sessions.issueState(response, "SIGN_IN", PUBLIC_ACTIVITY_CONSENT.version);
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
    const opened = this.sessions.consumeState(response, cookies?.[OAUTH_STATE_COOKIE], state);
    if (!opened) {
      throw new BadRequestException("This sign-in link is stale. Start again from Kreds.");
    }
    if (!code) throw new BadRequestException("GitHub did not return an authorization code.");

    const hadPriorHistory = await this.oauth.withSignInGrant(code, async (profile, grant) => {
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

      await this.keepPublicActivityGrant(user.id, grant, opened);
      return hadPriorHistory;
    });

    // 09: Identity, "Your Kreds history starts before your Kreds account does."
    // The product shows a different first screen when work was already waiting.
    response.redirect(`${this.appUrl}/?welcome=${hadPriorHistory ? "returning" : "new"}`);
  }

  /**
   * Store the sign-in grant and record the consent it was given under.
   *
   * Never narrows a live grant: somebody who already granted private access
   * keeps that token and its reach, and still has their public consent
   * recorded, because they just agreed to it again.
   *
   * Stores nothing, and records nothing, when this instance has no key, when
   * GitHub granted nothing, or when the round trip showed no consent text.
   * The grant comes first, so a consent never exists without a token behind it.
   */
  private async keepPublicActivityGrant(
    userId: string,
    grant: GrantedToken,
    state: OAuthState,
  ): Promise<void> {
    if (!this.authorizations || !state.consentVersion || grant.scopes.length === 0) return;

    await this.authorizations.grant(grant.gitHubUserId, grant.token, grant.scopes, {
      keepBroader: true,
    });
    await this.consents.record({
      gitHubUserId: grant.gitHubUserId,
      userId,
      kind: "PUBLIC_ACTIVITY",
      version: state.consentVersion,
      at: new Date(),
    });
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
