"use client";

import { useCallback, useMemo, useState } from "react";

import { useRemote, type Remote } from "@/lib/use-remote";

import { getLeaderboard } from "../services/leaderboard-api";
import type { LeaderboardEntry } from "../types";

const firstPage = () => getLeaderboard(null);
/** The board is public: a 401 here would mean nothing, so there is nothing to do about one. */
const ignoreUnauthorized = () => {};

export type MoreStatus = "idle" | "loading" | "error";

export interface LeaderboardFeed {
  readonly entries: readonly LeaderboardEntry[];
  readonly hasMore: boolean;
  readonly more: MoreStatus;
}

/**
 * The global contribution board, a page at a time.
 *
 * Later pages are appended by an explicit "Load more", never by scrolling, so
 * the row someone is reading does not move.
 */
export function useLeaderboard() {
  const first = useRemote(firstPage, ignoreUnauthorized);
  const [later, setLater] = useState<{
    entries: readonly LeaderboardEntry[];
    nextCursor: string | null;
  } | null>(null);
  const [more, setMore] = useState<MoreStatus>("idle");

  const firstCursor = first.state.status === "ready" ? first.state.data.nextCursor : null;
  const nextCursor = later ? later.nextCursor : firstCursor;

  const state = useMemo((): Remote<LeaderboardFeed> => {
    if (first.state.status !== "ready") return first.state;
    // Keyed by account: totals move while the page is open, and a person who
    // climbed past a page boundary must not be listed twice.
    const seen = new Set<number>();
    const entries = [...first.state.data.entries, ...(later?.entries ?? [])].filter((entry) => {
      if (seen.has(entry.gitHubUserId)) return false;
      seen.add(entry.gitHubUserId);
      return true;
    });
    return { status: "ready", data: { entries, hasMore: nextCursor !== null, more } };
  }, [first.state, later, nextCursor, more]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || more === "loading") return;
    setMore("loading");
    try {
      const page = await getLeaderboard(nextCursor);
      setLater((previous) => ({
        entries: [...(previous?.entries ?? []), ...page.entries],
        nextCursor: page.nextCursor,
      }));
      setMore("idle");
    } catch {
      setMore("error");
    }
  }, [nextCursor, more]);

  const { reload } = first;
  const retry = useCallback(() => {
    setLater(null);
    setMore("idle");
    reload();
  }, [reload]);

  return { state, loadMore, retry };
}
