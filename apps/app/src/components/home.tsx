"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Dashboard } from "@/features/dashboard/dashboard";
import type { GrantOutcome } from "@/features/dashboard/types";
import { requestJson } from "@/lib/http";
import { fetchSession, type SessionUser } from "@/lib/session";
import { api } from "@/lib/site";

import { SignIn } from "./sign-in";

/** Query flags the API appends when it sends the browser back here. */
const FLAGS = ["welcome", "signin", "grant"] as const;
const GRANTS: readonly string[] = ["private", "public-only", "none", "cancelled"];

interface Arrival {
  readonly returning: boolean;
  readonly grant: GrantOutcome | null;
}

type Session =
  | { readonly status: "checking" }
  | { readonly status: "signed-out"; readonly ended: boolean }
  | { readonly status: "signed-in"; readonly user: SessionUser };

/**
 * The root of the product: signed out, the sign-in; signed in, the dashboard.
 *
 * A client component because the session lives in a cookie on the API's origin
 * and is read from the browser. Rendering it on the server would mean
 * forwarding the cookie through, which buys nothing for a page that shows only
 * the person's own data.
 *
 * `useSearchParams` suspends during static rendering, so the boundary is not
 * optional decoration: without it the whole route opts out of prerendering.
 */
export function Home() {
  return (
    <Suspense fallback={<Checking />}>
      <HomeInner />
    </Suspense>
  );
}

function Checking() {
  return (
    <p role="status" className="text-ink-dim text-sm">
      Checking your session…
    </p>
  );
}

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [session, setSession] = useState<Session>({ status: "checking" });

  // Read once, on arrival. The flags are about to be dropped from the URL, and
  // what they said must outlive that.
  const [arrival] = useState<Arrival>(() => {
    const grant = params.get("grant");
    return {
      returning: params.get("welcome") === "returning",
      grant: grant !== null && GRANTS.includes(grant) ? (grant as GrantOutcome) : null,
    };
  });

  useEffect(() => {
    let live = true;
    void fetchSession().then((user) => {
      if (!live) return;
      setSession(user ? { status: "signed-in", user } : { status: "signed-out", ended: false });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    // Drop the query string once it has been read, so a refresh does not replay
    // the message and a copied link does not carry someone else's arrival.
    if (FLAGS.some((flag) => params.has(flag))) router.replace("/");
  }, [params, router]);

  // Stable, because every dashboard read takes it as an effect dependency.
  const onSessionLost = useCallback(() => setSession({ status: "signed-out", ended: true }), []);

  async function signOut() {
    try {
      await requestJson<void>(api.signOut, { method: "POST" });
    } catch {
      // The screen signs out regardless. If the call did not land, the cookie
      // is still valid and a reload shows the dashboard again, which is the
      // truth rather than a pretence that needs undoing.
    }
    setSession({ status: "signed-out", ended: false });
  }

  if (session.status === "checking") return <Checking />;
  if (session.status === "signed-out") return <SignIn sessionEnded={session.ended} />;
  return (
    <Dashboard
      user={session.user}
      grant={arrival.grant}
      returning={arrival.returning}
      onSignOut={signOut}
      onSessionLost={onSessionLost}
    />
  );
}
