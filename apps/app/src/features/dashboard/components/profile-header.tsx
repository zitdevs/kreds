import { ActionButton } from "@kreds/ui";

interface ProfileHeaderProps {
  readonly displayName: string;
  readonly login: string;
  readonly avatarUrl: string | null;
  readonly onSignOut: () => void;
}

/** Who is signed in, and the way out. */
export function ProfileHeader({ displayName, login, avatarUrl, onSignOut }: ProfileHeaderProps) {
  return (
    <header className="flex items-center gap-4">
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- one avatar
           from GitHub's CDN at a fixed size. next/image would need a remote
           host allowlist and a loader for no gain at 56 pixels. */
        <img
          src={avatarUrl}
          alt=""
          width={56}
          height={56}
          className="border-line size-14 shrink-0 rounded-full border"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
          {displayName}
        </h1>
        <p className="text-ink-dim truncate font-mono text-sm">@{login}</p>
      </div>
      <ActionButton variant="ghost" onClick={onSignOut} className="shrink-0">
        Sign out
      </ActionButton>
    </header>
  );
}
