import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Check, Heart } from "@/components/ui/icons";
import { plans } from "@/lib/pricing";
import { links } from "@/lib/site";

export function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Generous where it counts."
      lead="Self-hosting is free at any size, always. The hosted plans exist so you don't have to run it, and the Community tier is a real product, not a trial with a countdown."
    >
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-card relative flex flex-col border p-6 ${
              plan.featured
                ? "border-accent-deep bg-surface shadow-[0_0_0_1px_rgba(94,233,164,0.12),0_24px_60px_-24px_rgba(94,233,164,0.22)]"
                : "border-line bg-surface/50"
            }`}
          >
            {plan.featured ? (
              <span className="bg-accent absolute -top-2.5 left-6 rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[#04140c]">
                Most teams
              </span>
            ) : null}

            <h3 className="text-base font-semibold tracking-tight">{plan.name}</h3>

            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
              {plan.cadence ? <span className="text-ink-faint text-xs">{plan.cadence}</span> : null}
            </div>

            <p className="text-ink-dim mt-3 min-h-[2.5rem] text-sm leading-relaxed">{plan.blurb}</p>

            <Button
              href={plan.href}
              variant={plan.featured ? "primary" : "secondary"}
              className="mt-5 w-full"
            >
              {plan.cta}
            </Button>

            {plan.inherits ? (
              <p className="text-ink-faint mt-5 text-xs">
                Everything in <span className="text-ink-dim">{plan.inherits}</span>, plus:
              </p>
            ) : null}

            <ul className={`flex flex-col gap-2.5 ${plan.inherits ? "mt-3" : "mt-5"}`}>
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5 text-sm">
                  <Check className="text-accent mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="text-ink-dim leading-snug">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* the honest note: Growing undercuts Team past 26 seats and we say so */}
      <p className="text-ink-faint mt-6 text-center text-sm">
        Team is per-seat, Growing is flat. Past <span className="text-ink-dim">27 members</span>{" "}
        Growing is the cheaper of the two, and we would rather tell you than let you work it out on
        the invoice.
      </p>

      <div className="border-accent-deep bg-accent-wash rounded-card mt-10 flex flex-col items-start gap-4 border p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <Heart className="text-accent mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-[0.95rem] font-semibold tracking-tight">
              Free forever for open source
            </h3>
            <p className="text-ink-dim mt-1.5 text-sm leading-relaxed">
              If your project is public and non-commercial, the Team tier is yours at no cost.
              Permanently, not a discount that expires.
            </p>
          </div>
        </div>
        <Link
          href={`${links.issues}/new/choose`}
          className="text-accent shrink-0 py-1.5 text-sm font-medium hover:underline"
        >
          Claim it &rarr;
        </Link>
      </div>
    </Section>
  );
}
