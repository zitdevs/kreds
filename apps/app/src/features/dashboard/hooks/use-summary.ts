"use client";

import { useRemote } from "@/lib/use-remote";

import { getSummary } from "../services/dashboard-api";

/** The header's score, rank and counts. */
export function useSummary(onUnauthorized: () => void) {
  return useRemote(getSummary, onUnauthorized);
}
