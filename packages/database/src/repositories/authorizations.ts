import { and, eq, exists, isNull, sql } from "drizzle-orm";

import type { ActivityConsentKind } from "@kreds/domain";

import type { Database } from "../client.js";
import { activityConsents, delegatedAuthorizations } from "../schema/index.js";
import { TokenCipher, type SealedToken } from "../crypto/token-cipher.js";

/**
 * Delegated authorizations: stored, used server-side, and revoked immediately.
 *
 * 26: Kreds "asks the provider (server-side query with delegated
 * authorization)", and the sentence that governs everything in this file is the
 * one next to it:
 *
 * > "A user may grant access to their activity. A user may never report their
 * > activity."
 *
 * So this class hands a token to code that calls GitHub and to nothing else.
 * There is no method that returns a token to a caller who might serialise it,
 * no field that holds one between calls, and no logging anywhere in the file.
 */

export class AuthorizationRevokedError extends Error {
  constructor(readonly gitHubUserId: number) {
    super(`the authorization for user ${gitHubUserId} is no longer valid.`);
    this.name = "AuthorizationRevokedError";
  }
}

export class RateBudgetExhaustedError extends Error {
  constructor(
    readonly gitHubUserId: number,
    readonly retryAfterMs: number,
  ) {
    super(`user ${gitHubUserId} has spent this window's polling budget.`);
    this.name = "RateBudgetExhaustedError";
  }
}

/** How much provider traffic one user may cause, and over what window. */
export interface RateBudget {
  readonly requestsPerWindow: number;
  readonly windowMs: number;
}

export interface PollCandidate {
  readonly gitHubUserId: number;
  readonly scopes: readonly string[];
  /**
   * The kinds of reading this person has an active consent for. Always
   * includes `PUBLIC_ACTIVITY`: nobody without it is a candidate at all.
   * Whether the grant's private reach is covered is the caller's to decide,
   * from these.
   */
  readonly consents: readonly ActivityConsentKind[];
}

export interface GrantOptions {
  /**
   * Leave a live grant alone when the new scopes do not cover it.
   *
   * For the sign-in grant: somebody who already granted private access and
   * signs in again must keep it, rather than having the narrower sign-in token
   * replace it. A revoked grant is always replaced.
   */
  readonly keepBroader?: boolean;
}

export class Authorizations {
  constructor(
    private readonly db: Database,
    private readonly cipher: TokenCipher,
  ) {}

  /**
   * Record a user's authorization.
   *
   * The token is sealed before it reaches the query, so the plaintext never
   * appears in a parameter list, which is where a slow-query log would find it.
   *
   * @param scopes what the user actually granted. Recorded so an operator can
   * see what Kreds may reach without decrypting anything.
   */
  async grant(
    gitHubUserId: number,
    token: string,
    scopes: readonly string[],
    options: GrantOptions = {},
  ): Promise<void> {
    if (scopes.length === 0) {
      throw new RangeError("an authorization with no scopes grants nothing and should not exist.");
    }
    const sealed = this.cipher.seal(token);
    await this.db
      .insert(delegatedAuthorizations)
      .values({
        gitHubUserId,
        sealedToken: sealed.ciphertext,
        tokenNonce: sealed.nonce,
        tokenTag: sealed.tag,
        scopes: [...scopes],
      })
      .onConflictDoUpdate({
        target: delegatedAuthorizations.gitHubUserId,
        set: {
          sealedToken: sealed.ciphertext,
          tokenNonce: sealed.nonce,
          tokenTag: sealed.tag,
          scopes: [...scopes],
          revokedAt: null,
          // Re-granting after a revocation is a new grant, so the budget starts
          // fresh. Re-granting a live one is not: signing in again must not be
          // a way to buy another window of provider traffic.
          pollBudgetSpent: sql`case when ${delegatedAuthorizations.revokedAt} is null
            then ${delegatedAuthorizations.pollBudgetSpent} else 0 end`,
          pollWindowStartedAt: sql`case when ${delegatedAuthorizations.revokedAt} is null
            then ${delegatedAuthorizations.pollWindowStartedAt} else null end`,
        },
        // Decided in the statement rather than read first, so a private grant
        // landing between a read and a write cannot be overwritten by the
        // narrower sign-in token.
        ...(options.keepBroader
          ? {
              setWhere: sql`${delegatedAuthorizations.revokedAt} is not null
                or excluded.scopes @> ${delegatedAuthorizations.scopes}`,
            }
          : {}),
      });
  }

