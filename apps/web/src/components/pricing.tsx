import { Section } from "@kreds/ui";

/**
 * Hosted plans are not decided yet, so none are shown.
 *
 * The previous plan cards stay in `lib/pricing.ts` for when they are. Publishing
 * prices before they are settled would be a promise the product cannot keep.
 * Self-hosting is unaffected: it is free at any size, and that is stated
 * elsewhere on the page.
 */
export function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Coming soon."
      lead="Hosted plans are still being decided. Self-hosting is free at any size, and always will be."
    >
      <div className="border-line bg-surface/50 rounded-card flex flex-col items-center gap-2 border border-dashed p-10 text-center">
        <span className="border-line-strong text-ink-faint rounded-full border px-3 py-1 font-mono text-xs tracking-wide uppercase">
          Coming soon
        </span>
        <p className="text-ink-dim mt-2 max-w-md text-sm leading-relaxed">
          We will publish plans once they are settled, not before.
        </p>
      </div>
    </Section>
  );
}
