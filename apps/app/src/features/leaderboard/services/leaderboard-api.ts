import { requestJson } from "@/lib/http";
import { api } from "@/lib/site";

import type { LeaderboardPage } from "../types";

/** One page of the board. Stated here so the UI does not depend on the API's default. */
export const PAGE_SIZE = 25;

export function getLeaderboard(cursor: string | null): Promise<LeaderboardPage> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  return requestJson<LeaderboardPage>(`${api.leaderboard}?${query.toString()}`);
}
