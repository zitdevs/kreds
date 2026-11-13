import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Optional,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { Authorizations, IdentityRepository } from "@kreds/database";

import { reachOf } from "../access/scopes.js";
import type { Env } from "../config/env.js";
import { GitHubOAuthService } from "./github-oauth.service.js";
import { signedInUser } from "./signed-in.js";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SessionService,
  type SessionPayload,
} from "./session.service.js";

type Cookies = Record<string, string | undefined> | undefined;

/**
 * The opt-in that lets Kreds read a signed-in user's own work, private
 * repositories included, through their delegated authorization.
 *
 * 26: signing in and having private work ingested are "two different decisions
 * with two different grants". Sign-in asks for a grant that cannot read code
 * and keeps no token. This asks for the broader one, only from somebody already
 * signed in who asked for it, and keeps the token sealed so Kreds can ask
 * GitHub on their behalf later.
 *
 * Both routes are `GET`, and that is the same rule Law XXXV applies to evidence:
 * the grant arrives as a code GitHub hands back through the browser and Kreds
 * trades with GitHub itself. Nothing the browser sends is taken as the grant,
 * and nothing here accepts a claim about activity.
 */
@Controller("auth")
export class PrivateIngestionController {
  private readonly appUrl: string;

  constructor(
    private readonly oauth: GitHubOAuthService,
    private readonly sessions: SessionService,
    private readonly identities: IdentityRepository,
    config: ConfigService<Env, true>,
    // `null` when no `TOKEN_ENCRYPTION_KEY` is configured: that instance has no
    // delegated-query path, and so nothing to grant.
    @Optional() @Inject(Authorizations) private readonly authorizations: Authorizations | null,
  ) {
    this.appUrl = config.get("KREDS_APP_URL", { infer: true });
  }

  @Get("github/private-ingestion")
  start(@Req() request: Request, @Res() response: Response): void {
    // Checked before anyone is sent to GitHub. Asking a person to grant access
    // this instance cannot keep would waste their consent.
    this.requireStorage();
    this.requireSession(request);

    const state = this.sessions.issueState(response, "PRIVATE_INGESTION");
    response.redirect(this.oauth.authorizeUrl(state, "PRIVATE_INGESTION"));
  }

  /**
   * GitHub sends the person back here with a code for the broader grant.
   *
   * Only the signed-in user can grant for themselves: the token is asked who it
   * belongs to, and a token for any other GitHub account is refused and never
   * stored. Otherwise a code minted by one account, carried into somebody
   * else's session, would attach the wrong person's access to them.
   */
  @Get("callback/github/private-ingestion")
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ): Promise<void> {
    if (error) {
      response.redirect(`${this.appUrl}/?grant=cancelled`);
      return;
    }

    const cookies = request.cookies as Cookies;
    if (
      !this.sessions.consumeState(
        response,
        cookies?.[OAUTH_STATE_COOKIE],
        state,
        "PRIVATE_INGESTION",
      )
    ) {
      throw new BadRequestException("This authorization link is stale. Start again from Kreds.");
    }
    if (!code) throw new BadRequestException("GitHub did not return an authorization code.");

    const authorizations = this.requireStorage();
    // Read through to the database, as the session check does: an account that
    // no longer matches its cookie is not signed in.
    const session = await signedInUser(request, this.sessions, this.identities);

    const reach = await this.oauth.withGrantedToken(code, async (grant) => {
      if (grant.gitHubUserId !== session.gitHubUserId) {
        throw new ForbiddenException(
          "That GitHub account is not the one signed in to Kreds. Nothing was stored.",
        );
      }
      // A grant of nothing is not an authorization, and `Authorizations`
      // refuses to store one.
      if (grant.scopes.length === 0) return null;

      await authorizations.grant(grant.gitHubUserId, grant.token, grant.scopes);
      // From what GitHub granted, never from what was asked for.
      return reachOf(grant.scopes);
    });

    const outcome =
      reach === "INCLUDES_PRIVATE" ? "private" : reach === "PUBLIC_ONLY" ? "public-only" : "none";
    response.redirect(`${this.appUrl}/?grant=${outcome}`);
  }

  private requireStorage(): Authorizations {
    if (!this.authorizations) {
      throw new ServiceUnavailableException(
        "This Kreds instance has no TOKEN_ENCRYPTION_KEY configured, so it cannot store an authorization to read your work.",
      );
    }
    return this.authorizations;
  }

  private requireSession(request: Request): SessionPayload {
    const session = this.sessions.readSession((request.cookies as Cookies)?.[SESSION_COOKIE]);
    if (!session) {
      throw new UnauthorizedException("Sign in to Kreds before granting access to your work.");
    }
    return session;
  }
}
