import { Section } from "@kreds/ui";

const Card = ({ title, body }: { title: string; body: string }) => (
  <div className="border-line bg-surface rounded-card border p-5">
    <h3 className="text-ink text-sm font-semibold">{title}</h3>
    <p className="text-ink-dim mt-2 text-sm leading-relaxed">{body}</p>
  </div>
);

export const WithEyebrowAndLead = () => (
  <Section
    eyebrow="How it works"
    title="Merged work becomes a leaderboard."
    lead="Kreds reads the events your team already produces (merged pull requests, code reviews, closed issues) and turns them into a standing that everybody can see."
  >
    <div className="grid gap-4 sm:grid-cols-3">
      <Card
        title="Connect the repo"
        body="One GitHub App install. No CI changes, no new workflow to learn."
      />
      <Card
        title="Work as usual"
        body="Every merge and review is scored the moment GitHub reports it."
      />
      <Card
        title="Read the board"
        body="A live standing, weighted so helping other people ship wins."
      />
    </div>
  </Section>
);

export const Centered = () => (
  <Section
    centered
    eyebrow="Pricing"
    title="Free while it is small."
    lead="Kreds is AGPLv3 and self-hostable. The hosted plan exists so you do not have to run it yourself."
  >
    <p className="text-ink-faint mx-auto max-w-md text-center text-sm">
      No card required for the Community tier.
    </p>
  </Section>
);

export const TitleOnly = () => (
  <Section title="Questions people actually ask.">
    <p className="text-ink-dim max-w-2xl text-sm leading-relaxed">
      The heading block collapses to just the title when there is no eyebrow or lead, so a dense
      section does not carry decoration it has not earned.
    </p>
  </Section>
);
