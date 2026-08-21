import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, GitHub, Heart, Server } from "@/components/ui/icons";
import { links, site } from "@/lib/site";

const ledger = [
  { value: "+25", text: "PR #128 merged", meta: "api", accent: true },
  { value: "+15", text: "Review on PR #131", meta: "web" },
  { value: "+10", text: "PR #127 approved", meta: "web" },
  { value: "+50", text: "5-day streak", meta: "" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* backdrop: grid field, faded out toward the edges, with one soft glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="grid-field absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_20%,transparent_75%)]" />
        <div className="animate-sheen absolute left-1/2 top-[-18rem] h-[34rem] w-[54rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#5ee9a4_0%,transparent_62%)] opacity-[0.13] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pb-24 sm:pt-28">
        <div className="animate-rise mx-auto max-w-3xl text-center">
          <Link
            href={links.license}
            className="border-line bg-surface/70 text-ink-dim hover:border-line-strong hover:text-ink inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs transition-colors"
          >
            <span className="bg-accent h-1.5 w-1.5 rounded-full" aria-hidden />
            Source-available · BSL 1.1
          </Link>

          <h1 className="text-gradient mt-7 text-balance text-4xl font-semibold tracking-tight sm:text-6xl sm:leading-[1.05]">
            The leaderboard for your engineering team.
          </h1>

          <p className="text-ink-dim mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed sm:text-lg">
            Kreds turns merged pull requests, reviews and closed issues into a live leaderboard.
            Weighted so that <span className="text-ink">helping someone ship</span> beats shipping
            alone.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button href="https://kreds.sh/signup" size="lg">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href={links.github} variant="secondary" size="lg">
              <GitHub className="h-4 w-4" />
              View on GitHub
            </Button>
          </div>

          <div className="text-ink-faint mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link
              href="#self-hosting"
              className="hover:text-ink-dim inline-flex items-center gap-1.5 py-1.5 transition-colors"
            >
              <Server className="h-3.5 w-3.5" />
              Self-host it
            </Link>
            <Link
              href="#sponsor"
              className="hover:text-ink-dim inline-flex items-center gap-1.5 py-1.5 transition-colors"
            >
              <Heart className="h-3.5 w-3.5" />
              Sponsor the project
            </Link>
            <span className="font-mono text-xs">{site.domain}</span>
          </div>
        </div>

        {/* the award ledger — one line per thing that happened */}
        <div className="animate-rise mx-auto mt-16 max-w-lg [animation-delay:120ms]">
          <div className="border-line bg-surface/60 rounded-card border p-2 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="border-line flex items-center gap-2 border-b px-3 py-2">
              <span className="bg-line-strong h-2 w-2 rounded-full" aria-hidden />
              <span className="text-ink-faint font-mono text-[0.7rem]">kreds ledger --tail</span>
            </div>
            <ul className="divide-line divide-y">
              {ledger.map((row) => (
                <li
                  key={row.text}
                  className="flex items-center gap-3 px-3 py-2.5 font-mono text-sm"
                >
                  <span className={row.accent ? "text-accent w-10" : "text-amber w-10"}>
                    {row.value}
                  </span>
                  <span className="text-ink-dim flex-1 truncate">{row.text}</span>
                  {row.meta ? <span className="text-ink-faint text-xs">{row.meta}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-ink-faint mt-3 text-center text-xs">
            Every award is a row you can click through to the pull request.
          </p>
        </div>
      </div>
    </section>
  );
}
