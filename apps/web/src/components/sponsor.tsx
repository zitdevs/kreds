import Link from "next/link";
import { links, site } from "@/lib/site";
import { ArrowRight, Button, Heart, Section } from "@kreds/ui";

/**
 * Only channels that actually exist. Adding another means one entry here and
 * one line in .github/FUNDING.yml, not a link that 404s on a launch day.
 */
const otherWays = [
  {
    name: "Star the repository",
    href: links.github,
    note: "The cheapest thing that genuinely helps",
  },
  { name: "File a real bug report", href: links.issues, note: "With a reproduction, ideally" },
  {
    name: "Contribute code or docs",
    href: links.contributing,
    note: "Good first issues are scoped small",
  },
];

export function Sponsor() {
  return (
    <Section
      id="sponsor"
      eyebrow="Sponsorship"
      title="If Kreds helps your team, help it keep going."
      lead="Sponsorship is what keeps the Community tier free and generous rather than a trial in disguise, and what pays for the hours that go into self-hosting support nobody is billing for."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="border-accent-deep bg-accent-wash rounded-card relative overflow-hidden border p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,#5ee9a4_0%,transparent_65%)] opacity-20 blur-2xl"
          />
          <Heart className="text-accent h-7 w-7" />
          <p className="mt-5 text-pretty text-lg leading-relaxed">
            Help us keep Kreds fast, useful and community-friendly.
          </p>
          <p className="text-ink-dim mt-3 text-sm leading-relaxed">
            Kreds is built and maintained by{" "}
            <Link href={site.authorUrl} className="text-accent hover:underline">
              {site.author}
            </Link>
            . Every sponsor is one more reason the free tier does not need to shrink.
          </p>
          <Button href={links.sponsors} size="lg" className="mt-6">
            Sponsor the project
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-ink-faint font-mono text-xs uppercase tracking-[0.12em]">
            Not in a position to sponsor?
          </h3>
          {otherWays.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="border-line bg-surface/50 hover:border-line-strong hover:bg-surface rounded-card group flex items-center justify-between gap-4 border px-5 py-4 transition-colors"
            >
              <span>
                <span className="block text-[0.95rem] font-medium">{c.name}</span>
                <span className="text-ink-faint block text-xs">{c.note}</span>
              </span>
              <ArrowRight className="text-ink-faint group-hover:text-accent h-4 w-4 shrink-0 transition-colors" />
            </Link>
          ))}
          <p className="text-ink-faint mt-2 text-sm leading-relaxed">
            Or tell us why Kreds did not work for your team. Honestly, that is worth real money too.
          </p>
        </div>
      </div>
    </Section>
  );
}
