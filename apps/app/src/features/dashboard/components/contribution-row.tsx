import { Badge, ExternalLink, Lock } from "@kreds/ui";

import { formatAbsolute, formatNumber, formatRelative } from "@/lib/format";

import { KIND_COPY } from "../kinds";
import type { ContributionEntry } from "../types";

/** Only GitHub links are rendered. Anything else in `url` is not trusted as an href. */
const GITHUB = "https://github.com/";

interface ContributionRowProps {
  readonly entry: ContributionEntry;
  /** The id of the note that explains "Capped", so the badge can point at it. */
  readonly cappedNoteId: string;
}

/**
 * One award.
 *
 * An invalidated award stays in the list, struck through: hiding it would make
 * a number on someone's record change with no visible reason. `observed: null`
 * predates evaluation and is shown as nothing at all, because "unknown" is not
 * the same claim as "capped".
 */
export function ContributionRow({ entry, cappedNoteId }: ContributionRowProps) {
  const { label, Icon } = KIND_COPY[entry.kind];
  const href = entry.url?.startsWith(GITHUB) ? entry.url : null;
  const capped = entry.observed === false;

  return (
    <li className={`flex gap-3 py-4 ${entry.invalidated ? "opacity-70" : ""}`}>
      <span
        aria-hidden="true"
        className="border-line bg-bg-elev text-ink-dim grid size-9 shrink-0 place-items-center rounded-lg border"
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={`text-sm font-medium ${entry.invalidated ? "text-ink-dim line-through" : "text-ink"}`}
          >
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent inline-flex items-center gap-1.5 transition-colors"
              >
                {label}
                <ExternalLink className="size-3.5 shrink-0" />
                <span className="sr-only">(opens on GitHub in a new tab)</span>
              </a>
            ) : (
              label
            )}
          </p>
          <Points points={entry.points} invalidated={entry.invalidated} />
        </div>

        <div className="text-ink-dim mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          {entry.repository ? (
            <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
              <span className="truncate font-mono" title={entry.repository.nameWithOwner}>
                {entry.repository.nameWithOwner}
              </span>
              {entry.repository.isPrivate ? (
                <Badge>
                  <Lock className="size-2.5" />
                  Private
                </Badge>
              ) : null}
            </span>
          ) : (
            <span>Repository not recorded</span>
          )}
          <span aria-hidden="true">·</span>
          <time dateTime={entry.occurredAt} title={formatAbsolute(entry.occurredAt)}>
            {formatRelative(entry.occurredAt)}
          </time>
          {entry.invalidated ? <Badge tone="danger">Invalidated</Badge> : null}
          {capped ? (
            <Badge aria-describedby={cappedNoteId} title="Not independently reviewed">
              Capped
            </Badge>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Points({ points, invalidated }: { points: number; invalidated: boolean }) {
  const value = `+${formatNumber(points)}`;
  if (invalidated) {
    return (
      <span className="text-ink-dim shrink-0 font-mono text-sm tabular-nums">
        <s>{value}</s>
        <span className="sr-only"> points, invalidated and not counted</span>
      </span>
    );
  }
  return (
    <span className="text-ink shrink-0 font-mono text-sm font-medium tabular-nums">
      {value}
      <span className="sr-only"> points</span>
    </span>
  );
}
