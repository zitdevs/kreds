"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, GitHub } from "@kreds/ui";

import { fetchSession, type SessionUser } from "@/lib/session";
import { api, site } from "@/lib/site";

type Welcome = "new" | "returning" | null;

/**
 * The whole product, for now: sign in, and see who you are.
 *
 * A client component because the session lives in a cookie on the API's origin
 * and is read from the browser. Rendering it on the server would mean
 * forwarding the cookie through, which buys nothing while the only thing on
 * screen is the person's own name.
 *
 * `useSearchParams` suspends during static rendering, so the boundary is not
 * optional decoration: without it the whole route opts out of prerendering.
 */
export function SignIn() {
  return (
    <Suspense fallback={<Checking />}>
      <SignInInner />
    </Suspense>
  );
}

function Checking() {
  return <p className="text-ink-faint text-sm">Checking your session...</p>;
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  const flag = params.get("welcome");
  const welcome: Welcome = flag === "new" || flag === "returning" ? flag : null;

  useEffect(() => {
    let live = true;
    void fetchSession().then((session) => {
      if (!live) return;
      setUser(session);
      setChecked(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    // Drop the query string once it has been read, so a refresh does not replay
    // the welcome and a copied link does not carry someone else's arrival.
    if (params.has("welcome") || params.has("signin")) router.replace("/");
  }, [params, router]);

  async function signOut() {
    await fetch(api.signOut, { method: "POST", credentials: "include" });
    setUser(null);
  }

  if (!checked) return <Checking />;
  if (user) return <SignedIn user={user} welcome={welcome} onSignOut={signOut} />;
  return <SignedOut />;
}

function SignedOut() {
  return (
    <div className="max-w-md">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sign in to Kreds</h1>
      <p className="text-ink-dim mt-4 leading-relaxed">
        Kreds reads what your team already does on GitHub. Signing in tells us who you are, and
        nothing else: the grant asks for <code className="text-ink">read:user</code> and{" "}
        <code className="text-ink">read:org</code>, and never touches your code.
      </p>

      <Button href={api.signIn} size="lg" className="mt-8">
        <GitHub className="h-4 w-4" />
        Continue with GitHub
      </Button>

      <p className="text-ink-faint mt-6 text-sm leading-relaxed">
        Repository activity comes from a separate GitHub App that an admin installs once. You are
        not granting that here.
      </p>
    </div>
  );
}

function SignedIn({
  user,
  welcome,
  onSignOut,
}: {
  user: SessionUser;
  welcome: Welcome;
  onSignOut: () => void;
}) {
  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-4">
        {user.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- one avatar
             from GitHub's CDN at a fixed size. next/image would need a remote
             host allowlist and a loader for no gain at 56 pixels. */
          <img
            src={user.avatarUrl}
            alt=""
            width={56}
            height={56}
            className="border-line rounded-full border"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{user.displayName}</h1>
          <p className="text-ink-faint font-mono text-sm">@{user.login}</p>
        </div>
      </div>

      {welcome === "returning" ? (
        <p className="border-accent-deep bg-accent-wash text-ink-dim rounded-card mt-6 border-l-2 p-4 text-sm leading-relaxed">
          Kreds already knew this GitHub identity. Anything it did before you signed in stayed
          attached to it and came with you.
        </p>
      ) : null}

      <p className="text-ink-dim mt-6 leading-relaxed">
        You are signed in. There is nothing to score yet: Kreds starts counting once a GitHub App is
        installed on a repository, which is the next thing being built.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button href={site.docs} variant="secondary">
          Read the docs
        </Button>
        <button
          type="button"
          onClick={onSignOut}
          className="text-ink-dim hover:text-ink h-9 px-2 text-sm transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
