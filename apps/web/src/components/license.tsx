import Link from "next/link";
import { links } from "@/lib/site";
import { Check, Section } from "@kreds/ui";

const allowed = [
  "Read, fork and study every part of the system",
  "Self-host it, on your laptop or in production",
  "Use it commercially, in a company of any size",
  "Modify it however you like",
  "Sell services around it, including hosting it",
  "Contribute changes back",
];

const layers = [
  {
    name: "Kreds Core",
    tag: "AGPLv3",
    body: "Everything in the repository. GitHub integration, teams, contributions, leaderboards, a local economy with its own currency and ledger, self-hosting. A complete product on its own.",
    open: true,
  },
  {
    name: "Kreds Network Protocol",
    tag: "Public spec",
    body: "The boundary between the two. How an instance registers, signs events and talks to the Network. It describes how to communicate, not how the Network decides.",
    open: true,
  },
  {
    name: "Official Kreds Network",
    tag: "Private",
    body: "The shared global economy: Official KRED and its fixed supply, the Central Bank, global settlement, network identity, the risk systems. Separate infrastructure, not in the repository.",
    open: false,
  },
];

export function License() {
  return (
    <Section
      id="license"
      eyebrow="Licensing"
      title="Open source. Not the version of that word that means nothing."
      lead="Kreds Core is AGPLv3. Inspect it, fork it, self-host it, improve it, charge money for it. The Official Kreds Network is separate infrastructure, and that separation is the point rather than a catch."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="border-line bg-surface/60 rounded-card border p-6">
          <h3 className="text-accent font-mono text-xs tracking-[0.14em] uppercase">You can</h3>
          <ul className="mt-4 flex flex-col gap-3">
            {allowed.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm">
                <Check className="text-accent mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-ink-dim leading-snug">{item}</span>
              </li>
            ))}
          </ul>

          <div className="border-line mt-6 border-t pt-5">
            <h3 className="text-[0.95rem] font-semibold tracking-tight">The one obligation</h3>
            <p className="text-ink-dim mt-2.5 text-sm leading-relaxed">
              If you <span className="text-ink">modify</span> Kreds and offer that modified version
              as a service over a network, its users must be offered the source of your version. Run
              it unmodified, or modify it for your own team, and nothing changes for you.
            </p>
            <p className="text-ink-faint mt-3 text-sm leading-relaxed">
              AGPLv3 does not prohibit commercial use, and it does not stop you charging for
              hosting. Anyone who told you otherwise confused it with a non-commercial licence.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="border-line bg-surface/50 divide-line rounded-card flex flex-col divide-y border">
            {layers.map((layer) => (
              <div key={layer.name} className="flex flex-col gap-2 p-5">
                <div className="flex items-center gap-3">
                  <span className="text-[0.95rem] font-semibold tracking-tight">{layer.name}</span>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[0.65rem] ${
                      layer.open
                        ? "border-accent-deep bg-accent-wash text-accent"
                        : "border-line-strong text-ink-faint"
                    }`}
                  >
                    {layer.tag}
                  </span>
                </div>
                <p className="text-ink-dim text-sm leading-relaxed">{layer.body}</p>
              </div>
            ))}
          </div>

          <p className="text-ink-dim text-sm leading-relaxed">
            The Network is not the good parts held back. It is the part that only exists because the
            economy is shared, and whose anti-abuse rules stop working the moment they are public. A
            self-hosted Kreds runs a complete economy without ever talking to kreds.sh.
          </p>

          <div className="border-line flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-sm">
            <Link href={links.github} className="text-accent py-1.5 hover:underline">
              View source
            </Link>
            <Link href={links.license} className="text-accent py-1.5 hover:underline">
              Read the license
            </Link>
            <Link href={links.constitution} className="text-accent py-1.5 hover:underline">
              Economic Constitution
            </Link>
            <Link
              href={links.architecture}
              className="text-ink-dim hover:text-ink py-1.5 transition-colors"
            >
              Core vs Network
            </Link>
            <Link
              href={links.trademarks}
              className="text-ink-dim hover:text-ink py-1.5 transition-colors"
            >
              Trademarks
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
