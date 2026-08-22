import type { SVGProps } from "react";

/**
 * The two brand glyphs, and the rule that keeps them apart.
 *
 * `KredsMark` is the company. It goes in the header, the footer, the favicon,
 * avatars and docs, and it is never placed in front of a number.
 *
 * `KredSymbol` is the currency. It sits next to balances, transactions,
 * rewards and prices, the way `$` sits next to dollars, and it is never used
 * as a logo, favicon or lockup.
 *
 * Both are drawn on a 32 unit grid. Stroke width grows as the glyph shrinks so
 * the strokes stay legible at text sizes; the table is in `strokeFor`.
 */

type GlyphProps = Omit<SVGProps<SVGSVGElement>, "width" | "height" | "strokeWidth">;

interface Step {
  readonly minSize: number;
  readonly stroke: number;
}

/** Largest size first. The last row is the minimum legible size. */
const MARK_STROKES: readonly Step[] = [
  { minSize: 32, stroke: 2.4 },
  { minSize: 24, stroke: 2.6 },
  { minSize: 20, stroke: 2.8 },
  { minSize: 16, stroke: 3 },
];

const SYMBOL_STROKES: readonly Step[] = [
  { minSize: 32, stroke: 2.4 },
  { minSize: 20, stroke: 2.8 },
  { minSize: 18, stroke: 3 },
  { minSize: 13, stroke: 3.4 },
];

function strokeFor(table: readonly Step[], size: number): number {
  const step = table.find((row) => size >= row.minSize) ?? table[table.length - 1];
  return step?.stroke ?? 2.4;
}

const MARK_TONES = {
  accent: "text-accent",
  ink: "text-ink",
} as const;

const SYMBOL_TONES = {
  amber: "text-amber",
  ink: "text-ink-dim",
} as const;

function join(...classes: readonly (string | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export interface KredsMarkProps extends GlyphProps {
  /** Rendered box in px. Stroke width is derived from it. Minimum 16. */
  readonly size?: number;
  readonly tone?: keyof typeof MARK_TONES;
}

/** The Merge K. Brand identity only. */
export function KredsMark({ size = 32, tone = "accent", className, ...props }: KredsMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(MARK_STROKES, size)}
      strokeLinecap="round"
      aria-hidden="true"
      className={join(MARK_TONES[tone], "shrink-0", className)}
      {...props}
    >
      <path d="M9 3.5V12" />
      <path d="M9 20V28.5" />
      <path d="M24.5 4.5 11.73 13.97" />
      <path d="M11.73 18.03 24.5 27.5" />
      <circle cx="9" cy="16" r="3.4" />
    </svg>
  );
}

export interface KredSymbolProps extends GlyphProps {
  /**
   * Rendered box in px. Inline with text it matches the cap height of the
   * surrounding font: 13 for 13px mono, 18 for 20px, 24 for 26px. Minimum 13.
   */
  readonly size?: number;
  /** `amber` for primary balances, `ink` for secondary figures in running text. */
  readonly tone?: keyof typeof SYMBOL_TONES;
}

/** The $K. Currency symbol only, always next to an amount. */
export function KredSymbol({ size = 32, tone = "amber", className, ...props }: KredSymbolProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(SYMBOL_STROKES, size)}
      strokeLinecap="round"
      role="img"
      aria-label="KRED"
      className={join(SYMBOL_TONES[tone], "inline-block shrink-0 align-[-0.1em]", className)}
      {...props}
    >
      <path d="M9 1.5V12" />
      <path d="M9 20V30.5" />
      <path d="M24.5 6 11.73 14.1" />
      <path d="M11.73 17.9 24.5 26" />
      <circle cx="9" cy="16" r="3.4" />
    </svg>
  );
}
