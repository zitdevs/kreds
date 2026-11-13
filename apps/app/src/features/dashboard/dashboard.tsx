"use client";

import { useEffect, useRef, useState } from "react";

import { Notice } from "@/components/notice";
import { describeFailure } from "@/lib/http";
import type { SessionUser } from "@/lib/session";
import { api } from "@/lib/site";

import { AccessCard, type AccessView } from "./components/access-card";
import { ArrivalNotice } from "./components/arrival-notice";
import { ContributionList, type ContributionListView } from "./components/contribution-list";
import { ProfileHeader } from "./components/profile-header";
import { RevokeDialog } from "./components/revoke-dialog";
import { ScoreSummary, type ScoreSummaryView } from "./components/score-summary";
import { useAccess } from "./hooks/use-access";
import { useContributions } from "./hooks/use-contributions";
import { useSummary } from "./hooks/use-summary";
import type { GrantOutcome } from "./types";

interface DashboardProps {
  readonly user: SessionUser;
  readonly grant: GrantOutcome | null;
  readonly returning: boolean;
  readonly onSignOut: () => void;
  /** Any read answered 401: the session ended while the page was open. Must be stable. */
  readonly onSessionLost: () => void;
}

/**
 * The signed-in person's own page: their score, what Kreds can see, and the
 * record behind the score.
 *
 * This is the container. It owns the three reads and the one write, and turns
 * each into a view the presentational components draw. Nothing below it
 * fetches or knows the API exists.
 */
export function Dashboard({ user, grant, returning, onSignOut, onSessionLost }: DashboardProps) {
  const summary = useSummary(onSessionLost);
  const contributions = useContributions(onSessionLost);
  const access = useAccess(user.gitHubUserId, onSessionLost);

  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const accessNotice = useRef<HTMLDivElement>(null);

  // The button that opened the confirmation is gone once access is revoked, so
  // the dialog has nowhere to return focus. The outcome is the next best place.
  useEffect(() => {
    if (accessMessage) accessNotice.current?.focus();
  }, [accessMessage]);

  async function confirmRevoke() {
    try {
      const result = await access.revoke();
      setAccessMessage(
        !result.revoked
          ? "There was no active access to revoke."
          : (result.consentsRevoked ?? 0) > 0
            ? "Access and your agreement to it are revoked. Kreds has stopped reading new activity; your recorded contributions stay."
            : "Access revoked. Kreds has stopped reading new activity; your recorded contributions stay.",
      );
    } catch (error) {
      throw new Error(describeFailure(error));
    }
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      {arrivalDismissed ? null : (
        <ArrivalNotice
          grant={grant}
          returning={returning}
          onDismiss={() => setArrivalDismissed(true)}
        />
      )}

      <div className="flex flex-col gap-6">
        <ProfileHeader
          displayName={user.displayName}
          login={user.login}
          avatarUrl={user.avatarUrl}
          onSignOut={onSignOut}
        />
        <ScoreSummary view={toSummaryView(summary)} />
      </div>

      {/* The access card comes first in reading order: on a phone it sits above
          the list, where an empty list's "once Kreds can see your activity"
          has its answer right above it. On wide screens it moves to the side. */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <aside className="lg:col-start-2 lg:row-start-1">
          <div className="lg:sticky lg:top-24">
            <AccessCard
              view={toAccessView(access)}
              allowHref={api.signIn}
              connectHref={api.connectPrivate}
              onRevoke={() => setRevoking(true)}
              notice={
                accessMessage ? (
                  <Notice
                    ref={accessNotice}
                    tone="success"
                    onDismiss={() => setAccessMessage(null)}
                  >
                    {accessMessage}
                  </Notice>
                ) : null
              }
            />
          </div>
        </aside>
        <div className="lg:col-start-1 lg:row-start-1">
          <ContributionList view={toListView(contributions)} />
        </div>
      </div>

      <RevokeDialog open={revoking} onClose={() => setRevoking(false)} onConfirm={confirmRevoke} />
    </div>
  );
}

function toSummaryView({ state, reload }: ReturnType<typeof useSummary>): ScoreSummaryView {
  if (state.status === "ready") return { status: "ready", summary: state.data };
  if (state.status === "error") {
    return { status: "error", message: describeFailure(state.error), onRetry: reload };
  }
  return state;
}

function toAccessView({ state, reload }: ReturnType<typeof useAccess>): AccessView {
  if (state.status === "ready") return { status: "ready", access: state.data };
  if (state.status === "error") {
    return { status: "error", message: describeFailure(state.error), onRetry: reload };
  }
  return state;
}

function toListView({
  state,
  retry,
  loadMore,
}: ReturnType<typeof useContributions>): ContributionListView {
  if (state.status === "ready") {
    return { status: "ready", ...state.data, onLoadMore: () => void loadMore() };
  }
  if (state.status === "error") {
    return { status: "error", message: describeFailure(state.error), onRetry: retry };
  }
  return state;
}
