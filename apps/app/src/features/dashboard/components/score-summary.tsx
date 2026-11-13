import type { ReactNode } from "react";
import Link from "next/link";
import { ActionButton } from "@kreds/ui";

import { Notice } from "@/components/notice";
import { formatNumber } from "@/lib/format";

import { KIND_COPY } from "../kinds";
import { CONTRIBUTION_KINDS, type ContributionSummary } from "../types";

export type ScoreSummaryView =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string; readonly onRetry: () => void }
  | { readonly status: "ready"; readonly summary: ContributionSummary };

/**
 * The score, its rank and what it is made of.
 *
 * Points are set in ink, never amber: amber is reserved for KRED amounts, and
 * a points total that looked like a balance would be the first step towards
 * reading it as one (Law XXVI).
 */
export function ScoreSummary({ view }: { view: ScoreSummaryView }) {
  return (
    <section aria-labelledby="score-heading">
      <h2 id="score-heading" className="sr-only">
        Your score
      </h2>
      <ScoreBody view={view} />
      <p className="text-ink-dim mt-3 text-sm leading-relaxed text-pretty">
        Contribution Points recognise verified work. They are not currency: they cannot be spent,
        transferred or exchanged, and they never convert to KRED.{" "}
        <Link href="/leaderboard" className="text-accent underline-offset-4 hover:underline">
          See the leaderboard
        </Link>
      </p>
    </section>
  );
}

function ScoreBody({ view }: { view: ScoreSummaryView }) {
  if (view.status === "loading") return <ScoreSkeleton />;
  if (view.status === "error") {
    return (
      <Notice
        tone="error"
        title="Your score did not load"
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

  const { points, rank, byKind } = view.summary;
  const kinds = CONTRIBUTION_KINDS.filter(
    (kind) => KIND_COPY[kind].alwaysShown || byKind[kind] > 0,
  );

  return (
    <dl className={statGrid}>
      <Stat label="Contribution Points" emphasis>
        {formatNumber(points)}
      </Stat>
      {rank !== null ? <Stat label="Global rank">#{formatNumber(rank)}</Stat> : null}
      {kinds.map((kind) => (
        <Stat key={kind} label={KIND_COPY[kind].statLabel}>
          {formatNumber(byKind[kind])}
        </Stat>
      ))}
    </dl>
  );
}

/**
 * Hairline dividers come from the gap showing the border colour behind the
 * cells, so a wrapped row at 375px divides as cleanly as the full one.
 */
const statGrid =
  "rounded-card border-line bg-line grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]";

function Stat({
  label,
  emphasis = false,
  children,
}: {
  label: string;
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-surface flex flex-col gap-1 px-4 py-4 ${emphasis ? "col-span-2 sm:col-span-1" : ""}`}
    >
      <dt className="text-ink-dim text-xs">{label}</dt>
      <dd
        className={`font-mono font-semibold tracking-tight tabular-nums ${emphasis ? "text-accent text-3xl" : "text-ink text-2xl"}`}
      >
        {children}
      </dd>
    </div>
  );
}

function ScoreSkeleton() {
  return (
    <div role="status" className={statGrid}>
      <span className="sr-only">Loading your score</span>
      {[0, 1, 2].map((cell) => (
        <div
          key={cell}
          aria-hidden="true"
          className={`bg-surface flex flex-col gap-2 px-4 py-4 ${cell === 0 ? "col-span-2 sm:col-span-1" : ""}`}
        >
          <span className="bg-surface-hi h-3 w-20 animate-pulse rounded" />
          <span className="bg-surface-hi h-7 w-16 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
