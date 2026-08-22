import Link from "next/link";
import { links, site } from "@/lib/site";
import { ArrowRight, Button, GitHub, Heart, Server } from "@kreds/ui";

const ledger = [
  { value: "+18.00", text: "api#128 merged", meta: "minted", accent: false },
  { value: "-12.00", text: "paid @mariel for her review", meta: "", accent: false },
  { value: "+11.76", text: "reviewed web#131", meta: "less 2% fee", accent: true },
  { value: "+34 pts", text: "contribution recorded", meta: "", accent: true },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* backdrop: grid field, faded out toward the edges, with one soft glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="grid-field absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_20%,transparent_75%)] opacity-60" />
        <div className="animate-sheen absolute top-[-18rem] left-1/2 h-[34rem] w-[54rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#5ee9a4_0%,transparent_62%)] opacity-[0.13] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-16 sm:px-8 sm:pt-28 sm:pb-24">
        <div className="animate-rise mx-auto max-w-3xl text-center">
          <Link
            href={links.license}
            className="border-line bg-surface/70 text-ink-dim hover:border-line-strong hover:text-ink inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs transition-colors"
          >
            <span className="bg-accent h-1.5 w-1.5 rounded-full" aria-hidden />
            Open source · AGPLv3
          </Link>

          <h1 className="text-gradient mt-7 text-4xl font-semibold tracking-tight text-balance sm:text-6xl sm:leading-[1.05]">
            The leaderboard for your engineering team.
          </h1>

          <p className="text-ink-dim mx-auto mt-6 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
            Merging a pull request <span className="text-ink">creates</span> KRED. Getting it
            reviewed <span className="text-ink">costs</span> you some, paid to whoever reviewed it.
            An economy where helping someone ship is the way to get ahead.
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

        {/* the award ledger: one line per thing that happened */}
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
            Double-entry, always. Every movement is a row you can click through to the pull request.
          </p>
        </div>
      </div>
    </section>
  );
}
