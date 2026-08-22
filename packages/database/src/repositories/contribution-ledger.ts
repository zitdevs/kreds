import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  gitHubUserId as toGitHubUserId,
  organizationId as toOrganizationId,
  points as toPoints,
  type ContributionKind,
  type ContributionScore,
  type GitHubUserId,
  type Points,
} from "@kreds/domain";

import type { Database } from "../client.js";
import { contributionEntries } from "../schema/index.js";

/** One of the triggers the published policy names. Nothing else may reduce a score. */
export type InvalidationTrigger =
  "PR_REVERTED" | "CONFIRMED_FRAUD" | "CONFIRMED_FARMING" | "ACTOR_RECLASSIFIED_NON_HUMAN";

export interface AwardInput {
  /** The identity of the fact. The same work recognised twice is one entry. */
  readonly idempotencyKey: string;
  readonly kind: ContributionKind;
  readonly gitHubUserId: GitHubUserId;
  readonly repositoryId?: string | null;
  readonly organizationId?: string | null;
  readonly points: number;
  readonly qualityScore: number;
  /** Signals Kreds could not evaluate. Recorded so a low score stays legible. */
  readonly unobservedSignals?: readonly string[];
  readonly rulesVersion: string;
  readonly occurredAt: Date;
  /**
   * Whether an independent human observed this work (A04, 24).
   *
   * Optional, and omitted means not evaluated. A caller that has not made the
   * judgement must not assert one either way: `false` here bounds somebody's
   * points, and `true` lifts a bound the amendment put there on purpose.
   */
  readonly observed?: boolean;
}

export interface AwardResult {
  readonly id: string;
  readonly idempotencyKey: string;
  /** False when this work had already been recognised. */
  readonly isNew: boolean;
}

export interface LeaderboardRow {
  readonly gitHubUserId: GitHubUserId;
  readonly points: Points;
}

/**
 * Recognition of verified work, as an append-only ledger.
 *
 * The score is derived, never stored, for the same reason balances are
 * (Law II): a stored total is a second source of truth that drifts, and the
 * first time it drifts nobody can tell which number is the lie.
 *
 * Nothing here can move points between people, spend them, or exchange them.
 * That is Law XXVI, and the way it is kept is by there being no such method to
 * call rather than by a guard inside one.
 */
export class ContributionLedger {
  constructor(private readonly db: Database) {}

