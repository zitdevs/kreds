/**
 * `next/link` stand-in for design-sync builds.
 *
 * Every @kreds/ui component that links uses `next/link`. Outside a Next
 * runtime that module pulls in the client router, which reads `process.env`
 * and expects an app-router context, and neither exists in Claude Design, so the
 * real module throws "process is not defined" before anything renders.
 *
 * What Link ultimately renders is an anchor, so this shim renders the anchor
 * and drops the navigation-only props. It substitutes the framework, never a
 * design-system component: Button, Brand, SiteHeader and SiteFooter are still
 * the repo's own shipped code.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

type Href = string | { pathname?: string; query?: unknown; hash?: string };

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href;
  children?: ReactNode;
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
};

function toHref(href: Href): string {
  if (typeof href === "string") return href;
  return `${href?.pathname ?? ""}${href?.hash ?? ""}` || "#";
}

export default function Link({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  locale: _locale,
  ...rest
}: LinkProps) {
  return (
    <a href={toHref(href)} {...rest}>
      {children}
    </a>
  );
}
