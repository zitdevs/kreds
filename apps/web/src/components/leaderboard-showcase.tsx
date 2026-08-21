import { Section } from "@/components/ui/section";
import { feed, rows } from "@/lib/leaderboard-data";

function Move({ value }: { value: number }) {
  if (value === 0) return <span className="text-ink-faint text-[0.65rem]">&ndash;</span>;
  const up = value > 0;
  return (
    <span className={`text-[0.65rem] ${up ? "text-accent" : "text-danger"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

export function LeaderboardShowcase() {
  return (
    <Section
      eyebrow="The board"
      title="Reviews are worth more than merges. On purpose."
      lead="A review is 15 Kreds and a merge is 25, so two reviews beat shipping alone. That single ratio is the whole opinion of the product."
    >
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* leaderboard */}
        <div className="border-line bg-surface/60 rounded-card overflow-hidden border">
          <div className="border-line flex items-center justify-between gap-4 border-b px-5 py-3.5">
            <span className="text-ink-faint font-mono text-xs">kreds board --all-time</span>
            <div className="flex gap-1.5 font-mono text-[0.7rem]">
              <span className="text-ink-faint border-line rounded border px-2 py-1">weekly</span>
              <span className="text-ink-faint border-line rounded border px-2 py-1">monthly</span>
              <span className="text-accent border-accent-deep bg-accent-wash rounded border px-2 py-1">
                all-time
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="border-line text-ink-faint border-b font-mono text-[0.65rem] uppercase tracking-wider">
                  <th scope="col" className="px-5 py-2.5 font-normal">
                    Rank
                  </th>
                  <th scope="col" className="py-2.5 font-normal">
                    Member
                  </th>
                  <th scope="col" className="py-2.5 text-right font-normal">
                    Kreds
                  </th>
                  <th scope="col" className="py-2.5 text-right font-normal">
                    PRs
                  </th>
                  <th scope="col" className="py-2.5 text-right font-normal">
                    Reviews
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right font-normal">
                    Week
                  </th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y text-sm">
                {rows.map((row) => (
                  <tr
                    key={row.member}
                    className={row.you ? "bg-accent-wash/60 border-accent border-l-2" : ""}
                  >
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <span
                          className={`font-mono font-semibold ${
                            row.rank === 1 ? "text-amber" : row.you ? "text-accent" : "text-ink-dim"
                          }`}
                        >
                          {String(row.rank).padStart(2, "0")}
                        </span>
                        <Move value={row.move} />
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="bg-line-strong h-5 w-5 shrink-0 rounded-[3px]"
                        />
                        <span className={row.you ? "font-semibold" : ""}>{row.member}</span>
                        {row.you ? (
                          <span className="text-accent font-mono text-[0.65rem]">&lt;you&gt;</span>
                        ) : null}
                      </span>
                    </td>
                    <td
                      className={`py-3 text-right font-mono font-semibold ${
                        row.rank === 1 ? "text-amber" : row.you ? "text-accent" : ""
                      }`}
                    >
                      {row.kreds.toLocaleString("en-US")}
                    </td>
                    <td className="text-ink-dim py-3 text-right font-mono">{row.prs}</td>
                    <td
                      className={`py-3 text-right font-mono ${
                        row.reviews < 10 ? "text-danger" : "text-accent"
                      }`}
                    >
                      {row.reviews}
                    </td>
                    <td className="text-accent px-5 py-3 text-right font-mono">+{row.week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-line text-ink-dim border-t px-5 py-3.5 text-sm leading-relaxed">
            <span className="text-ink font-medium">dan-ships</span> has the second-most merged pull
            requests on this team and sits fifth &mdash; six reviews. The board rewards helping, not
            shipping alone.
          </p>
        </div>

        {/* activity feed */}
        <div className="border-line bg-surface/60 rounded-card overflow-hidden border">
          <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
            <span className="text-ink-faint font-mono text-xs">kreds feed --follow</span>
            <span className="text-accent flex items-center gap-1.5 font-mono text-[0.7rem]">
              <span className="bg-accent animate-sheen h-1.5 w-1.5 rounded-full" aria-hidden />
              live
            </span>
          </div>
          <ul className="divide-line divide-y">
            {feed.map((item) => (
              <li
                key={`${item.who}-${item.what}-${item.target}`}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <span
                  className={`w-8 shrink-0 font-mono text-sm font-semibold ${
                    item.value >= 50 ? "text-amber" : "text-accent"
                  }`}
                >
                  +{item.value}
                </span>
                <span className="text-ink-dim flex-1 truncate text-sm">
                  <span className="text-ink">{item.who}</span> {item.what}
                  {item.target ? <span className="text-ink"> {item.target}</span> : null}
                </span>
                <span className="text-ink-faint shrink-0 font-mono text-xs">{item.when}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
