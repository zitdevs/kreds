import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Book, GitHub, Target, Users } from "@/components/ui/icons";
import { links } from "@/lib/site";

const cards = [
  {
    icon: GitHub,
    title: "Contributions welcome",
    body: "Bug reports, docs fixes, new achievement ideas, integrations. No CLA, we only ask that what you send is yours to send.",
    href: links.contributing,
    cta: "Read the contributing guide",
  },
  {
    icon: Target,
    title: "Start somewhere small",
    body: "Issues labelled good first issue are scoped small on purpose, with the context you need already written down.",
    href: links.goodFirstIssue,
    cta: "Browse good first issues",
  },
  {
    icon: Users,
    title: "Built in the open",
    body: "Roadmap, design decisions and the trade-offs behind them all live in Discussions. Disagree in public. That is the point.",
    href: links.discussions,
    cta: "Join the discussion",
  },
  {
    icon: Book,
    title: "Docs, not a teaser",
    body: "Self-hosting, scoring rules and licensing are documented properly, including the parts that are annoying.",
    href: links.docs,
    cta: "Read the docs",
  },
];

export function Community() {
  return (
    <Section
      eyebrow="Community"
      title="Source-available, still community-first."
      lead="A restricted license is not an excuse for a closed process. Issues, roadmap and reasoning are public, and open-source teams get the paid tier for free."
    >
      <div className="border-line bg-line rounded-card grid gap-px overflow-hidden border sm:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="bg-surface/60 flex flex-col gap-3 p-6">
            <card.icon className="text-accent h-5 w-5" />
            <h3 className="text-[0.95rem] font-semibold tracking-tight">{card.title}</h3>
            <p className="text-ink-dim text-sm leading-relaxed">{card.body}</p>
            <Link
              href={card.href}
              className="text-accent mt-1 inline-block py-1.5 text-sm font-medium hover:underline"
            >
              {card.cta} &rarr;
            </Link>
          </article>
        ))}
      </div>
    </Section>
  );
}
