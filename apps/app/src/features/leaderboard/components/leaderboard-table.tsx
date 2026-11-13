import { ActionButton } from "@kreds/ui";

import { Notice } from "@/components/notice";
import { formatNumber } from "@/lib/format";

import type { LeaderboardEntry } from "../types";

export type LeaderboardTableView =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string; readonly onRetry: () => void }
  | {
      readonly status: "ready";
      readonly entries: readonly LeaderboardEntry[];
      readonly hasMore: boolean;
      readonly more: "idle" | "loading" | "error";
      readonly onLoadMore: () => void;
      /** The signed-in person's account, to mark their row. `null` signed out. */
      readonly viewerGitHubUserId: number | null;
    };

/** The id the viewer's own row carries, for "Jump to your row". */
export const VIEWER_ROW_ID = "leaderboard-you";

/**
 * The ranked board: rank, who, and their Contribution Points.
 *
 * Totals only. Nothing here names a repository or says where the work was done,
 * because this page is public and some of that work is private.
 */
export function LeaderboardTable({ view }: { view: LeaderboardTableView }) {
  if (view.status === "loading") return <TableSkeleton />;

  if (view.status === "error") {
    return (
      <Notice
        tone="error"
        title="The leaderboard did not load"
        action={
          <ActionButton variant="secondary" onClick={view.onRetry}>
            Try again
          </ActionButton>
        }
      >
        {view.message}
      </Notice>
    );
  }

  if (view.entries.length === 0) return <EmptyState />;

  return (
    <>
      <div className="rounded-card border-line overflow-hidden border">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            Contribution leaderboard, ranked by Contribution Points
          </caption>
          <colgroup>
            <col className="w-14 sm:w-20" />
            <col />
            <col className="w-24 sm:w-36" />
          </colgroup>
          <thead className="bg-surface text-ink-dim text-xs">
            <tr className="border-line border-b">
              <th scope="col" className="px-3 py-3 text-left font-medium sm:px-4">
                Rank
              </th>
              <th scope="col" className="px-3 py-3 text-left font-medium sm:px-4">
                Contributor
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium sm:px-4">
                Points
              </th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {view.entries.map((entry) => (
              <Row
                key={entry.gitHubUserId}
                entry={entry}
                isViewer={entry.gitHubUserId === view.viewerGitHubUserId}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        {view.more === "error" ? (
          <p role="alert" className="text-danger text-sm">
            More of the leaderboard did not load.
          </p>
        ) : null}
        {view.hasMore ? (
          <ActionButton
            variant="secondary"
            size="lg"
            onClick={view.onLoadMore}
            disabled={view.more === "loading"}
            aria-busy={view.more === "loading"}
            className="w-full sm:w-auto"
          >
            {view.more === "loading"
              ? "Loading…"
              : view.more === "error"
                ? "Try again"
                : "Load more"}
          </ActionButton>
        ) : (
          <p className="text-ink-dim text-xs">That is everyone on the board.</p>
        )}
        <p role="status" className="sr-only">
          {view.entries.length} people shown
        </p>
      </div>
    </>
  );
}

function Row({ entry, isViewer }: { entry: LeaderboardEntry; isViewer: boolean }) {
  return (
    <tr
      id={isViewer ? VIEWER_ROW_ID : undefined}
      aria-current={isViewer ? "true" : undefined}
      className={`scroll-mt-24 ${isViewer ? "bg-accent-wash" : "bg-bg"}`}
    >
      <td
        className={`px-3 py-3 font-mono tabular-nums sm:px-4 ${isViewer ? "text-ink" : "text-ink-dim"}`}
      >
        #{formatNumber(entry.rank)}
      </td>
      <td className="px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar gitHubUserId={entry.gitHubUserId} login={entry.login} />
          <span className="min-w-0 truncate">
            {entry.login ? (
              <a
                href={`https://github.com/${encodeURIComponent(entry.login)}`}
                title={entry.login}
                className="text-ink hover:text-accent font-medium underline-offset-4 transition-colors hover:underline"
              >
                {entry.login}
              </a>
            ) : (
              <span className="text-ink-dim">Unnamed account</span>
            )}
          </span>
          {isViewer ? (
            <span className="border-accent-deep text-accent shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide uppercase">
              You
            </span>
          ) : null}
        </div>
      </td>
      <td className="text-accent px-3 py-3 text-right font-mono font-semibold tabular-nums sm:px-4">
        {formatNumber(entry.points)}
      </td>
    </tr>
  );
}

/**
 * GitHub serves every account's avatar by numeric id, so no URL has to be
 * stored or sent. The initial sits underneath: if the image does not load, an
 * empty `alt` draws nothing and the initial shows through.
 */
function Avatar({ gitHubUserId, login }: { gitHubUserId: number; login: string | null }) {
  return (
    <span className="bg-surface-hi text-ink-dim border-line relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border text-xs font-medium uppercase">
      <span aria-hidden="true">{login?.[0] ?? "?"}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- small avatars
          from GitHub's CDN at a fixed size. next/image would need a remote host
          allowlist and a loader for no gain at 32 pixels. */}
      <img
        src={`https://avatars.githubusercontent.com/u/${gitHubUserId}?s=64&v=4`}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border-line-strong border border-dashed px-6 py-12 text-center">
      <p className="text-ink font-medium">Nobody is on the board yet</p>
      <p className="text-ink-dim mx-auto mt-2 max-w-sm text-sm leading-relaxed text-pretty">
        The first merged pull requests and reviews Kreds records will put their authors here.
      </p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div role="status" className="rounded-card border-line overflow-hidden border">
      <span className="sr-only">Loading the leaderboard</span>
      <ul aria-hidden="true" className="divide-line divide-y">
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <li key={row} className="bg-bg flex items-center gap-3 px-3 py-3 sm:px-4">
            <span className="bg-surface-hi h-3.5 w-8 animate-pulse rounded" />
            <span className="bg-surface-hi ml-5 size-8 shrink-0 animate-pulse rounded-full" />
            <span className="bg-surface-hi h-3.5 w-32 max-w-full animate-pulse rounded" />
            <span className="bg-surface-hi ml-auto h-3.5 w-14 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
