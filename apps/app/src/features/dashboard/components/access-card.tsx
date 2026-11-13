import type { ReactNode } from "react";
import { ActionButton, Button, Lock } from "@kreds/ui";

import { Notice } from "@/components/notice";
import { formatAbsolute, formatRelative } from "@/lib/format";

import type { AccessStatus } from "../types";

export type AccessView =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string; readonly onRetry: () => void }
  | { readonly status: "ready"; readonly access: AccessStatus };

interface AccessCardProps {
  readonly view: AccessView;
  /** Where "Connect private work" sends the browser. A full-page navigation. */
  readonly connectHref: string;
  readonly onRevoke: () => void;
  /** The outcome of the last thing done here, announced politely. */
  readonly notice?: ReactNode;
}

/**
 * What Kreds can currently see of this person's work, and the controls over it.
 *
 * Reach comes from what GitHub actually granted, not from what Kreds asked
 * for, so "Public only" after a request for private access is a real answer
 * and is shown as one.
 */
export function AccessCard({ view, connectHref, onRevoke, notice }: AccessCardProps) {
  return (
    <section
      aria-labelledby="access-heading"
      className="rounded-card border-line bg-surface border p-5"
    >
      <h2
        id="access-heading"
        className="text-ink-dim font-mono text-xs tracking-[0.14em] uppercase"
      >
        Access
      </h2>

      {/* Always rendered, so a message that appears later is announced. */}
      <div role="status" aria-live="polite" className="mt-4 empty:hidden">
        {notice}
      </div>

      <div className="mt-4">
        <AccessBody view={view} connectHref={connectHref} onRevoke={onRevoke} />
      </div>
    </section>
  );
}

function AccessBody({ view, connectHref, onRevoke }: Omit<AccessCardProps, "notice">) {
  if (view.status === "loading") {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">Loading what Kreds can see</span>
        <span aria-hidden="true" className="bg-surface-hi h-5 w-32 animate-pulse rounded" />
        <span aria-hidden="true" className="bg-surface-hi h-4 w-full animate-pulse rounded" />
        <span aria-hidden="true" className="bg-surface-hi h-4 w-2/3 animate-pulse rounded" />
      </div>
    );
  }

  if (view.status === "error") {
    return (
      <Notice
        tone="error"
        title="Access status did not load"
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

  const { access } = view;
  const reach = describeReach(access);
  const canConnect = access.delegatedQueryConfigured && access.reach !== "INCLUDES_PRIVATE";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="flex items-center gap-2 text-base font-medium">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${reach.connected ? "bg-accent" : "bg-line-strong"}`}
          />
          {reach.label}
        </p>
        <p className="text-ink-dim mt-1.5 text-sm leading-relaxed">{reach.detail}</p>
        {access.authorized ? (
          <p className="text-ink-dim mt-2 text-xs">
            {access.lastPolledAt ? (
              <>
                Last checked{" "}
                <time dateTime={access.lastPolledAt} title={formatAbsolute(access.lastPolledAt)}>
                  {formatRelative(access.lastPolledAt)}
                </time>
              </>
            ) : (
              "Not checked yet. Kreds looks periodically."
            )}
          </p>
        ) : null}
      </div>

      {canConnect ? (
        <div className="border-line border-t pt-5">
          <Button href={connectHref} className="w-full">
            <Lock className="size-4" />
            Connect private work
          </Button>
          <p className="text-ink-dim mt-3 text-xs leading-relaxed">
            GitHub shows the permission Kreds asks for before anything is granted. Kreds only reads
            metadata about your own pull requests and reviews, never code. Private work earns
            points, never KRED.
          </p>
        </div>
      ) : null}

      {access.authorized ? (
        <div className={canConnect ? "" : "border-line border-t pt-5"}>
          <ActionButton variant="danger" onClick={onRevoke}>
            Revoke access
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}

interface ReachCopy {
  readonly label: string;
  readonly detail: string;
  readonly connected: boolean;
}

function describeReach(access: AccessStatus): ReachCopy {
  if (!access.delegatedQueryConfigured) {
    return {
      label: "Not available here",
      detail: "This Kreds instance is not set up to read activity on your behalf.",
      connected: false,
    };
  }
  if (!access.authorized) {
    return {
      label: "Not connected",
      detail: "Kreds is not reading your activity on your behalf.",
      connected: false,
    };
  }
  if (access.reach === "INCLUDES_PRIVATE") {
    return {
      label: "Public and private",
      detail:
        "Kreds reads your pull requests and reviews in public and private repositories. Private work earns points, never KRED.",
      connected: true,
    };
  }
  return {
    label: "Public only",
    detail: "Kreds reads your pull requests and reviews in public repositories.",
    connected: true,
  };
}
