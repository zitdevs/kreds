"use client";

import { useCallback } from "react";

import { isUnauthorized } from "@/lib/http";
import { useRemote } from "@/lib/use-remote";

import { getAccessStatus, revokeAccess } from "../services/dashboard-api";
import type { RevokeResult } from "../types";

/**
 * What Kreds may currently see of this person's activity, and the one way to
 * take it back.
 *
 * Granting is not here on purpose: it is a full-page trip through GitHub's own
 * consent screen, so the only thing the app does is link to it.
 */
export function useAccess(gitHubUserId: number, onUnauthorized: () => void) {
  const load = useCallback(() => getAccessStatus(gitHubUserId), [gitHubUserId]);
  const status = useRemote(load, onUnauthorized);
  const { refresh } = status;

  /** Throws on failure so the confirmation can say so and stay open. */
  const revoke = useCallback(async (): Promise<RevokeResult> => {
    try {
      const result = await revokeAccess(gitHubUserId);
      refresh();
      return result;
    } catch (error) {
      if (isUnauthorized(error)) onUnauthorized();
      throw error;
    }
  }, [gitHubUserId, onUnauthorized, refresh]);

  return { ...status, revoke };
}
