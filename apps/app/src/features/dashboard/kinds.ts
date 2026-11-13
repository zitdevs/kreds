import type { ComponentType, SVGProps } from "react";
import { Check, Eye, GitMerge, Users } from "@kreds/ui";

import type { ContributionKind } from "./types";

interface KindCopy {
  /** One award, as a row title. */
  readonly label: string;
  /** The count in the header. */
  readonly statLabel: string;
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Shown in the header even at zero. Only the kinds Kreds already ingests:
   * a permanent "0 issues resolved" would read as a judgement on the person
   * rather than on what Kreds can see so far.
   */
  readonly alwaysShown: boolean;
}

export const KIND_COPY: Readonly<Record<ContributionKind, KindCopy>> = {
  PULL_REQUEST_MERGED: {
    label: "Merged pull request",
    statLabel: "Merges",
    Icon: GitMerge,
    alwaysShown: true,
  },
  CODE_REVIEW: { label: "Code review", statLabel: "Reviews", Icon: Eye, alwaysShown: true },
  ISSUE_RESOLVED: {
    label: "Resolved issue",
    statLabel: "Issues resolved",
    Icon: Check,
    alwaysShown: false,
  },
  REVIEW_FOLLOW_UP: {
    label: "Review follow-up",
    statLabel: "Follow-ups",
    Icon: Users,
    alwaysShown: false,
  },
};
