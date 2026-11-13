import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Optional,
  Param,
  ParseIntPipe,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { Authorizations, IdentityRepository } from "@kreds/database";
import { CLIENT_ROLES, INGESTION_MODES } from "@kreds/domain";

import { SessionService } from "../auth/session.service.js";
import { signedInUser } from "../auth/signed-in.js";
import { reachOf, type IngestionReach } from "./scopes.js";

/** What the owner's dashboard reads about their own grant. */
export interface AuthorizationStatus {
  readonly gitHubUserId: number;
  readonly authorized: boolean;
  readonly delegatedQueryConfigured: boolean;
  readonly reach: IngestionReach | null;
  /** ISO 8601, or `null` before Kreds has used the grant. */
  readonly lastPolledAt: string | null;
}

/**
 * A user's control over their own authorization.
 *
 * Two routes, and the shape of them is the point. One reads whether Kreds may
 * currently look at this user's activity; the other takes that permission away.
 * Neither carries anything about what happened.
 *
 * Law XXXV, and 26 in one line:
 *
 * > "A user may grant access to their activity. A user may never report their
 * > activity."
 *
 * The `DELETE` here is the only write in the module, and what it writes is a
 * revocation. There is deliberately no `POST`: granting happens through GitHub's
 * OAuth redirect (`/auth/github/private-ingestion`), where the token comes back
 * from GitHub rather than from the browser, which is the same rule applied to
 * the grant itself.
 */
@Controller("access")
export class AuthorizationController {
  constructor(
    private readonly sessions: SessionService,
    private readonly identities: IdentityRepository,
    @Optional() @Inject(Authorizations) private readonly authorizations: Authorizations | null,
  ) {}

  /**
   * The signed-in user, if the path names them, and nobody else.
   *
   * "A user's control over their own authorization." Revoking somebody else's
   * would let anyone switch off anyone's delegated query, and reading it would
   * tell anyone who has opted in. 401 with no session, 403 for another id.
   */
  private async own(request: Request, gitHubUserId: number): Promise<void> {
    const session = await signedInUser(request, this.sessions, this.identities);
    if (session.gitHubUserId !== gitHubUserId) {
      throw new ForbiddenException("You can only manage your own authorization.");
    }
  }

  /**
   * What this instance will accept as evidence.
   *
   * Public, and worth publishing: an integrator who reads this knows there is no
   * endpoint to submit to before they go looking for one.
   */
  @Get("ingestion")
  ingestion() {
    return {
      modes: INGESTION_MODES,
      clientRoles: CLIENT_ROLES,
      clientOriginatedEvidenceAccepted: false,
    };
  }

  /**
   * Whether Kreds may currently look, how far, and when it last did.
   *
   * `reach` is read from the scopes GitHub granted, never from what Kreds asked
   * for, and is `null` when there is no live grant. `lastPolledAt` is the last
   * request Kreds made with the grant. Neither carries anything sealed.
   */
  @Get("status/:gitHubUserId")
  async status(
    @Req() request: Request,
    @Param("gitHubUserId", ParseIntPipe) gitHubUserId: number,
  ): Promise<AuthorizationStatus> {
    await this.own(request, gitHubUserId);
    const standing = this.authorizations
      ? await this.authorizations.standingOf(gitHubUserId)
      : null;
    return {
      gitHubUserId,
      authorized: standing !== null,
      delegatedQueryConfigured: this.authorizations !== null,
      reach: standing ? reachOf(standing.scopes) : null,
      lastPolledAt: standing?.lastPolledAt?.toISOString() ?? null,
    };
  }

  /**
   * Stop looking.
   *
   * 26 treats this as a fact about the present: "New activity simply stops being
   * observed." What it does not do is undo anything. "Recorded history is
   * unaffected. The ledger is immutable", and "Outstanding debt survives
   * revocation, exactly as it survives leaving an organization."
   */
  @Delete("authorization/:gitHubUserId")
  async revoke(@Req() request: Request, @Param("gitHubUserId", ParseIntPipe) gitHubUserId: number) {
    await this.own(request, gitHubUserId);
    if (!this.authorizations) return { gitHubUserId, revoked: false };
    return {
      gitHubUserId,
      revoked: await this.authorizations.revoke(gitHubUserId, new Date()),
      historyRetained: true,
    };
  }
}
