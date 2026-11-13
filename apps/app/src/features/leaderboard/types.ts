/**
 * The leaderboard as the API sends it.
 *
 * Restated rather than imported from `apps/api`, for the same reason as the
 * dashboard's types: the two talk over HTTP and do not ship together.
 */

export interface LeaderboardEntry {
  /** Dense and global: people on the same total share it, and a later page carries on. */
  readonly rank: number;
  readonly gitHubUserId: number;
  /** `null` when Kreds has no GitHub login on record for the account. */
  readonly login: string | null;
  readonly points: number;
}

export interface LeaderboardPage {
  readonly scope: "GLOBAL" | "ORGANIZATION";
  readonly entries: readonly LeaderboardEntry[];
  readonly nextCursor: string | null;
}
