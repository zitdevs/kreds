import { KredSymbol } from "@kreds/ui";

/**
 * A KRED figure with its currency symbol.
 *
 * The symbol is an SVG sized to the cap height of the surrounding mono text,
 * so it is passed a px size rather than inheriting font-size. Colour of the
 * number comes from the parent; the symbol follows `tone`.
 */
export function KredAmount({
  value,
  tone = "ink",
  size = 13,
}: {
  readonly value: string;
  readonly tone?: "amber" | "ink";
  readonly size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <KredSymbol size={size} tone={tone} />
      {value}
    </span>
  );
}
