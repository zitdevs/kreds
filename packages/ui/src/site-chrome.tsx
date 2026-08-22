import Link from "next/link";
import type { ReactNode } from "react";

import { GitHub } from "./icons";

export interface NavItem {
  readonly label: string;
  readonly href: string;
}

export interface FooterGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/**
 * The wordmark.
 *
 * `href` is a prop because the two sites point it at different places: on the
 * marketing site it is the page you are already on, and on the documentation
 * site it is the way back out.
 */
export function Brand({ href = "/", label = "Kreds" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label={`${label} home`}>
      <span aria-hidden className="text-accent text-lg leading-none">
        &#8227;
      </span>
      <span className="text-[0.95rem] font-semibold tracking-tight">{label}</span>
    </Link>
  );
}

export interface SiteHeaderProps {
  readonly items: readonly NavItem[];
  readonly githubUrl: string;
  readonly brandHref?: string;
  /** Rendered at the right edge. A call to action on marketing, a search box later on docs. */
  readonly action?: ReactNode;
  /** Shown next to the wordmark, so a reader always knows which surface they are on. */
  readonly badge?: string;
}

export function SiteHeader({ items, githubUrl, brandHref, action, badge }: SiteHeaderProps) {
  return (
    <header className="border-line bg-bg/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:gap-8 sm:px-8"
      >
        <div className="flex items-center gap-2.5">
          <Brand {...(brandHref ? { href: brandHref } : {})} />
          {badge ? (
            <span className="border-line text-ink-faint hidden rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide sm:inline">
              {badge}
            </span>
          ) : null}
        </div>

        <ul className="hidden items-center gap-7 md:flex">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-ink-dim hover:text-ink text-sm transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={githubUrl}
            className="text-ink-dim hover:text-ink hover:border-line-strong border-line hidden h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors sm:inline-flex"
          >
            <GitHub className="h-4 w-4" />
            <span className="hidden lg:inline">GitHub</span>
          </Link>
          {action}
        </div>
      </nav>
    </header>
  );
}

export interface SiteFooterProps {
  readonly groups: readonly FooterGroup[];
  readonly tagline: string;
  readonly githubUrl: string;
  readonly githubLabel: string;
  readonly author: string;
  readonly authorUrl: string;
  readonly domain: string;
  readonly licenseHref: string;
  readonly brandHref?: string;
}

export function SiteFooter({
  groups,
  tagline,
  githubUrl,
  githubLabel,
  author,
  authorUrl,
  domain,
  licenseHref,
  brandHref,
}: SiteFooterProps) {
  return (
    <footer className="border-line border-t">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Brand {...(brandHref ? { href: brandHref } : {})} />
            <p className="text-ink-dim mt-3.5 max-w-xs text-sm leading-relaxed">{tagline}</p>
            <Link
              href={githubUrl}
              className="text-ink-faint hover:text-ink mt-5 inline-flex items-center gap-2 text-sm transition-colors"
            >
              <GitHub className="h-4 w-4" />
              {githubLabel}
            </Link>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-ink-faint font-mono text-xs uppercase tracking-[0.12em]">
                {group.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-ink-dim hover:text-ink text-sm transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-line text-ink-faint mt-12 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            Built and maintained by{" "}
            <Link href={authorUrl} className="text-ink-dim hover:text-ink transition-colors">
              {author}
            </Link>
            {" · "}
            <span className="font-mono">{domain}</span>
          </p>
          <p>
            Kreds Core is{" "}
            <Link href={licenseHref} className="text-ink-dim hover:text-ink transition-colors">
              AGPLv3
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
