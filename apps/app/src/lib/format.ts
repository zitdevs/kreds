/**
 * Display formatting, pinned to English because the UI copy is English. A
 * reader's locale would give "1.234" next to a sentence that reads "1,234".
 */

const numbers = new Intl.NumberFormat("en-US");
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Largest first. Anything under a minute is "just now". */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function formatNumber(value: number): string {
  return numbers.format(value);
}

/** "3 days ago", "yesterday", "just now". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** The exact moment, for a tooltip or a screen reader next to a relative date. */
export function formatAbsolute(iso: string): string {
  return absolute.format(new Date(iso));
}
