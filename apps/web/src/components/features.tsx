import { Section } from "@/components/ui/section";
import {
  Bolt,
  Chart,
  Flame,
  GitHub,
  Plug,
  Server,
  Sparkle,
  Target,
  Trophy,
} from "@/components/ui/icons";

const features = [
  {
    icon: GitHub,
    title: "GitHub login",
    body: "OAuth for identity, a GitHub App for activity. Two grants, deliberately separate — no member ever hands over code access.",
  },
  {
    icon: Bolt,
    title: "Real-time tracking",
    body: "Webhooks, not polling. A merge shows up in the feed before you have closed the tab.",
  },
  {
    icon: Trophy,
    title: "Leaderboards",
    body: "Weekly, monthly and all-time, with rank movement so you can see who is climbing, not just who is ahead.",
  },
  {
    icon: Sparkle,
    title: "Achievements",
    body: "First Merge, Review Machine, Top Reviewer, Weekly #1. Define your own on paid plans.",
  },
  {
    icon: Flame,
    title: "Streaks and achievements",
    body: "Consecutive days with scoring activity, and milestones worth recognising. Weekends don't break a streak.",
  },
  {
    icon: Target,
    title: "Challenges",
    body: "Time-boxed team goals. “No pull request waits more than 24 hours” beats nagging in standup.",
  },
  {
    icon: Chart,
    title: "Team insights",
    body: "Where reviews pile up, who is carrying them, and which repositories nobody is looking at.",
  },
  {
    icon: Server,
    title: "Self-hosting",
    body: "Docker Compose, your infrastructure, your GitHub credentials. No license key, no phone-home.",
  },
  {
    icon: Plug,
    title: "API and integrations",
    body: "REST API, outgoing webhooks and exports. Slack, Discord, Linear and Jira on paid plans.",
  },
];

export function Features() {
  return (
    <Section
      id="features"
      eyebrow="Features"
      title="Built for the way engineers actually work."
      lead="Every feature exists to answer one question: who is moving this team forward? Anything that did not help answer it did not get built."
    >
      <div className="border-line bg-line rounded-card grid gap-px overflow-hidden border sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <article key={f.title} className="bg-surface/60 group flex flex-col gap-3 p-6">
            <f.icon className="text-ink-faint group-hover:text-accent h-5 w-5 transition-colors" />
            <h3 className="text-[0.95rem] font-semibold tracking-tight">{f.title}</h3>
            <p className="text-ink-dim text-sm leading-relaxed">{f.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
