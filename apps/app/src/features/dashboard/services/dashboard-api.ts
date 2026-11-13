import { requestJson } from "@/lib/http";
import { api } from "@/lib/site";

import type { AccessStatus, ContributionPage, ContributionSummary, RevokeResult } from "../types";

/** One page of the list. The API's own default, stated so the UI does not depend on it. */
export const PAGE_SIZE = 20;

export function getContributions(cursor: string | null): Promise<ContributionPage> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  return requestJson<ContributionPage>(`${api.myContributions}?${query.toString()}`);
}

export function getSummary(): Promise<ContributionSummary> {
  return requestJson<ContributionSummary>(api.mySummary);
}

export function getAccessStatus(gitHubUserId: number): Promise<AccessStatus> {
  return requestJson<AccessStatus>(api.accessStatus(gitHubUserId));
}

export function revokeAccess(gitHubUserId: number): Promise<RevokeResult> {
  return requestJson<RevokeResult>(api.authorization(gitHubUserId), { method: "DELETE" });
}
