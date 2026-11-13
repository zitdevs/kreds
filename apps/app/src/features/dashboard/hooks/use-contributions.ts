"use client";

import { useCallback, useMemo, useState } from "react";

import { isUnauthorized } from "@/lib/http";
import { useRemote, type Remote } from "@/lib/use-remote";

import { getContributions } from "../services/dashboard-api";
import type { ContributionEntry } from "../types";

const firstPage = () => getContributions(null);

export type MoreStatus = "idle" | "loading" | "error";

export interface ContributionFeed {
  readonly entries: readonly ContributionEntry[];
  readonly hasMore: boolean;
  readonly more: MoreStatus;
}

/**
 * The signed-in person's awards, newest first, a page at a time.
 *
 * The first page is an ordinary read. Later pages are appended by an explicit
 * "Load more", never by scrolling: a list someone reads to check their own
 * record should not move under them.
 */
export function useContributions(onUnauthorized: () => void) {
  const first = useRemote(firstPage, onUnauthorized);
  const [later, setLater] = useState<{
    entries: readonly ContributionEntry[];
    nextCursor: string | null;
  } | null>(null);
  const [more, setMore] = useState<MoreStatus>("idle");

  const firstCursor = first.state.status === "ready" ? first.state.data.nextCursor : null;
  const nextCursor = later ? later.nextCursor : firstCursor;

  const state = useMemo((): Remote<ContributionFeed> => {
    if (first.state.status !== "ready") return first.state;
    // Keyed by id: a page boundary that shifts under a new award must not
    // render the same row twice.
    const seen = new Set<string>();
    const entries = [...first.state.data.entries, ...(later?.entries ?? [])].filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    return { status: "ready", data: { entries, hasMore: nextCursor !== null, more } };
  }, [first.state, later, nextCursor, more]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || more === "loading") return;
    setMore("loading");
    try {
      const page = await getContributions(nextCursor);
      setLater((previous) => ({
        entries: [...(previous?.entries ?? []), ...page.entries],
        nextCursor: page.nextCursor,
      }));
      setMore("idle");
    } catch (error) {
      if (isUnauthorized(error)) onUnauthorized();
      setMore("error");
    }
  }, [nextCursor, more, onUnauthorized]);

  const { reload } = first;
  const retry = useCallback(() => {
    setLater(null);
    setMore("idle");
    reload();
  }, [reload]);

  return { state, loadMore, retry };
}
