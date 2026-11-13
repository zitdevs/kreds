import { Button, GitHub } from "@kreds/ui";

import { Notice } from "@/components/notice";
import { api } from "@/lib/site";

/**
 * The signed-out view. Presentational: whether anyone is signed in is decided
 * by `Home`, which owns the session.
 */
export function SignIn({ sessionEnded = false }: { sessionEnded?: boolean }) {
  return (
    <div className="max-w-md">
      {sessionEnded ? (
        <div role="status" className="mb-8">
          <Notice>Your session ended. Sign in again to pick up where you left off.</Notice>
        </div>
      ) : null}
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
