import { formatNumber } from "@/lib/format";

import { VIEWER_ROW_ID } from "./leaderboard-table";

export type ViewerStandingView =
  | { readonly status: "hidden" }
  | { readonly status: "signed-out"; readonly signInHref: string }
  /** On the board, and their row is among those loaded. */
  | { readonly status: "listed"; readonly rank: number; readonly points: number }
  /** On the board, further down than what is loaded. */
  | { readonly status: "below"; readonly rank: number; readonly points: number }
  | { readonly status: "unranked" };

/**
 * Where the reader stands. Always the same slot above the board, so finding
 * yourself never depends on paging down to your row.
 */
export function ViewerStanding({ view }: { view: ViewerStandingView }) {
  if (view.status === "hidden") return null;

  return (
    <section
      aria-label="Your position"
      className="rounded-card border-line bg-surface flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <StandingBody view={view} />
    </section>
  );
}

function StandingBody({ view }: { view: Exclude<ViewerStandingView, { status: "hidden" }> }) {
  if (view.status === "signed-out") {
    return (
      <>
        <p className="text-ink-dim text-sm leading-relaxed">
          Sign in with GitHub to see where you stand.
        </p>
        <a
          href={view.signInHref}
          className="text-accent shrink-0 text-sm font-medium underline-offset-4 hover:underline"
        >
          Sign in
        </a>
      </>
    );
  }

  if (view.status === "unranked") {
    return (
      <p className="text-ink-dim text-sm leading-relaxed text-pretty">
        You are not on the board yet. Merged pull requests and reviews that Kreds records earn
        Contribution Points, and the first ones put you here.
      </p>
    );
  }

  return (
    <>
      <p className="text-ink-dim text-sm leading-relaxed">
        You are{" "}
        <span className="text-ink font-mono font-semibold tabular-nums">
          #{formatNumber(view.rank)}
        </span>{" "}
        with{" "}
        <span className="text-accent font-mono font-semibold tabular-nums">
          {formatNumber(view.points)}
        </span>{" "}
        Contribution Points
        {view.status === "below" ? ", further down the board." : "."}
      </p>
      {view.status === "listed" ? (
        <a
          href={`#${VIEWER_ROW_ID}`}
          className="text-accent shrink-0 text-sm font-medium underline-offset-4 hover:underline"
        >
          Jump to your row
        </a>
      ) : null}
    </>
  );
}