  /**
   * Recognise work.
   *
   * Idempotent on the key, so a redelivered webhook or a backfill recognises
   * the same merge once. `onConflictDoNothing` rather than an upsert: the first
   * recognition is the true one, and letting a replay rewrite it would let a
   * later scoring bug quietly restate what someone earned.
   */
  async award(input: AwardInput): Promise<AwardResult> {
    if (input.points < 0) {
      throw new RangeError(`an award cannot be negative, received ${input.points}.`);
    }

    const [inserted] = await this.db
      .insert(contributionEntries)
      .values({
        idempotencyKey: input.idempotencyKey,
        entryType: "AWARD",
        kind: input.kind,
        gitHubUserId: input.gitHubUserId,
        repositoryId: input.repositoryId ?? null,
        organizationId: input.organizationId ?? null,
        points: input.points,
        qualityScore: input.qualityScore,
        unobservedSignals: input.unobservedSignals?.length
          ? input.unobservedSignals.join(",")
          : null,
        observed: input.observed ?? null,
        rulesVersion: input.rulesVersion,
        occurredAt: input.occurredAt,
      })
      .onConflictDoNothing({ target: contributionEntries.idempotencyKey })
      .returning();

    if (inserted) {
      return { id: inserted.id, idempotencyKey: inserted.idempotencyKey, isNew: true };
    }

    const [existing] = await this.db
      .select()
      .from(contributionEntries)
      .where(eq(contributionEntries.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!existing) {
      throw new Error(`award ${input.idempotencyKey} conflicted but could not be read back.`);
    }
    return { id: existing.id, idempotencyKey: existing.idempotencyKey, isNew: false };
  }

  /**
   * Take recognition back, by recording a compensating entry.
   *
   * 05: Reversals. The award row stays and a second row cancels it, so the
   * history of a caught farmer is a trail rather than a gap, and "why did this
   * score change" stays answerable.
   *
   * Note what cannot reach this method: spending KRED, carrying debt, going
   * underwater. Law XXVII makes points immune to economic events, and a trigger
   * is required to get here at all, so there is no economic path to a reduction.
   *
   * @returns `null` when the award is unknown or already cancelled. A repeated
   * revert is ordinary traffic, not an error, and must not subtract twice.
   */
  async invalidate(
    awardIdempotencyKey: string,
    trigger: InvalidationTrigger,
  ): Promise<AwardResult | null> {
    return this.db.transaction(async (tx) => {
      const [award] = await tx
        .select()
        .from(contributionEntries)
        .where(
          and(
            eq(contributionEntries.idempotencyKey, awardIdempotencyKey),
            eq(contributionEntries.entryType, "AWARD"),
          ),
        )
        .limit(1);
      if (!award) return null;

      // Derived from the award, so a repeated revert lands on the same key and
      // the unique constraint absorbs it.
      const key = `INVALIDATION:${awardIdempotencyKey}`;

      const [inserted] = await tx
        .insert(contributionEntries)
        .values({
          idempotencyKey: key,
          entryType: "INVALIDATION",
          kind: award.kind,
          gitHubUserId: award.gitHubUserId,
          repositoryId: award.repositoryId,
          organizationId: award.organizationId,
          points: award.points,
          qualityScore: award.qualityScore,
          trigger,
          cancelsEntryId: award.id,
          // The version in force when the award was made, not today's. The
          // entry has to cancel what was actually given.
          rulesVersion: award.rulesVersion,
          occurredAt: new Date(),
        })
        .onConflictDoNothing({ target: contributionEntries.idempotencyKey })
        .returning();

      if (!inserted) return null;
      return { id: inserted.id, idempotencyKey: inserted.idempotencyKey, isNew: true };
    });
  }

  /**
   * Someone's score in one scope.
   *
   * @param organizationId `null` for the global score, which is every entry
   * regardless of where the work happened. 24: an organization ranks
   * engineering contribution "independently of personal KRED wealth", so the
   * two scopes are genuinely different questions rather than a filter.
   */
  async scoreFor(
    gitHubUserId: GitHubUserId,
    organizationId: string | null = null,
  ): Promise<ContributionScore> {
    const scope = organizationId
      ? and(
          eq(contributionEntries.gitHubUserId, gitHubUserId),
          eq(contributionEntries.organizationId, organizationId),
        )
      : eq(contributionEntries.gitHubUserId, gitHubUserId);

    const [row] = await this.db
      .select({ total: this.netPoints() })
      .from(contributionEntries)
      .where(scope);

    return {
      gitHubUserId: toGitHubUserId(gitHubUserId),
      organizationId: organizationId ? toOrganizationId(organizationId) : null,
      points: toPoints(Number(row?.total ?? 0)),
    };
  }

  /**
   * The contribution leaderboard.
   *
   * 24: "The economy leaderboard tells you who is liquid. The contribution
   * leaderboard tells you who is doing the work." This is the second one, and
   * it never reads a balance.
   */
  async leaderboard(
    organizationId: string | null = null,
    limit = 25,
  ): Promise<readonly LeaderboardRow[]> {
    const scope = organizationId
      ? eq(contributionEntries.organizationId, organizationId)
      : undefined;

    const rows = await this.db
      .select({ gitHubUserId: contributionEntries.gitHubUserId, total: this.netPoints() })
      .from(contributionEntries)
      .where(scope)
      .groupBy(contributionEntries.gitHubUserId)
      .orderBy(sql`2 desc`)
      .limit(limit);

    return rows
      .map((row) => ({
        gitHubUserId: toGitHubUserId(row.gitHubUserId),
        points: toPoints(Math.max(0, Number(row.total ?? 0))),
      }))
      .filter((row) => row.points > 0);
  }

  /** Entries recorded for one repository, newest first. */
  async entriesForRepository(repositoryId: string, limit = 100) {
    return this.db
      .select()
      .from(contributionEntries)
      .where(
        and(
          eq(contributionEntries.repositoryId, repositoryId),
          isNull(contributionEntries.trigger),
        ),
      )
      .orderBy(sql`${contributionEntries.occurredAt} desc`)
      .limit(limit);
  }

  /**
   * Awards minus invalidations.
   *
   * The whole of the scoring rule, in one place, so no caller can compute a
   * score by summing the points column and quietly counting a cancelled award.
   */
  private netPoints() {
    return sql<number>`coalesce(sum(
      case when ${contributionEntries.entryType} = 'AWARD'
           then ${contributionEntries.points}
           else -${contributionEntries.points}
      end
    ), 0)`;
  }

  /**
   * Points this user has already been awarded in unobserved contexts.
   *
   * 24 caps points "earned in a context with no independent human observer",
   * which only means anything against a running total, so this is the query the
   * cap is applied on.
   *
   * Counts `observed = false` and nothing else. Rows where the column is null
   * predate the question, and counting them as unobserved would bound somebody
   * today for work nobody evaluated at the time.
   *
   * Invalidations are netted, not ignored: a cancelled award should stop
   * consuming an allowance, or a reverted PR would keep somebody capped for
   * work the economy has already withdrawn.
   */
  async unobservedPointsSince(gitHubUserId: number, since: Date): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<string>`coalesce(sum(case when ${contributionEntries.entryType} = 'AWARD'
          then ${contributionEntries.points} else -${contributionEntries.points} end), 0)::text`,
      })
      .from(contributionEntries)
      .where(
        and(
          eq(contributionEntries.gitHubUserId, gitHubUserId),
          eq(contributionEntries.observed, false),
          gte(contributionEntries.occurredAt, since),
        ),
      );

    const total = Number(row?.total ?? "0");
    return total > 0 ? total : 0;
  }
}
