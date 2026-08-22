import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-accent font-mono text-xs tracking-[0.14em] uppercase">{children}</span>
  );
}

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  /** Centre the heading block. Left-aligned reads better for dense sections. */
  centered?: boolean;
  className?: string;
};

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  centered = false,
  className = "",
}: SectionProps) {
  return (
    <section id={id} className={`border-line border-t py-20 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className={`max-w-2xl ${centered ? "mx-auto text-center" : ""}`}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h2>
          {lead ? (
            <p className="text-ink-dim mt-4 text-base leading-relaxed text-pretty">{lead}</p>
          ) : null}
        </div>
        <div className="mt-12 sm:mt-14">{children}</div>
      </div>
    </section>
  );
}
