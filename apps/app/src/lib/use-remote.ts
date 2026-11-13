"use client";

import { useCallback, useEffect, useState } from "react";

import { isUnauthorized } from "./http";

export type Remote<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "ready"; readonly data: T };

export interface RemoteResult<T> {
  readonly state: Remote<T>;
  /** Start over from a loading state, for a retry after an error. */
  readonly reload: () => void;
  /** Fetch again behind the current data, for after a change the person made. */
  readonly refresh: () => void;
}

/**
 * One read from the API, with the three states every screen has to draw.
 *
 * Deliberately small. The app has no query library and three reads do not
 * justify one; when it grows caching, deduping or background refetch needs,
 * this is the single place to swap out.
 *
 * `load` and `onUnauthorized` are effect dependencies, so callers pass stable
 * functions (module-level, or `useCallback`). A 401 is reported to the caller
 * and also kept as the error, so a screen never has to draw "signed out" itself.
 */
export function useRemote<T>(load: () => Promise<T>, onUnauthorized: () => void): RemoteResult<T> {
  const [state, setState] = useState<Remote<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    load().then(
      (data) => {
        if (live) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!live) return;
        if (isUnauthorized(error)) onUnauthorized();
        setState({ status: "error", error });
      },
    );
    return () => {
      live = false;
    };
  }, [load, onUnauthorized, attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, reload, refresh };
}
