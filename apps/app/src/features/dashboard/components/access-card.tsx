import type { ReactNode } from "react";
import { PRIVATE_ACTIVITY_CONSENT, PUBLIC_ACTIVITY_CONSENT } from "@kreds/domain/activity-consent";
import { ActionButton, Button, Eye, Lock } from "@kreds/ui";

import { Notice } from "@/components/notice";
import { formatAbsolute, formatRelative } from "@/lib/format";

import type { AccessStatus } from "../types";

export type AccessView =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string; readonly onRetry: () => void }
  | { readonly status: "ready"; readonly access: AccessStatus };

interface AccessCardProps {
  readonly view: AccessView;
  /**
   * Where "Allow Kreds to read your public activity" sends the browser: the
   * sign-in round trip, which is where that consent is given and recorded. A
   * full-page navigation.
   */
  readonly allowHref: string;
  /** Where "Connect private work" sends the browser. A full-page navigation. */
  readonly connectHref: string;
  readonly onRevoke: () => void;
  /** The outcome of the last thing done here, announced politely. */
  readonly notice?: ReactNode;
}

/**
 * What Kreds can currently see of this person's work, and the controls over it.
 *
 * Reach comes from what GitHub actually granted, bounded by what the person
 * agreed to, so "Public only" after a request for private access is a real
 * answer and is shown as one. Somebody who has not agreed to anything yet,
 * such as a person who signed in before Kreds asked, is offered the choice.
 *
 * Each consent's text sits directly above the button that gives it, from the
 * same `@kreds/domain` module the API records versions from.
 */
export function AccessCard({ view, allowHref, connectHref, onRevoke, notice }: AccessCardProps) {
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
        <AccessBody
          view={view}
          allowHref={allowHref}
          connectHref={connectHref}
          onRevoke={onRevoke}
        />
      </div>
    </section>
  );
}

function AccessBody({ view, allowHref, connectHref, onRevoke }: Omit<AccessCardProps, "notice">) {
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
  const reading = access.authorized && access.publicConsent !== null;
  const canAllow = access.delegatedQueryConfigured && !reading;
  const canConnect =
    access.delegatedQueryConfigured && reading && access.reach !== "INCLUDES_PRIVATE";
  const canRevoke =
    access.authorized || access.publicConsent !== null || access.privateConsent !== null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="flex items-center gap-2 text-base font-medium">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${reading ? "bg-accent" : "bg-line-strong"}`}
          />
          {reach.label}
        </p>
        <p className="text-ink-dim mt-1.5 text-sm leading-relaxed">{reach.detail}</p>
        {reading ? (
          <ul className="text-ink-dim mt-2 flex flex-col gap-1 text-xs">
            {access.publicConsent ? (
              <li>
                <ConsentDate label="Public activity allowed" iso={access.publicConsent.grantedAt} />
              </li>
            ) : null}
            {access.privateConsent && access.reach === "INCLUDES_PRIVATE" ? (
              <li>
                <ConsentDate label="Private work allowed" iso={access.privateConsent.grantedAt} />
              </li>
            ) : null}
            <li>
              {access.lastPolledAt ? (
                <ConsentDate label="Last checked" iso={access.lastPolledAt} />
              ) : (
                "Not checked yet. Kreds looks periodically."
              )}
            </li>
          </ul>
        ) : null}
      </div>

      {canAllow ? (
        <div className="border-line border-t pt-5">
          <p id="allow-consent" className="text-ink text-xs leading-relaxed">
            {PUBLIC_ACTIVITY_CONSENT.text}
          </p>
          <Button href={allowHref} className="mt-3 w-full" aria-describedby="allow-consent">
            <Eye className="size-4" />
            Allow Kreds to read your public activity
          </Button>
        </div>
      ) : null}

      {canConnect ? (
        <div className="border-line border-t pt-5">
          <p id="private-consent" className="text-ink text-xs leading-relaxed">
            {PRIVATE_ACTIVITY_CONSENT.text}
          </p>
          <Button href={connectHref} className="mt-3 w-full" aria-describedby="private-consent">
            <Lock className="size-4" />
            Connect private work
          </Button>
          <p className="text-ink-dim mt-3 text-xs leading-relaxed">
            GitHub shows the permission Kreds asks for before anything is granted.
          </p>
        </div>
      ) : null}

      {canRevoke ? (
        <div className={canAllow || canConnect ? "" : "border-line border-t pt-5"}>
          <ActionButton variant="danger" onClick={onRevoke}>
            Revoke access
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}

function ConsentDate({ label, iso }: { readonly label: string; readonly iso: string }) {
  return (
    <>
      {label}{" "}
      <time dateTime={iso} title={formatAbsolute(iso)}>
        {formatRelative(iso)}
      </time>
    </>
  );
}

interface ReachCopy {
  readonly label: string;
  readonly detail: string;
}

function describeReach(access: AccessStatus): ReachCopy {
  if (!access.delegatedQueryConfigured) {
    return {
      label: "Not available here",
      detail: "This Kreds instance is not set up to read activity on your behalf.",
    };
  }
  if (!access.authorized || !access.publicConsent) {
    return {
      label: "Not reading your activity",
      detail:
        "Kreds is not reading your activity on your behalf until you allow it. Once you do, your public pull requests and code reviews earn Contribution Points.",
    };
  }
  if (access.reach === "INCLUDES_PRIVATE") {
    return {
      label: "Public and private",
      detail:
        "Kreds reads your pull requests and reviews in public and private repositories. Private work earns points, never KRED.",
    };
  }
  return {
    label: "Public only",
    detail: "Kreds reads your pull requests and reviews in public repositories.",
  };
}
