import { and, desc, eq, isNull } from "drizzle-orm";

import {
  ACTIVITY_CONSENT_KINDS,
  publishedActivityConsent,
  type ActivityConsentKind,
} from "@kreds/domain";

import type { Database } from "../client.js";
import { activityConsents } from "../schema/index.js";

/**
 * What a person agreed to about their activity being read, kept as history.
 *
 * Law XXXVII and 26: "A connected contributor has consented everywhere they
 * act". Kreds keeps that consent as an explicit record with the version of the
 * words the person was shown, rather than inferring it from a token existing.
 *
 * Appending and revoking are the only writes. The table's trigger refuses
 * everything else, so this class could not rewrite a record even by mistake.
 */

export class UnpublishedConsentError extends Error {
  constructor(
    readonly kind: ActivityConsentKind,
    readonly version: string,
  ) {
    super(`"${version}" is not published ${kind} consent text, so nobody could have agreed to it.`);
    this.name = "UnpublishedConsentError";
  }
}

export interface ConsentRecordInput {
  readonly gitHubUserId: number;
  /** The Kreds account signed in when the person agreed. */
  readonly userId: string;
  readonly kind: ActivityConsentKind;
  /** The version of the text shown. Decided by the server, never the browser. */
  readonly version: string;
  readonly at: Date;
}

export interface ActiveConsent {
  readonly version: string;
  readonly grantedAt: Date;
}

/** The most recent active consent of each kind, or `null` for none. */
export type ActiveConsents = Readonly<Record<ActivityConsentKind, ActiveConsent | null>>;

export class Consents {
  constructor(private readonly db: Database) {}

  /**
   * Record that the person agreed, now, to this version's words.
   *
   * Always a new row: each agreement is its own act, and the earlier ones stay
   * as they were.
   *
   * @throws {UnpublishedConsentError} for a version that was never published
   * for this kind. Such a version was shown to nobody.
   */
  async record(input: ConsentRecordInput): Promise<void> {
    const terms = publishedActivityConsent(input.version);
    if (!terms || terms.kind !== input.kind) {
      throw new UnpublishedConsentError(input.kind, input.version);
    }
    await this.db.insert(activityConsents).values({
      gitHubUserId: input.gitHubUserId,
      userId: input.userId,
      kind: input.kind,
      version: input.version,
      grantedAt: input.at,
    });
  }

  /**
   * Mark every active consent of this person revoked.
   *
   * @returns how many were active. Earlier revocations keep their own dates.
   */
  async revokeAll(gitHubUserId: number, at: Date): Promise<number> {
    const revoked = await this.db
      .update(activityConsents)
      .set({ revokedAt: at })
      .where(
        and(eq(activityConsents.gitHubUserId, gitHubUserId), isNull(activityConsents.revokedAt)),
      )
      .returning({ id: activityConsents.id });
    return revoked.length;
  }

  async activeOf(gitHubUserId: number): Promise<ActiveConsents> {
    const rows = await this.db
      .select({
        kind: activityConsents.kind,
        version: activityConsents.version,
        grantedAt: activityConsents.grantedAt,
      })
      .from(activityConsents)
      .where(
        and(eq(activityConsents.gitHubUserId, gitHubUserId), isNull(activityConsents.revokedAt)),
      )
      .orderBy(desc(activityConsents.grantedAt));

    const active = Object.fromEntries(ACTIVITY_CONSENT_KINDS.map((kind) => [kind, null])) as Record<
      ActivityConsentKind,
      ActiveConsent | null
    >;
    for (const row of rows) {
      active[row.kind] ??= { version: row.version, grantedAt: row.grantedAt };
    }
    return active;
  }
}
