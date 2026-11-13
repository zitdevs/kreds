import { PUBLIC_ACTIVITY_CONSENT } from "@kreds/domain/activity-consent";
import { Button, GitHub } from "@kreds/ui";

import { Notice } from "@/components/notice";
import { api } from "@/lib/site";

/**
 * The signed-out view. Presentational: whether anyone is signed in is decided
 * by `Home`, which owns the session.
 *
 * Continuing is agreeing to the public-activity consent, so its text sits
 * directly above the button. The words come from `@kreds/domain`, the same
 * module the API takes the recorded version from, so what is shown here is
 * what the API records the person agreed to.
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
        Kreds reads the pull requests and reviews you already ship on GitHub. The grant asks for{" "}
        <code className="text-ink">read:user</code> and <code className="text-ink">read:org</code>,
        and never touches your code.
      </p>

      <p id="sign-in-consent" className="text-ink mt-8 text-sm leading-relaxed">
        {PUBLIC_ACTIVITY_CONSENT.text}
      </p>
      <Button href={api.signIn} size="lg" className="mt-4" aria-describedby="sign-in-consent">
        <GitHub className="h-4 w-4" />
        Continue with GitHub
      </Button>

      <p className="text-ink-faint mt-6 text-sm leading-relaxed">
        Private repositories are a separate choice you make from your dashboard, and nobody has to
        install anything.
      </p>
    </div>
  );
}
