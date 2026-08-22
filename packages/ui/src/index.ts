/**
 * The Kreds design system.
 *
 * Both kreds.sh and docs.kreds.sh render from here, so the two sites cannot
 * drift into two design languages. The tokens are CSS rather than TypeScript
 * because Tailwind v4 reads them directly:
 *
 * ```css
 * @import "tailwindcss";
 * @import "@kreds/ui/styles/tokens.css";
 * @source "../../../../packages/ui/src";
 * ```
 *
 * The `@source` line matters. Tailwind only generates the utilities it finds in
 * scanned files, and the components in this package live outside the app.
 */

export { KredSymbol, KredsMark, type KredSymbolProps, type KredsMarkProps } from "./brand";
export { Button } from "./button";
export { Eyebrow, Section } from "./section";
export {
  ArrowRight,
  Bolt,
  Book,
  Chart,
  Check,
  Chevron,
  Cross,
  Eye,
  Flame,
  GitHub,
  GitMerge,
  Heart,
  Plug,
  Server,
  Shield,
  Sparkle,
  Target,
  Terminal,
  Trophy,
  Users,
} from "./icons";
export {
  Brand,
  SiteFooter,
  SiteHeader,
  type FooterGroup,
  type NavItem,
  type SiteFooterProps,
  type SiteHeaderProps,
} from "./site-chrome";
