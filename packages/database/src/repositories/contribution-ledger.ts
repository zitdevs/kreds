import { and, desc, eq, exists, gte, isNull, lt, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
import { contributionEntries, domainEvents, repositories } from "../schema/index.js";

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

/** Every kind the ledger records, so a summary always names all of them. */
const CONTRIBUTION_KINDS = [
  "PULL_REQUEST_MERGED",
  "CODE_REVIEW",
  "ISSUE_RESOLVED",
  "REVIEW_FOLLOW_UP",
] as const satisfies readonly ContributionKind[];

/** Where a page of entries ended, so the next page starts strictly after it. */
export interface EntryCursor {
  readonly occurredAt: Date;
  readonly id: string;
}

/**
 * One award, as its owner may see it.
 *
 * Deliberately narrower than the row. `qualityScore` and `unobservedSignals`
 * stay behind: they describe how scoring works rather than what was done, and
 * nothing here says what an allowance is or how much of it is left, because 24
 * keeps caps unpublished.
 */
export interface OwnEntry {
  readonly id: string;
  readonly kind: ContributionKind;
  readonly points: number;
  /** `null` when the question was never asked: rows from before A04. */
  readonly observed: boolean | null;
  readonly occurredAt: Date;
  readonly rulesVersion: string;
  /** Whether an invalidation cancels this award. The award itself stays (05). */
  readonly invalidated: boolean;
  readonly repository: { readonly nameWithOwner: string; readonly isPrivate: boolean } | null;
  /** What Kreds already stored about the work, enough to link to it. */
  readonly source: {
    readonly pullRequestNumber: number | null;
    readonly reviewId: number | null;
  };
}

export interface OwnSummary {
  /** The same number `scoreFor` gives, because it is the same query. */
  readonly points: Points;
  /** Dense, as the leaderboard ranks. `null` without standing points. */
  readonly rank: number | null;
  /** Awards still standing, per kind. */
  readonly byKind: Readonly<Record<ContributionKind, number>>;
}

export interface LeaderboardRow {
  /** Dense and over the whole board, so a later page does not restart at one. */
  readonly rank: number;
  readonly gitHubUserId: GitHubUserId;
  readonly points: Points;
}

/**
 * Where a leaderboard page ended: the last row's total and id. The board is
 * ordered by total, highest first, then by id, so this names one position.
 */
export interface LeaderboardCursor {
  readonly points: number;
  readonly gitHubUserId: number;
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
    organizationId: string | null,
    page: { readonly limit: number; readonly after?: LeaderboardCursor },
  ): Promise<{ entries: readonly LeaderboardRow[]; next: LeaderboardCursor | null }> {
    const scope = organizationId
      ? eq(contributionEntries.organizationId, organizationId)
      : undefined;

    const totals = this.db
      .select({
        gitHubUserId: contributionEntries.gitHubUserId,
        total: this.netPoints().as("total"),
      })
      .from(contributionEntries)
      .where(scope)
      .groupBy(contributionEntries.gitHubUserId)
      .as("totals");

    // Ranked before the page is cut, so the rank is against everybody. Nobody
    // at zero or below is listed, so nobody there takes up a rank either.
    const ranked = this.db
      .select({
        gitHubUserId: totals.gitHubUserId,
        total: totals.total,
        rank: sql<string>`dense_rank() over (order by ${totals.total} desc)`.as("rank"),
      })
      .from(totals)
      .where(sql`${totals.total} > 0`)
      .as("ranked");

    const after = page.after;
    const rows = await this.db
      .select({ gitHubUserId: ranked.gitHubUserId, total: ranked.total, rank: ranked.rank })
      .from(ranked)
      .where(
        after
          ? sql`(${ranked.total} < ${after.points} or (${ranked.total} = ${after.points} and ${ranked.gitHubUserId} > ${after.gitHubUserId}))`
          : undefined,
      )
      // The id is a tiebreak for paging only. Equal totals share a rank.
      .orderBy(sql`${ranked.total} desc`, ranked.gitHubUserId)
      .limit(page.limit + 1);

    const entries = rows.slice(0, page.limit).map((row): LeaderboardRow => ({
      rank: Number(row.rank),
      gitHubUserId: toGitHubUserId(Number(row.gitHubUserId)),
      points: toPoints(Number(row.total)),
    }));

    const last = entries.at(-1);
    return {
      entries,
      next:
        rows.length > page.limit && last
          ? { points: last.points, gitHubUserId: last.gitHubUserId }
          : null,
    };
  }

  /**
   * One user's own awards, newest first, a page at a time.
   *
   * Filtered on the user in the query, not by whoever calls it, so a caller
   * cannot widen it into somebody else's history. Invalidations are not listed
   * as rows of their own: the award they cancel is listed and marked, so a
   * reverted merge reads as reverted rather than vanishing (05: Reversals).
   *
   * Ordered by when the work happened, with the id as a tiebreak so a cursor
   * neither repeats nor skips two entries on the same instant.
   */
  async entriesFor(
    gitHubUserId: GitHubUserId,
    page: { readonly limit: number; readonly before?: EntryCursor },
  ): Promise<{ entries: readonly OwnEntry[]; next: EntryCursor | null }> {
    const invalidation = alias(contributionEntries, "invalidation");
    const rows = await this.db
      .select({
        id: contributionEntries.id,
        idempotencyKey: contributionEntries.idempotencyKey,
        kind: contributionEntries.kind,
        points: contributionEntries.points,
        observed: contributionEntries.observed,
        occurredAt: contributionEntries.occurredAt,
        rulesVersion: contributionEntries.rulesVersion,
        invalidated: exists(
          this.db
            .select({ id: invalidation.id })
            .from(invalidation)
            .where(eq(invalidation.cancelsEntryId, contributionEntries.id)),
        ),
        nameWithOwner: repositories.nameWithOwner,
        isPrivate: repositories.isPrivate,
        pullRequestNumber: sql<string | null>`${domainEvents.data}->>'pullRequestNumber'`,
      })
      .from(contributionEntries)
      .leftJoin(repositories, eq(repositories.id, contributionEntries.repositoryId))
      // An award's key is its fact's key, so the fact is found without asking
      // GitHub anything.
      .leftJoin(domainEvents, eq(domainEvents.idempotencyKey, contributionEntries.idempotencyKey))
      .where(
        and(
          eq(contributionEntries.gitHubUserId, gitHubUserId),
          eq(contributionEntries.entryType, "AWARD"),
          page.before
            ? sql`(${contributionEntries.occurredAt}, ${contributionEntries.id}) < (${page.before.occurredAt.toISOString()}::timestamptz, ${page.before.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(contributionEntries.occurredAt), desc(contributionEntries.id))
      .limit(page.limit + 1);

    const entries = rows.slice(0, page.limit).map((row): OwnEntry => {
      const pullRequestNumber = Number(row.pullRequestNumber);
      const reviewId = /^REVIEW_SUBMITTED:(\d+)$/.exec(row.idempotencyKey)?.[1];
      return {
        id: row.id,
        kind: row.kind,
        points: row.points,
        observed: row.observed,
        occurredAt: row.occurredAt,
        rulesVersion: row.rulesVersion,
        invalidated: Boolean(row.invalidated),
        repository:
          row.nameWithOwner === null || row.isPrivate === null
            ? null
            : { nameWithOwner: row.nameWithOwner, isPrivate: row.isPrivate },
        source: {
          pullRequestNumber:
            row.pullRequestNumber !== null && Number.isSafeInteger(pullRequestNumber)
              ? pullRequestNumber
              : null,
          reviewId: reviewId ? Number(reviewId) : null,
        },
      };
    });

    const last = entries.at(-1);
    return {
      entries,
      next: rows.length > page.limit && last ? { occurredAt: last.occurredAt, id: last.id } : null,
    };
  }

  /**
   * What a user's own dashboard header shows: the score, where it ranks, and
   * how much standing work of each kind it is made of.
   *
   * The total is `netPoints`, the same rule `scoreFor` uses. The rank is the
   * leaderboard's dense rank, one more than the number of distinct higher
   * totals, and `null` at zero or below because the leaderboard lists nobody
   * there.
   */
  async summaryFor(gitHubUserId: GitHubUserId): Promise<OwnSummary> {
    const { points } = await this.scoreFor(gitHubUserId);

    let rank: number | null = null;
    if (points > 0) {
      const totals = this.db
        .select({
          gitHubUserId: contributionEntries.gitHubUserId,
          total: this.netPoints().as("total"),
        })
        .from(contributionEntries)
        .groupBy(contributionEntries.gitHubUserId)
        .as("totals");
      const [row] = await this.db
        .select({ above: sql<string>`count(distinct ${totals.total})::text` })
        .from(totals)
        .where(sql`${totals.total} > ${points}`);
      rank = Number(row?.above ?? "0") + 1;
    }

    const invalidation = alias(contributionEntries, "invalidation");
    const counted = await this.db
      .select({ kind: contributionEntries.kind, count: sql<string>`count(*)::text` })
      .from(contributionEntries)
      .where(
        and(
          eq(contributionEntries.gitHubUserId, gitHubUserId),
          eq(contributionEntries.entryType, "AWARD"),
          notExists(
            this.db
              .select({ id: invalidation.id })
              .from(invalidation)
              .where(eq(invalidation.cancelsEntryId, contributionEntries.id)),
          ),
        ),
      )
      .groupBy(contributionEntries.kind);

    const byKind = Object.fromEntries(CONTRIBUTION_KINDS.map((kind) => [kind, 0])) as Record<
      ContributionKind,
      number
    >;
    for (const row of counted) byKind[row.kind] = Number(row.count);

    return { points, rank, byKind };
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
   * An award stops counting once it is invalidated. The cancellation is matched
   * by the award it cancels rather than read off the invalidation row: that row
   * carries no `observed`, and it is stamped with when the revert landed rather
   * than when the work happened, so it would net against the wrong window even
   * if it did. Without this a reverted PR keeps somebody capped for work the
   * economy has already withdrawn.
   *
   * The window is half-open, `[since, until)`. Backfill evaluates older work
   * after newer work is already recorded, and an open-ended window would let a
   * later day spend an earlier day's allowance.
   */
  async unobservedPointsBetween(gitHubUserId: number, since: Date, until: Date): Promise<number> {
    const invalidation = alias(contributionEntries, "invalidation");
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${contributionEntries.points}), 0)::text` })
      .from(contributionEntries)
      .where(
        and(
          eq(contributionEntries.gitHubUserId, gitHubUserId),
          eq(contributionEntries.entryType, "AWARD"),
          eq(contributionEntries.observed, false),
          gte(contributionEntries.occurredAt, since),
          lt(contributionEntries.occurredAt, until),
          notExists(
            this.db
              .select({ id: invalidation.id })
              .from(invalidation)
              .where(eq(invalidation.cancelsEntryId, contributionEntries.id)),
          ),
        ),
      );

    return Number(row?.total ?? "0");
  }
}
