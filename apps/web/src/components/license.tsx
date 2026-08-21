import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Check, Cross } from "@/components/ui/icons";
import { links } from "@/lib/site";

const allowed = [
  "View, fork and study the source",
  "Self-host it — laptop, VPS, your own cloud",
  "Use it inside your company, at any size, in production",
  "Modify it for your own needs",
  "Contribute changes back",
];

const notAllowed = [
  "Resell it as a competing hosted product",
  "Monetize a hosted version without permission",
];

export function License() {
  return (
    <Section
      id="license"
      eyebrow="Licensing"
      title="Source-available. We won't call it open source."
      lead="Kreds is licensed under the Business Source License 1.1 — the same one Sentry, Cal.com and CockroachDB use. It does not meet the OSI definition, and pretending otherwise would be the first dishonest thing on this page."
    >
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <div className="border-line bg-line rounded-card grid gap-px overflow-hidden border sm:grid-cols-2">
          <div className="bg-surface/60 p-6">
            <h3 className="text-accent font-mono text-xs uppercase tracking-[0.14em]">You can</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {allowed.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <Check className="text-accent mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-ink-dim leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface/60 p-6">
            <h3 className="text-danger font-mono text-xs uppercase tracking-[0.14em]">
              You can&rsquo;t
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {notAllowed.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <Cross className="text-danger mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-ink-dim leading-snug">{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink-faint mt-6 text-xs leading-relaxed">
              The line is whether you are serving your own organization or selling to third parties.
              Running Kreds for a client as part of consulting work is fine. Launching
              &ldquo;managed Kreds hosting&rdquo; is not.
            </p>
          </div>
        </div>

        <div className="border-line bg-surface/50 rounded-card flex flex-col gap-5 border p-6">
          <div>
            <h3 className="text-[0.95rem] font-semibold tracking-tight">
              It becomes Apache 2.0 on a fixed date
            </h3>
            <p className="text-ink-dim mt-2.5 text-sm leading-relaxed">
              Every released version converts to the Apache License 2.0 four years after release.
              That is written into the license itself, not promised in a blog post we could walk
              back. Kreds only ever gets more permissive.
            </p>
          </div>

          <div className="border-line bg-bg flex items-center gap-4 rounded-lg border px-4 py-3 font-mono text-xs">
            <span className="text-ink-dim">v0.1.0</span>
            <span aria-hidden className="bg-line-strong h-px flex-1" />
            <span className="text-accent">Apache 2.0 · 2030-08-21</span>
          </div>

          <div>
            <h3 className="text-[0.95rem] font-semibold tracking-tight">Why not MIT?</h3>
            <p className="text-ink-dim mt-2.5 text-sm leading-relaxed">
              Because a permissive license lets a cloud provider host Kreds, sell it, and put
              nothing back — and there is no version of that story where the Community tier stays
              free. The BSL draws exactly one line and leaves everything else intact.
            </p>
          </div>

          <div className="border-line flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-sm">
            <Link href={links.license} className="text-accent py-1.5 hover:underline">
              Read the LICENSE
            </Link>
            <Link href={links.licenseDoc} className="text-accent py-1.5 hover:underline">
              Licensing FAQ
            </Link>
            <Link href={links.contact} className="text-ink-dim hover:text-ink transition-colors">
              Commercial license
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
