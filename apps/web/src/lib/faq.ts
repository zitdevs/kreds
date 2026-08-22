/**
 * Single source for the FAQ.
 *
 * The FAQPage structured data in layout.tsx is generated from this exact
 * array. Google requires the marked-up answers to match what a visitor can
 * actually see on the page. Keeping one copy makes that true by
 * construction rather than by discipline.
 */
export type Faq = { q: string; a: string };

export const faqs: Faq[] = [
  {
    q: "Is Kreds open source?",
    a: "Yes. Kreds Core is licensed under AGPLv3, which is an OSI-approved open source license. Not source-available, not open-core with the interesting parts removed. The repository is the whole product.",
  },
  {
    q: "Can I use Kreds commercially?",
    a: "Yes. AGPLv3 permits commercial use, and your company can self-host it at any size without asking anyone. You can also charge money for services around it, including hosting it for other people.",
  },
  {
    q: "Can I modify Kreds and offer it as a service?",
    a: "Yes, subject to AGPLv3. The one obligation the license adds is this: if people interact with your modified version over a network, they have to be offered the corresponding source of that modified version. Run it unmodified and nothing changes. Modify it for your own team and nothing changes either, because your team is not a third party being served over a network.",
  },
  {
    q: "Is the Official Kreds Network open source?",
    a: "No. The Official Kreds Network is separate, proprietary infrastructure: the Official KRED ledger and its fixed supply, the Central Bank, global settlement, network identity and the risk systems. A shared economy needs one authoritative ledger, and anti-abuse rules stop working when they are published. Everything that does not require a shared network is open.",
  },
  {
    q: "Does self-hosted Kreds need kreds.sh?",
    a: "No. A self-hosted instance is independent by default. It runs its own economy, its own currency, its own supply, its own treasury and its own monetary policy, with no dependency on kreds.sh and no automatic participation in the Official Network.",
  },
  {
    q: "Can a self-hosted instance join the Network later?",
    a: "That is what the Kreds Network protocol is for. Joining can bring Official KRED, network identity, official settlement and participation in the global economy, and it requires meeting the Network's integrity requirements. Joining preserves history rather than resetting balances.",
  },
  {
    q: "Can I self-host Kreds?",
    a: "Yes, free, at any team size, forever. Docker Compose with Postgres and Redis is in the repository, and the whole product is in the box, and nothing is held back to push you onto a paid plan. You bring your own GitHub App credentials, so your events never leave your infrastructure.",
  },
  {
    q: "Can I use it inside my company?",
    a: "Yes. Internal use is expressly granted, including in production and at any headcount, and including running it for several teams inside the same organization. Running it for a client as part of consulting work you do for them is fine too.",
  },
  {
    q: "Can I create a hosted competitor with it?",
    a: "No. That is the single thing the license forbids. You cannot offer Kreds to third parties on a hosted or embedded basis in order to compete with our paid version, and you cannot sell managed Kreds hosting without a commercial agreement. If that is what you want to build, email us; the conversation is welcome rather than a trap.",
  },
  {
    q: "Is Kreds free for open-source projects?",
    a: "Yes. If your project is public and non-commercial, the hosted Team tier is free permanently, not a discount that expires. Open an issue with a link to your organization and we will enable it.",
  },
  {
    q: "What integrations are planned?",
    a: "Slack and Discord first, so a weekly recap lands where your team already talks. Linear and Jira after that, so issue work counts alongside GitHub activity. Both are on the paid tiers. The roadmap lives in GitHub Discussions and it moves based on what people actually ask for.",
  },
  {
    q: "Does Kreds read our source code?",
    a: "No. The GitHub App asks for read access to metadata, pull requests and issues, never file contents. It receives pull_request, pull_request_review and issues webhooks, which carry titles, authors and states. That is everything Kreds needs to score.",
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
