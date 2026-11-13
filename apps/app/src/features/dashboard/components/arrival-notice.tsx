"use client";

import { useEffect, useRef } from "react";

import { Notice } from "@/components/notice";

import type { GrantOutcome } from "../types";

const GRANT_COPY: Readonly<
  Record<GrantOutcome, { tone: "success" | "info"; title: string; body: string }>
> = {
  private: {
    tone: "success",
    title: "Private work connected",
    body: "Kreds can now read metadata about your own pull requests and reviews in private repositories. They are picked up on the next check. Private work earns points, never KRED.",
  },
  "public-only": {
    tone: "info",
    title: "GitHub granted public access only",
    body: "GitHub gave Kreds less than it asked for, so private repositories stay out of view. That happens when the private permission is narrowed on GitHub's screen, or when an organization restricts third-party apps until an owner approves Kreds once.",
  },
  none: {
    tone: "info",
    title: "Nothing was granted",
    body: "GitHub returned no access, so Kreds stored nothing. You can try again whenever you like.",
  },
  cancelled: {
    tone: "info",
    title: "Connection cancelled",
    body: "Nothing changed. Kreds can see exactly what it could before.",
  },
};

interface ArrivalNoticeProps {
  readonly grant: GrantOutcome | null;
  readonly returning: boolean;
  readonly onDismiss: () => void;
}

/**
 * What the person came back to: the answer from GitHub's consent screen, or
 * the note that an identity Kreds already knew is now theirs.
 *
 * Focus moves here on arrival. It is the reply to the last thing they did, it
 * is first on the page, and a redirect gives a screen reader nothing else to
 * go on.
 */
export function ArrivalNotice({ grant, returning, onDismiss }: ArrivalNoticeProps) {
  const notice = useRef<HTMLDivElement>(null);
  const visible = grant !== null || returning;

  useEffect(() => {
    if (visible) notice.current?.focus();
  }, [visible]);

  if (grant) {
    const copy = GRANT_COPY[grant];
    return (
      <div role="status">
        <Notice ref={notice} tone={copy.tone} title={copy.title} onDismiss={onDismiss}>
          {copy.body}
        </Notice>
      </div>
    );
  }

  if (returning) {
    return (
      <div role="status">
        <Notice ref={notice} tone="success" onDismiss={onDismiss}>
          Kreds already knew this GitHub identity. Anything it did before you signed in stayed
          attached to it and came with you.
        </Notice>
      </div>
    );
  }

  return null;
}