  /**
   * Stop using this authorization, now.
   *
   * 26 treats revocation as a fact about the present rather than a scheduling
   * hint: "New activity simply stops being observed." The row is marked rather
   * than deleted, because it is also the record that access once existed, and
   * "Recorded history is unaffected. The ledger is immutable."
   */
  async revoke(gitHubUserId: number, at: Date): Promise<boolean> {
    const revoked = await this.db
      .update(delegatedAuthorizations)
      .set({ revokedAt: at })
      .where(
        and(
          eq(delegatedAuthorizations.gitHubUserId, gitHubUserId),
          isNull(delegatedAuthorizations.revokedAt),
        ),
      )
      .returning({ id: delegatedAuthorizations.id });
    return revoked.length > 0;
  }

  /**
   * Run something with the user's token, re-checking authorization first.
   *
   * The check is inside this method rather than at the top of a caller's loop,
   * which is the whole point: a poll over a hundred repositories must not finish
   * with a token revoked after the tenth. Every use re-reads the row, so a
   * revocation lands between requests instead of after the batch.
   *
   * The token reaches `use` and goes out of scope when it returns. It is never
   * returned to this method's caller.
   *
   * @throws {AuthorizationRevokedError} when there is no live authorization.
   */
  async withToken<T>(gitHubUserId: number, use: (token: string) => Promise<T>): Promise<T> {
    const [row] = await this.db
      .select({
        sealedToken: delegatedAuthorizations.sealedToken,
        tokenNonce: delegatedAuthorizations.tokenNonce,
        tokenTag: delegatedAuthorizations.tokenTag,
      })
      .from(delegatedAuthorizations)
      .where(
        and(
          eq(delegatedAuthorizations.gitHubUserId, gitHubUserId),
          isNull(delegatedAuthorizations.revokedAt),
        ),
      )
      .limit(1);

    if (!row) throw new AuthorizationRevokedError(gitHubUserId);

    const sealed: SealedToken = {
      ciphertext: row.sealedToken,
      nonce: row.tokenNonce,
      tag: row.tokenTag,
    };
    return use(this.cipher.open(sealed));
  }

  /**
   * Spend one request from this user's budget.
   *
   * 26 does not set a number, and neither does this: the budget arrives as an
   * argument. What it enforces is the shape, which A04 made necessary. Under org
   * webhooks GitHub decided how much traffic arrived; under delegated query
   * Kreds decides, and one user with several thousand repositories would
   * otherwise consume the whole provider allowance and starve everybody else.
   *
   * The window rolls per user rather than globally, so a heavy account slows
   * only itself.
   *
   * @throws {RateBudgetExhaustedError} when this window is spent.
   */
  async spendBudget(gitHubUserId: number, budget: RateBudget, now: Date): Promise<number> {
    if (budget.requestsPerWindow <= 0 || budget.windowMs <= 0) {
      throw new RangeError("a rate budget of zero would stop ingestion rather than pace it.");
    }
    const windowStart = new Date(now.getTime() - budget.windowMs);

    const [updated] = await this.db
      .update(delegatedAuthorizations)
      .set({
        // A window that started before the cutoff has expired, so the count
        // restarts at one rather than accumulating forever.
        pollBudgetSpent: sql`case
          when ${delegatedAuthorizations.pollWindowStartedAt} is null
            or ${delegatedAuthorizations.pollWindowStartedAt} < ${windowStart.toISOString()}
          then 1
          else ${delegatedAuthorizations.pollBudgetSpent} + 1 end`,
        pollWindowStartedAt: sql`case
          when ${delegatedAuthorizations.pollWindowStartedAt} is null
            or ${delegatedAuthorizations.pollWindowStartedAt} < ${windowStart.toISOString()}
          then ${now.toISOString()}::timestamptz
          else ${delegatedAuthorizations.pollWindowStartedAt} end`,
        lastPolledAt: now,
      })
      .where(
        and(
          eq(delegatedAuthorizations.gitHubUserId, gitHubUserId),
          isNull(delegatedAuthorizations.revokedAt),
          // The budget check is in the WHERE clause, so two concurrent pollers
          // cannot both read "one left" and both spend it.
          sql`(${delegatedAuthorizations.pollWindowStartedAt} is null
               or ${delegatedAuthorizations.pollWindowStartedAt} < ${windowStart.toISOString()}
               or ${delegatedAuthorizations.pollBudgetSpent} < ${budget.requestsPerWindow})`,
        ),
      )
      .returning({
        spent: delegatedAuthorizations.pollBudgetSpent,
        windowStartedAt: delegatedAuthorizations.pollWindowStartedAt,
      });

    if (!updated) {
      const live = await this.isAuthorized(gitHubUserId);
      if (!live) throw new AuthorizationRevokedError(gitHubUserId);
      throw new RateBudgetExhaustedError(gitHubUserId, budget.windowMs);
    }
    return updated.spent;
  }

