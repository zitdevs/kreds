"use client";

import Link from "next/link";

import { describeFailure } from "@/lib/http";
import { api } from "@/lib/site";

import { LeaderboardIntro } from "./components/leaderboard-intro";
import { LeaderboardTable, type LeaderboardTableView } from "./components/leaderboard-table";
import { ViewerStanding, type ViewerStandingView } from "./components/viewer-standing";
import { useLeaderboard } from "./hooks/use-leaderboard";
import { useViewer, type Viewer } from "./hooks/use-viewer";
import type { LeaderboardEntry } from "./types";

/**
 * The public contribution leaderboard.
 *
 * The container: it owns the board read and the reader's own standing, and
 * turns them into views. Signed out it is the same board, without a "you".
 */
export function Leaderboard() {
  const board = useLeaderboard();
  const viewer = useViewer();

  const entries = board.state.status === "ready" ? board.state.data.entries : null;

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      {viewer.status === "signed-in" ? (
        <Link
          href="/"
          className="text-ink-dim hover:text-ink -mb-4 self-start text-sm transition-colors sm:-mb-6"
        >
          <span aria-hidden="true">← </span>Your dashboard
        </Link>
      ) : null}
      <LeaderboardIntro />
      <ViewerStanding view={toStandingView(viewer, entries)} />
      <section aria-label="Ranking" className="min-w-0">
        <LeaderboardTable view={toTableView(board, viewer)} />
      </section>
    </div>
  );
}

function toStandingView(
  viewer: Viewer,
  entries: readonly LeaderboardEntry[] | null,
): ViewerStandingView {
  if (viewer.status === "checking") return { status: "hidden" };
  if (viewer.status === "signed-out") return { status: "signed-out", signInHref: api.signIn };
  const { standing } = viewer;
  if (!standing) return { status: "hidden" };
  if (standing.rank === null) return { status: "unranked" };
  const listed = entries?.some((entry) => entry.gitHubUserId === viewer.user.gitHubUserId);
  return { status: listed ? "listed" : "below", rank: standing.rank, points: standing.points };
}

function toTableView(
  { state, retry, loadMore }: ReturnType<typeof useLeaderboard>,
  viewer: Viewer,
): LeaderboardTableView {
  if (state.status === "ready") {
    return {
      status: "ready",
      ...state.data,
      onLoadMore: () => void loadMore(),
      viewerGitHubUserId: viewer.status === "signed-in" ? viewer.user.gitHubUserId : null,
    };
  }
  if (state.status === "error") {
    return { status: "error", message: describeFailure(state.error), onRetry: retry };
  }
  return state;
}
