import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import type { IdentityRepository } from "@kreds/database";
import { gitHubUserId } from "@kreds/domain";

import { SESSION_COOKIE, type SessionPayload, type SessionService } from "./session.service.js";

/**
 * The signed-in user, read through to the database, or 401.
 *
 * The cookie alone is not enough, for the same reason `/auth/session` does not
 * trust it: an account that no longer matches its cookie, or an identity that
 * was never claimed, is not somebody who may act on an authorization.
 */
export async function signedInUser(
  request: Request,
  sessions: SessionService,
  identities: IdentityRepository,
): Promise<SessionPayload> {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const session = sessions.readSession(cookies?.[SESSION_COOKIE]);
  if (!session) {
    throw new UnauthorizedException("Sign in to Kreds to manage access to your work.");
  }
  const account = await identities.findAccount(gitHubUserId(session.gitHubUserId));
  if (!account || account.user.id !== session.userId) {
    throw new UnauthorizedException("Sign in to Kreds to manage access to your work.");
  }
  return session;
}
