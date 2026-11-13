import { useId } from "react";
import { ActionButton } from "@kreds/ui";

import { Notice } from "@/components/notice";

import type { ContributionEntry } from "../types";
import { ContributionRow } from "./contribution-row";

export type ContributionListView =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string; readonly onRetry: () => void }
  | {
      readonly status: "ready";
      readonly entries: readonly ContributionEntry[];
      readonly hasMore: boolean;
      readonly more: "idle" | "loading" | "error";
      readonly onLoadMore: () => void;
    };

/** The person's awards, newest first, with every state drawn. */
export function ContributionList({ view }: { view: ContributionListView }) {
  return (
    <section aria-labelledby="contributions-heading" className="min-w-0">
      <h2 id="contributions-heading" className="text-lg font-semibold tracking-tight">
        Contributions
      </h2>
      <div className="mt-2">
        <ListBody view={view} />
      </div>
    </section>
  );
}

function ListBody({ view }: { view: ContributionListView }) {
  const cappedNoteId = useId();

  if (view.status === "loading") return <ListSkeleton />;

  if (view.status === "error") {
    return (
      <Notice
        tone="error"
        title="Your contributions did not load"
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

  const anyCapped = view.entries.some((entry) => entry.observed === false);

  return (
    <>
      <ol className="divide-line divide-y">
        {view.entries.map((entry) => (
          <ContributionRow key={entry.id} entry={entry} cappedNoteId={cappedNoteId} />
        ))}
      </ol>

      {anyCapped ? (
        <p
          id={cappedNoteId}
          className="text-ink-dim border-line mt-2 border-t pt-4 text-xs leading-relaxed"
        >
          <span className="text-ink font-medium">Capped:</span> not independently reviewed, so it
          counts toward a capped allowance.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col items-center gap-3">
        {view.more === "error" ? (
          <p role="alert" className="text-danger text-sm">
            More contributions did not load.
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
          <p className="text-ink-dim text-xs">That is everything so far.</p>
        )}
        {/* Says what changed after "Load more", which a sighted reader sees as new rows. */}
        <p role="status" className="sr-only">
          {view.entries.length} contributions shown
        </p>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border-line-strong mt-2 border border-dashed px-6 py-12 text-center">
      <p className="text-ink font-medium">No contributions yet</p>
      <p className="text-ink-dim mx-auto mt-2 max-w-sm text-sm leading-relaxed text-pretty">
        Once Kreds can see your activity, it picks up your merged pull requests and reviews
        periodically. They will show up here as they are recorded.
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading your contributions</span>
      <ul aria-hidden="true" className="divide-line divide-y">
        {[0, 1, 2, 3, 4].map((row) => (
          <li key={row} className="flex gap-3 py-4">
            <span className="bg-surface-hi size-9 shrink-0 animate-pulse rounded-lg" />
            <span className="flex flex-1 flex-col gap-2 pt-1">
              <span className="bg-surface-hi h-3.5 w-40 max-w-full animate-pulse rounded" />
              <span className="bg-surface-hi h-3 w-56 max-w-full animate-pulse rounded" />
            </span>
            <span className="bg-surface-hi mt-1 h-3.5 w-8 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
