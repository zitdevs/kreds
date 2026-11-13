/**
 * What this board ranks, and what it does not.
 *
 * 12 and 24 describe two boards. This is the contribution one; the economy one
 * ranks KRED net position, and there is none to rank until KRED is issued, so
 * it is only named here, never drawn.
 */
export function LeaderboardIntro() {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Leaderboard</h1>
      <p className="text-ink-dim max-w-2xl text-sm leading-relaxed text-pretty sm:text-base">
        Everyone ranked by Contribution Points: recognition for verified work, such as merged pull
        requests and code reviews. People on the same total share a rank.
      </p>
      <p className="text-ink-dim max-w-2xl text-sm leading-relaxed text-pretty">
        Points are not currency. They cannot be spent, transferred or exchanged, and they never
        convert to KRED. A separate economy leaderboard, for KRED, comes once KRED is issued.
      </p>
    </header>
  );
}
