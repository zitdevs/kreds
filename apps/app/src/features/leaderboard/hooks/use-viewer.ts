"use client";

import { useEffect, useState } from "react";

import { getSummary } from "@/features/dashboard/services/dashboard-api";
import { fetchSession, type SessionUser } from "@/lib/session";

/** Where the person reading stands, as far as the board is concerned. */
export type Viewer =
  | { readonly status: "checking" }
  | { readonly status: "signed-out" }
  | {
      readonly status: "signed-in";
      readonly user: SessionUser;
      /** `undefined` while it loads, `null` if it could not be read. */
      readonly standing:
        { readonly rank: number | null; readonly points: number } | null | undefined;
    };

/**
 * Who is looking at the board, and their own rank.
 *
 * The rank comes from the person's own summary rather than from searching the
 * board, so it is known even when they are pages below what is loaded. Both
 * are the same dense rank over the same totals.
 */
export function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>({ status: "checking" });

  useEffect(() => {
    let live = true;
    void (async () => {
      const user = await fetchSession();
      if (!live) return;
      if (!user) {
        setViewer({ status: "signed-out" });
        return;
      }
      setViewer({ status: "signed-in", user, standing: undefined });
      try {
        const summary = await getSummary();
        if (live) {
          setViewer({
            status: "signed-in",
            user,
            standing: { rank: summary.rank, points: summary.points },
          });
        }
      } catch {
        // The board still works without it; the person just is not located on it.
        if (live) setViewer({ status: "signed-in", user, standing: null });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return viewer;
}