  async isAuthorized(gitHubUserId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: delegatedAuthorizations.id })
      .from(delegatedAuthorizations)
      .where(
        and(
          eq(delegatedAuthorizations.gitHubUserId, gitHubUserId),
          isNull(delegatedAuthorizations.revokedAt),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * What a live authorization grants, and when Kreds last used it.
   *
   * For the owner's own view of their grant. Scopes and a timestamp, nothing
   * sealed: no token, nonce or tag leaves through here. `null` when there is
   * no live authorization, revoked or never granted alike.
   *
   * `lastPolledAt` is the last request Kreds made with it, which is the honest
   * meaning of "last looked": a poll is many requests.
   */
  async standingOf(
    gitHubUserId: number,
  ): Promise<{ scopes: readonly string[]; lastPolledAt: Date | null } | null> {
    const [row] = await this.db
      .select({
        scopes: delegatedAuthorizations.scopes,
        lastPolledAt: delegatedAuthorizations.lastPolledAt,
      })
      .from(delegatedAuthorizations)
      .where(
        and(
          eq(delegatedAuthorizations.gitHubUserId, gitHubUserId),
          isNull(delegatedAuthorizations.revokedAt),
        ),
      )
      .limit(1);
    return row ? { scopes: row.scopes, lastPolledAt: row.lastPolledAt } : null;
  }

  /**
   * Who to poll next, least recently polled first.
   *
   * Only people with a live grant **and** an active consent to have their
   * public activity read. A token on its own is not consent: somebody who
   * signed in before Kreds asked has neither agreed nor been asked, and is not
   * polled until they do.
   *
   * Fair rather than fast: a user Kreds has never polled sorts ahead of one it
   * polled a minute ago, so a new authorization is not stuck behind a busy one.
   *
   * Returns no tokens. A caller gets identities and asks for each token through
   * `withToken`, which re-checks revocation at the moment of use.
   */
  async dueForPolling(limit: number): Promise<PollCandidate[]> {
    const activeConsent = (kind: ActivityConsentKind) =>
      this.db
        .select({ id: activityConsents.id })
        .from(activityConsents)
        .where(
          and(
            eq(activityConsents.gitHubUserId, delegatedAuthorizations.gitHubUserId),
            eq(activityConsents.kind, kind),
            isNull(activityConsents.revokedAt),
          ),
        );

    const rows = await this.db
      .select({
        gitHubUserId: delegatedAuthorizations.gitHubUserId,
        scopes: delegatedAuthorizations.scopes,
        privateConsent: exists(activeConsent("PRIVATE_ACTIVITY")).mapWith(Boolean),
      })
      .from(delegatedAuthorizations)
      .where(
        and(isNull(delegatedAuthorizations.revokedAt), exists(activeConsent("PUBLIC_ACTIVITY"))),
      )
      // `asc` defaults to NULLS LAST in Postgres, which would sort a
      // never-polled authorization behind every polled one and leave a new
      // grant waiting on a busy account.
      .orderBy(sql`${delegatedAuthorizations.lastPolledAt} asc nulls first`)
      .limit(limit);
    return rows.map((row) => ({
      gitHubUserId: row.gitHubUserId,
      scopes: row.scopes,
      consents: row.privateConsent ? ["PUBLIC_ACTIVITY", "PRIVATE_ACTIVITY"] : ["PUBLIC_ACTIVITY"],
    }));
  }
}
