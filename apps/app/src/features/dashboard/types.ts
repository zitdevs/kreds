/**
 * The dashboard's view of the API, as the API sends it.
 *
 * Restated here rather than imported from `apps/api`: the app talks to the API
 * over HTTP, and a type import across that boundary would pretend the two ship
 * together. If the contract moves, this file is the one place to follow it.
 */

export const CONTRIBUTION_KINDS = [
  "PULL_REQUEST_MERGED",
  "CODE_REVIEW",
  "ISSUE_RESOLVED",
  "REVIEW_FOLLOW_UP",
] as const;

export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export interface ContributionEntry {
  readonly id: string;
  readonly kind: ContributionKind;
  /** The award's magnitude. Kept on an invalidated award, which no longer counts. */
  readonly points: number;
  /** Whether an independent human observed the work. `null`: predates evaluation. */
  readonly observed: boolean | null;
  readonly occurredAt: string;
  readonly rulesVersion: string;
  readonly invalidated: boolean;
  readonly repository: { readonly nameWithOwner: string; readonly isPrivate: boolean } | null;
  readonly url: string | null;
}

export interface ContributionPage {
  readonly gitHubUserId: number;
  readonly entries: readonly ContributionEntry[];
  readonly nextCursor: string | null;
}

export interface ContributionSummary {
  readonly gitHubUserId: number;
  readonly points: number;
  /** `null` while the score is not above zero. */
  readonly rank: number | null;
  /** How many counted awards of each kind. Counts, not points. */
  readonly byKind: Readonly<Record<ContributionKind, number>>;
}

export type AccessReach = "PUBLIC_ONLY" | "INCLUDES_PRIVATE";

export interface AccessStatus {
  readonly gitHubUserId: number;
  readonly authorized: boolean;
  /** `false` when this instance has no way to keep a grant, so nothing to connect. */
  readonly delegatedQueryConfigured: boolean;
  readonly reach: AccessReach | null;
  readonly lastPolledAt: string | null;
}

export interface RevokeResult {
  readonly gitHubUserId: number;
  readonly revoked: boolean;
  readonly historyRetained?: boolean;
}

/** Where GitHub's consent screen sent the person back, as `?grant=` says. */
export type GrantOutcome = "private" | "public-only" | "none" | "cancelled";
