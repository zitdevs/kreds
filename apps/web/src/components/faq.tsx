import { Section } from "@/components/ui/section";
import { Chevron } from "@/components/ui/icons";

const faqs = [
  {
    q: "Is Kreds open source?",
    a: "No, and we will not claim otherwise. Kreds is source-available under the Business Source License 1.1. The source is public, you can run it, modify it and contribute to it — but the license restricts one thing (offering it as a competing hosted service), and that restriction is what puts it outside the OSI definition. Each version becomes Apache 2.0 four years after release.",
  },
  {
    q: "Can I self-host Kreds?",
    a: "Yes, free, at any team size, forever. Docker Compose with Postgres and Redis is in the repository, and the whole product is in the box — nothing is held back to push you onto a paid plan. You bring your own GitHub App credentials, so your events never leave your infrastructure.",
  },
  {
    q: "Can I use it inside my company?",
    a: "Yes. Internal use is expressly granted, including in production and at any headcount, and including running it for several teams inside the same organization. Running it for a client as part of consulting work you do for them is fine too.",
  },
  {
    q: "Can I create a hosted competitor with it?",
    a: "No — that is the single thing the license forbids. You cannot offer Kreds to third parties on a hosted or embedded basis in order to compete with our paid version, and you cannot sell managed Kreds hosting without a commercial agreement. If that is what you want to build, email us; the conversation is welcome rather than a trap.",
  },
  {
    q: "Is Kreds free for open-source projects?",
    a: "Yes. If your project is public and non-commercial, the hosted Team tier is free permanently — not a discount that expires. Open an issue with a link to your organization and we will enable it.",
  },
  {
    q: "What integrations are planned?",
    a: "Slack and Discord first, so a weekly recap lands where your team already talks. Linear and Jira after that, so issue work counts alongside GitHub activity. Both are on the paid tiers. The roadmap lives in GitHub Discussions and it moves based on what people actually ask for.",
  },
  {
    q: "Does Kreds read our source code?",
    a: "No. The GitHub App asks for read access to metadata, pull requests and issues — never file contents. It receives pull_request, pull_request_review and issues webhooks, which carry titles, authors and states. That is everything Kreds needs to score.",
  },
  {
    q: "Will a redelivered webhook award Kreds twice?",
    a: "No. Every award is keyed on the event type, the GitHub node id and the recipient, with a unique index behind it, so a replayed delivery collides and is dropped. GitHub redelivers more often than people expect, so this was built in from the first commit rather than patched in after someone noticed a doubled score.",
  },
  {
    q: "What happens if an admin changes the Kreds values?",
    a: "Past awards keep the amount they were granted with. Rule changes only affect future awards, so a leaderboard never silently rewrites itself when someone edits a setting. Each award in the ledger shows the value it was granted with.",
  },
];

export function Faq() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title="The questions people actually ask."
      lead="Including the awkward ones. If something here is still unclear, open a discussion and we will answer it in public."
    >
      <div className="border-line divide-line rounded-card mx-auto max-w-3xl divide-y overflow-hidden border">
        {faqs.map((item) => (
          <details key={item.q} className="bg-surface/50 group">
            <summary className="hover:text-accent flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[0.95rem] font-medium transition-colors">
              {item.q}
              <Chevron className="text-ink-faint h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="text-ink-dim px-6 pb-5 text-sm leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
