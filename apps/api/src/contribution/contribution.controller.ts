import { BadRequestException, Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import {
  ContributionLedger,
  IdentityRepository,
  type EntryCursor,
  type OwnEntry,
} from "@kreds/database";
import { gitHubUserId, type ContributionKind } from "@kreds/domain";

import { SessionService } from "../auth/session.service.js";
import { signedInUser } from "../auth/signed-in.js";

/** One page, unless the caller asks for fewer. A page size, not a threshold. */
const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

/** `owner/name` as GitHub spells it. Anything else is not linked. */
const NAME_WITH_OWNER = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One of the signed-in user's own awards, as the dashboard receives it. */
export interface MyEntry {
  readonly id: string;
  readonly kind: ContributionKind;
  readonly points: number;
  /** Whether an independent human observed the work. `null`: never evaluated. */
  readonly observed: boolean | null;
  /** ISO 8601, when the work happened on GitHub. */
  readonly occurredAt: string;
  readonly rulesVersion: string;
  /** An invalidation cancels this award. It is still listed, and no longer counts. */
  readonly invalidated: boolean;
  readonly repository: { readonly nameWithOwner: string; readonly isPrivate: boolean } | null;
  /** The pull request or review on GitHub, when Kreds stored enough to name it. */
  readonly url: string | null;
}

export interface MyEntriesResponse {
  readonly gitHubUserId: number;
  readonly entries: readonly MyEntry[];
  /** Pass back as `cursor` for the next page. `null` on the last page. */
  readonly nextCursor: string | null;
}

export interface MySummaryResponse {
  readonly gitHubUserId: number;
  readonly points: number;
  readonly rank: number | null;
  readonly byKind: Readonly<Record<ContributionKind, number>>;
}

interface ScoreResponse {
  readonly gitHubUserId: number;
  readonly login: string | null;
  readonly points: number;
  readonly scope: "GLOBAL" | "ORGANIZATION";
}

interface LeaderboardEntry {
  readonly rank: number;
  readonly gitHubUserId: number;
  readonly login: string | null;
  readonly points: number;
}

/**
 * The contribution surface: what people have done, never what they are owed.
 *
 * 24: "The economy leaderboard tells you who is liquid. The contribution
 * leaderboard tells you who is doing the work." This serves the second one, and
 * there is deliberately no balance, no KRED and no net position anywhere in it.
 * Law XXVI keeps the systems independent, and an endpoint that returned both
 * would be the first place someone tried to relate them.
 */
@Controller("contributions")
export class ContributionController {
  constructor(
    private readonly ledger: ContributionLedger,
    private readonly identities: IdentityRepository,
    private readonly sessions: SessionService,
  ) {}

  /**
   * The signed-in user's own recent contributions, newest first.
   *
   * Session-bound, and the session is the only thing that says whose: there is
   * no parameter naming a user, so there is nothing to change to read somebody
   * else's. That is also what lets a private repository's name appear here,
   * to the one person whose work it holds.
   *
   * Recognition only. Points are not currency (Law XXVI), so nothing here is a
   * balance, and `observed` is the most this says about the unobserved cap,
   * which 24 keeps unpublished.
   */
  @Get("me")
  async mine(
    @Req() request: Request,
    @Query("cursor") cursor?: string,
    @Query("limit") rawLimit?: string,
  ): Promise<MyEntriesResponse> {
    const session = await signedInUser(request, this.sessions, this.identities);
    const limit = this.pageSize(rawLimit);
    const before = cursor === undefined ? undefined : this.openCursor(cursor);

    const page = await this.ledger.entriesFor(gitHubUserId(session.gitHubUserId), {
      limit,
      ...(before ? { before } : {}),
    });

    return {
      gitHubUserId: session.gitHubUserId,
      entries: page.entries.map(toMyEntry),
      nextCursor: page.next ? sealCursor(page.next) : null,
    };
  }

  /**
   * What the dashboard header needs: the score, its rank, and what it is made of.
   *
   * `points` is the number `score/:gitHubUserId` gives, from the same rule.
   */
  @Get("me/summary")
  async mySummary(@Req() request: Request): Promise<MySummaryResponse> {
    const session = await signedInUser(request, this.sessions, this.identities);
    const summary = await this.ledger.summaryFor(gitHubUserId(session.gitHubUserId));
    return {
      gitHubUserId: session.gitHubUserId,
      points: summary.points,
      rank: summary.rank,
      byKind: summary.byKind,
    };
  }

  private pageSize(raw: string | undefined): number {
    if (raw === undefined) return DEFAULT_PAGE;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) {
      throw new BadRequestException(`limit is a whole number from 1 to ${MAX_PAGE}.`);
    }
    return parsed;
  }

  /** A cursor this API issued, or 400. Opaque to callers; its shape is not the contract. */
  private openCursor(raw: string): EntryCursor {
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
        t?: unknown;
        i?: unknown;
      };
      const occurredAt = typeof parsed.t === "string" ? new Date(parsed.t) : null;
      if (
        occurredAt &&
        !Number.isNaN(occurredAt.getTime()) &&
        typeof parsed.i === "string" &&
        UUID.test(parsed.i)
      ) {
        return { occurredAt, id: parsed.i };
      }
    } catch {
      // Falls through to the same refusal as a well-formed but foreign cursor.
    }
    throw new BadRequestException(
      "That cursor is not one this API issued. Start from the first page.",
    );
  }

  /**
   * One person's score.
   *
   * Public, and that is deliberate rather than an oversight: a contribution
   * score is a record of work done in the open, and it carries no balance, no
   * debt and nothing that would let a reader infer one.
   */
  @Get("score/:gitHubUserId")
  async score(
    @Param("gitHubUserId") rawId: string,
    @Query("organizationId") organizationId?: string,
  ): Promise<ScoreResponse> {
    const id = this.parse(rawId);
    const [score, identity] = await Promise.all([
      this.ledger.scoreFor(id, organizationId ?? null),
      this.identities.findByGitHubUserId(id),
    ]);

    return {
      gitHubUserId: id,
      // Display only, and it may be absent: 24 lets an unclaimed identity earn,
      // and one Kreds has never seen act still has a score of zero rather than
      // an error.
      login: identity?.login ?? null,
      points: score.points,
      scope: organizationId ? "ORGANIZATION" : "GLOBAL",
    };
  }

  /**
   * The leaderboard, global or scoped to one organization.
   *
   * Ranks are dense and start at one. Two people on the same score share a
   * rank, because splitting them would need a tiebreak that no rule provides
   * and every available tiebreak is a proxy for volume.
   */
  @Get("leaderboard")
  async leaderboard(
    @Query("organizationId") organizationId?: string,
    @Query("limit") rawLimit?: string,
  ): Promise<{ scope: string; entries: readonly LeaderboardEntry[] }> {
    const limit = Math.min(Math.max(Number(rawLimit ?? 25) || 25, 1), 100);
    const rows = await this.ledger.leaderboard(organizationId ?? null, limit);

    const logins = await Promise.all(
      rows.map((row) => this.identities.findByGitHubUserId(row.gitHubUserId)),
    );

    let rank = 0;
    let previousPoints: number | null = null;
    const entries = rows.map((row, index) => {
      if (previousPoints === null || row.points !== previousPoints) rank = rank + 1;
      previousPoints = row.points;
      return {
        rank,
        gitHubUserId: row.gitHubUserId,
        login: logins[index]?.login ?? null,
        points: row.points,
      };
    });

    return { scope: organizationId ? "ORGANIZATION" : "GLOBAL", entries };
  }

  private parse(raw: string): ReturnType<typeof gitHubUserId> {
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new BadRequestException("A GitHub user id is a positive integer.");
    }
    return gitHubUserId(parsed);
  }
}

