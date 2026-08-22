import { Section } from "@/components/ui/section";
import { contribution, economy, feed } from "@/lib/leaderboard-data";
import { minted, points, transferred, worthless } from "@/lib/site";

function Board({
  label,
  command,
  children,
}: {
  label: string;
  command: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-line bg-surface/60 rounded-card flex flex-col overflow-hidden border">
      <div className="border-line flex items-center justify-between gap-4 border-b px-5 py-3.5">
        <span className="text-ink text-sm font-medium">{label}</span>
        <span className="text-ink-faint font-mono text-xs">{command}</span>
      </div>
      {children}
    </div>
  );
}

export function LeaderboardShowcase() {
  return (
    <Section
      eyebrow="The boards"
      title="Two leaderboards, because they answer different questions."
      lead="One asks who is economically liquid. The other asks who is doing the work. They are allowed to disagree, and when they do, that is information rather than a problem."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Board label="Economy" command="kreds board --net">
          <ul className="divide-line divide-y">
            {economy.map((row) => (
              <li key={row.member} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span
                  className={`w-6 font-mono ${row.rank === 1 ? "text-amber" : "text-ink-faint"}`}
                >
                  {row.rank}
                </span>
                <span aria-hidden className="bg-line-strong h-5 w-5 shrink-0 rounded-[3px]" />
                <span className={`flex-1 truncate ${row.you ? "font-semibold" : ""}`}>
                  {row.member}
                </span>
                {row.inDebt ? (
                  <span className="border-danger/40 text-danger rounded border px-1.5 py-0.5 font-mono text-[0.6rem]">
                    in debt
                  </span>
                ) : null}
                <span
                  className={`w-24 text-right font-mono font-semibold ${
                    row.net < 0 ? "text-danger" : row.rank === 1 ? "text-amber" : "text-ink"
                  }`}
                >
                  {row.net > 0 ? "+" : ""}
                  {row.net.toLocaleString("en-US")} K
                </span>
              </li>
            ))}
          </ul>
          <p className="border-line text-ink-dim border-t px-5 py-3.5 text-xs leading-relaxed">
            Net position, not balance. A KRED balance is never negative.{" "}
            <span className="text-ink">dan-ships</span> holds zero and owes 204 K for review he has
            not funded yet.
          </p>
        </Board>

        <Board label="Contribution" command="kreds board --points">
          <ul className="divide-line divide-y">
            {contribution.map((row) => (
              <li key={row.member} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span
                  className={`w-6 font-mono ${row.rank === 1 ? "text-accent" : "text-ink-faint"}`}
                >
                  {row.rank}
                </span>
                <span aria-hidden className="bg-line-strong h-5 w-5 shrink-0 rounded-[3px]" />
                <span className={`flex-1 truncate ${row.you ? "font-semibold" : ""}`}>
                  {row.member}
                </span>
                <span
                  className={`w-24 text-right font-mono font-semibold ${
                    row.rank === 1 ? "text-accent" : "text-ink"
                  }`}
                >
                  {row.points.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-line text-ink-dim border-t px-5 py-3.5 text-xs leading-relaxed">
            Points are recognition, never currency. They are not spent, not transferred, and never
            convert to KRED in either direction.
          </p>
        </Board>
      </div>

      <div className="border-accent-deep bg-accent-wash rounded-card mt-5 border px-6 py-5">
        <p className="text-pretty text-sm leading-relaxed">
          <span className="text-ink font-medium">
            dan-ships leads contribution and trails the economy.
          </span>{" "}
          <span className="text-ink-dim">
            He ships more than anyone and reviews almost nothing, so he owes the people who reviewed
            him. Specialising is legitimate, and the deficit still has to be funded.
          </span>
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="border-line bg-surface/60 rounded-card border p-6">
          <h3 className="text-[0.95rem] font-semibold tracking-tight">How value moves</h3>

          <p className="text-accent mt-5 font-mono text-xs uppercase tracking-[0.14em]">Created</p>
          {minted.map((rule) => (
            <div key={rule.action} className="mt-2.5 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span>{rule.action}</span>
                <span className="text-amber shrink-0 font-mono">{rule.value}</span>
              </div>
              <span className="text-ink-faint text-xs">{rule.note}</span>
            </div>
          ))}

          <p className="text-accent mt-6 font-mono text-xs uppercase tracking-[0.14em]">
            Circulated
          </p>
          {transferred.map((rule) => (
            <div key={rule.action} className="mt-2.5 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span>{rule.action}</span>
                <span className="text-amber shrink-0 font-mono">{rule.value}</span>
              </div>
              <span className="text-ink-faint text-xs">{rule.note}</span>
            </div>
          ))}

          <p className="text-ink-dim border-line mt-6 border-t pt-4 text-xs leading-relaxed">
            Reviews move existing KRED rather than creating it. If they minted, two accounts
            reviewing each other would print supply forever. No quality bar survives that, because
            the attacker controls both sides.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="border-line bg-surface/60 rounded-card border p-6">
            <h3 className="text-[0.95rem] font-semibold tracking-tight">Contribution Points</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {points.map((p) => (
                <li key={p.action} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-ink-dim">{p.action}</span>
                  <span className="text-ink shrink-0 font-mono">{p.value}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-line bg-surface/50 rounded-card border p-6">
            <h3 className="text-ink-faint font-mono text-xs uppercase tracking-[0.14em]">
              Worth nothing, on purpose
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {worthless.map((item) => (
                <li key={item} className="text-ink-dim flex gap-2.5 text-sm leading-snug">
                  <span aria-hidden className="text-ink-faint font-mono">
                    0
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-line bg-surface/60 rounded-card mt-5 overflow-hidden border">
        <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
          <span className="text-ink-faint font-mono text-xs">kreds ledger --tail</span>
          <span className="text-accent flex items-center gap-1.5 font-mono text-[0.7rem]">
            <span className="bg-accent animate-sheen h-1.5 w-1.5 rounded-full" aria-hidden />
            live
          </span>
        </div>
        <ul className="divide-line divide-y">
          {feed.map((item) => (
            <li
              key={`${item.who}-${item.target}`}
              className="flex items-center gap-3 px-5 py-3.5 text-sm"
            >
              <span
                className={`w-24 shrink-0 font-mono font-semibold ${
                  item.zero
                    ? "text-ink-faint"
                    : item.value.startsWith("-")
                      ? "text-danger"
                      : item.mint
                        ? "text-amber"
                        : "text-accent"
                }`}
              >
                {item.value}
              </span>
              <span className="text-ink-dim flex-1 truncate">
                <span className="text-ink">{item.who}</span> {item.what}{" "}
                <span className="text-ink">{item.target}</span>
              </span>
              <span className="text-ink-faint shrink-0 font-mono text-xs">{item.when}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
