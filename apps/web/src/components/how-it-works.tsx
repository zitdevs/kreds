import { GitHub, Plug, Section, Terminal, Trophy } from "@kreds/ui";
const steps = [
  {
    icon: GitHub,
    title: "Sign in with GitHub",
    body: "One click. Kreds asks for your handle and which organizations you belong to. It never asks for your code.",
  },
  {
    icon: Plug,
    title: "Connect your team and repos",
    body: "An admin installs the Kreds GitHub App once and picks which repositories count. Everything else stays invisible.",
  },
  {
    icon: Terminal,
    title: "Earn Kreds from real contributions",
    body: "Merges, reviews, approvals, closed issues and streaks. Awarded automatically as the webhooks arrive.",
  },
  {
    icon: Trophy,
    title: "Compete on the leaderboard",
    body: "Weekly, monthly and all-time. Open it on a Friday and see who actually carried the week.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="Four steps, then it runs itself."
      lead="No bot to configure, no standup ritual to add, nothing for your team to remember. Kreds reads what GitHub already knows."
    >
      <ol className="border-line bg-line rounded-card grid gap-px overflow-hidden border sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li key={step.title} className="bg-surface/60 flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3">
              <span className="border-line-strong bg-bg text-accent flex h-9 w-9 items-center justify-center rounded-lg border">
                <step.icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-ink-faint font-mono text-xs">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="text-[0.95rem] font-semibold tracking-tight">{step.title}</h3>
            <p className="text-ink-dim text-sm leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
