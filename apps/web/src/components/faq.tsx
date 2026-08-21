import { Section } from "@/components/ui/section";
import { Chevron } from "@/components/ui/icons";
import { faqs } from "@/lib/faq";

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