function sealCursor(cursor: EntryCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.occurredAt.toISOString(), i: cursor.id }),
    "utf8",
  ).toString("base64url");
}

/**
 * Only the contract's fields, named one by one, so a column added to the row
 * later cannot reach the dashboard by accident.
 */
function toMyEntry(entry: OwnEntry): MyEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    points: entry.points,
    observed: entry.observed,
    occurredAt: entry.occurredAt.toISOString(),
    rulesVersion: entry.rulesVersion,
    invalidated: entry.invalidated,
    repository: entry.repository
      ? { nameWithOwner: entry.repository.nameWithOwner, isPrivate: entry.repository.isPrivate }
      : null,
    url: gitHubUrlOf(entry),
  };
}

/**
 * The work on GitHub, from what Kreds already stored: the repository's name and
 * the fact's pull request number, plus the review id its key carries. No
 * request to GitHub. The name is the last one Kreds saw, and GitHub redirects a
 * renamed repository, so a stale one still lands.
 */
function gitHubUrlOf(entry: OwnEntry): string | null {
  const name = entry.repository?.nameWithOwner;
  const number = entry.source.pullRequestNumber;
  if (!name || !NAME_WITH_OWNER.test(name) || number === null) return null;

  const pull = `https://github.com/${name}/pull/${number}`;
  if (entry.kind === "PULL_REQUEST_MERGED") return pull;
  if (entry.kind === "CODE_REVIEW") {
    return entry.source.reviewId === null
      ? null
      : `${pull}#pullrequestreview-${entry.source.reviewId}`;
  }
  return null;
}
