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

import { Authorizations, Consents, IdentityRepository, type ActiveConsent } from "@kreds/database";
import { ACTIVITY_CONSENT_KINDS, CLIENT_ROLES, INGESTION_MODES } from "@kreds/domain";

import { SessionService } from "../auth/session.service.js";
import { signedInUser } from "../auth/signed-in.js";
import { consentedReach, type IngestionReach } from "./scopes.js";

/** An active consent as the dashboard reads it. */
export interface ConsentStatus {
  /** The version of the text the person agreed to. */
  readonly version: string;
  /** ISO 8601. */
  readonly grantedAt: string;
}

/** What the owner's dashboard reads about their own grant. */
export interface AuthorizationStatus {
  readonly gitHubUserId: number;
  /** A live grant is stored. On its own, not permission to read anything. */
  readonly authorized: boolean;
  readonly delegatedQueryConfigured: boolean;
  /**
   * What Kreds actually reads: the grant's reach, bounded by consent. `null`
   * with no live grant or no public-activity consent, which is the state of
   * somebody who signed in before Kreds asked.
   */
  readonly reach: IngestionReach | null;
  /** ISO 8601, or `null` before Kreds has used the grant. */
  readonly lastPolledAt: string | null;
  readonly publicConsent: ConsentStatus | null;
  readonly privateConsent: ConsentStatus | null;
}

function consentStatus(consent: ActiveConsent | null): ConsentStatus | null {
  return consent ? { version: consent.version, grantedAt: consent.grantedAt.toISOString() } : null;
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
 * OAuth redirects (`/auth/github` for public activity at sign-in,
 * `/auth/github/private-ingestion` for private work), where the token comes back
 * from GitHub rather than from the browser, which is the same rule applied to
 * the grant itself.
 */
@Controller("access")
export class AuthorizationController {
  constructor(
    private readonly sessions: SessionService,
    private readonly identities: IdentityRepository,
    @Optional() @Inject(Authorizations) private readonly authorizations: Authorizations | null,
    private readonly consents: Consents,
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
   * Whether Kreds may currently look, how far, what the person agreed to, and
   * when it last looked.
   *
   * `reach` is read from the scopes GitHub granted, never from what Kreds asked
   * for, and bounded by the person's active consents: it is what the sweep
   * reads. `lastPolledAt` is the last request Kreds made with the grant. None
   * of it carries anything sealed.
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
    const active = await this.consents.activeOf(gitHubUserId);
    const kinds = ACTIVITY_CONSENT_KINDS.filter((kind) => active[kind] !== null);
    return {
      gitHubUserId,
      authorized: standing !== null,
      delegatedQueryConfigured: this.authorizations !== null,
      reach: standing ? consentedReach(standing.scopes, kinds) : null,
      lastPolledAt: standing?.lastPolledAt?.toISOString() ?? null,
      publicConsent: consentStatus(active.PUBLIC_ACTIVITY),
      privateConsent: consentStatus(active.PRIVATE_ACTIVITY),
    };
  }

  /**
   * Stop looking.
   *
   * 26 treats this as a fact about the present: "New activity simply stops being
   * observed." What it does not do is undo anything. "Recorded history is
   * unaffected. The ledger is immutable", and "Outstanding debt survives
   * revocation, exactly as it survives leaving an organization."
   *
   * The grant and every active consent go together: taking access back is
   * also withdrawing the agreement, and both are marked rather than deleted,
   * so the record of what was agreed and when survives.
   */
  @Delete("authorization/:gitHubUserId")
  async revoke(@Req() request: Request, @Param("gitHubUserId", ParseIntPipe) gitHubUserId: number) {
    await this.own(request, gitHubUserId);
    const at = new Date();
    const grantRevoked = this.authorizations
      ? await this.authorizations.revoke(gitHubUserId, at)
      : false;
    const consentsRevoked = await this.consents.revokeAll(gitHubUserId, at);
    return {
      gitHubUserId,
      revoked: grantRevoked || consentsRevoked > 0,
      consentsRevoked,
      historyRetained: true,
    };
  }
}
