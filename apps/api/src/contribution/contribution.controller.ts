import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";

import { ContributionLedger, IdentityRepository } from "@kreds/database";
import { gitHubUserId } from "@kreds/domain";

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
  ) {}

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
