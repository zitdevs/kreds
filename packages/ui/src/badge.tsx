import type { ComponentProps } from "react";

type Tone = "neutral" | "accent" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-line-strong text-ink-dim",
  accent: "border-accent-deep/60 bg-accent-wash text-accent",
  danger: "border-danger/40 text-danger",
};

type Props = ComponentProps<"span"> & { tone?: Tone };

/**
 * A short label that qualifies the thing next to it: "Private", "App".
 *
 * Text, never colour alone, carries the meaning, so the tone is a reinforcement
 * a reader who cannot tell the colours apart loses nothing by missing.
 */
export function Badge({ tone = "neutral", className = "", ...props }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] leading-none tracking-wide whitespace-nowrap uppercase ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
