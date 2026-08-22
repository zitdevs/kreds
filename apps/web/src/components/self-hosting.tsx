import { links } from "@/lib/site";
import { ArrowRight, Book, Button, Section, Server, Shield, Terminal } from "@kreds/ui";

const points = [
  {
    icon: Server,
    title: "Docker, and that's it",
    body: "Postgres and Redis are in the compose file. One command up, one command to upgrade.",
  },
  {
    icon: Shield,
    title: "Your GitHub credentials",
    body: "Your own OAuth App and GitHub App. Events go from GitHub to your server and stop there.",
  },
  {
    icon: Terminal,
    title: "Anywhere you like",
    body: "A laptop, a $5 VPS, your own Kubernetes. No license key, no seat check, no phone-home.",
  },
  {
    icon: Book,
    title: "Documentation included",
    body: "The real guide, not a teaser: App setup, upgrades, backups, proxies, and the errors we actually see.",
  },
];

export function SelfHosting() {
  return (
    <Section
      id="self-hosting"
      eyebrow="Self-hosting"
      title="Run an independent Kreds economy on your own infrastructure."
      lead="Self-host Kreds anywhere. Your instance runs its own currency, its own monetary policy, its own treasury and its own rules, with no dependency on kreds.sh and nothing held back to push you onto a hosted plan."
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <div className="border-line bg-line rounded-card grid gap-px overflow-hidden border sm:grid-cols-2">
          {points.map((p) => (
            <div key={p.title} className="bg-surface/60 flex flex-col gap-3 p-6">
              <p.icon className="text-accent h-5 w-5" />
              <h3 className="text-[0.95rem] font-semibold tracking-tight">{p.title}</h3>
              <p className="text-ink-dim text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="border-line bg-surface/60 rounded-card min-w-0 overflow-hidden border">
            <div className="border-line flex items-center gap-2 border-b px-4 py-2.5">
              <span className="bg-line-strong h-2 w-2 rounded-full" aria-hidden />
              <span className="text-ink-faint font-mono text-[0.7rem]">bash</span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[0.8rem] leading-6">
              <code>
                <span className="text-ink-faint"># clone, configure, run</span>
                {"\n"}
                <span className="text-accent">$</span> git clone
                https://github.com/zitdevs/kreds.git{"\n"}
                <span className="text-accent">$</span> cd kreds{"\n"}
                <span className="text-accent">$</span> cp .env.example .env{"\n"}
                <span className="text-accent">$</span> docker compose up -d{"\n"}
                {"\n"}
                <span className="text-ink-faint"># http://localhost:3000</span>
              </code>
            </pre>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button href={links.selfHosting} size="lg">
              Read the self-hosting guide
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href={links.github} variant="secondary" size="lg">
              Deploy it yourself
            </Button>
          </div>

          <p className="text-ink-dim text-sm leading-relaxed">
            An independent self-hosted economy does not automatically participate in the Official
            Kreds Network. Your currency is yours, and it is not Official KRED. Connecting later is
            an option through the Kreds Network protocol, never a requirement.
          </p>

          <p className="text-ink-faint text-sm leading-relaxed">
            One caveat we would rather say up front: GitHub has to reach your webhook endpoint, so a
            public HTTPS URL is required. For local development, a tunnel does the job.
          </p>
        </div>
      </div>
    </Section>
  );
}
