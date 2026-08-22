import type { Metadata } from "next";
import Link from "next/link";

import { DocsShell } from "@/components/docs/docs-shell";
import { DOC_GROUPS, DOC_PAGES } from "@/lib/docs";
import { links, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "How Kreds works: self-hosting, the scoring rules, the economic constitution, and what the licence lets you do.",
  alternates: { canonical: "/docs" },
};

export default function DocsIndexPage() {
  return (
    <DocsShell>
      <header className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Documentation</h1>
        <p className="text-ink-dim mt-4 max-w-2xl text-base leading-relaxed">
          Every page here renders a markdown file from the {site.name} repository. Nothing is
          copied, so what you read on this site and what ships in the box are the same bytes.
        </p>
      </header>

      {DOC_GROUPS.map((group) => {
        const pages = DOC_PAGES.filter((page) => page.group === group);
        if (pages.length === 0) return null;
        return (
          <section key={group} className="mb-11">
            <h2 className="text-ink-faint mb-4 text-[0.7rem] font-semibold uppercase tracking-[0.14em]">
              {group}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {pages.map((page) => (
                <li key={page.slug} className="min-w-0">
                  <Link
                    href={`/docs/${page.slug}`}
                    className="border-line bg-surface/40 hover:border-line-strong hover:bg-surface rounded-card block h-full border p-4 transition-colors"
                  >
                    <span className="block font-medium">{page.title}</span>
                    <span className="text-ink-dim mt-1.5 block text-sm leading-relaxed">
                      {page.summary}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="border-line mt-14 border-t pt-8">
        <h2 className="text-base font-medium">Not here</h2>
        <p className="text-ink-dim mt-3 max-w-2xl text-sm leading-relaxed">
          Contributing, the code of conduct, security reporting and the changelog live in the
          repository, where GitHub gives them buttons and prompts that a documentation site cannot.
          Moving them would trade a working feature for a tidier list.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {[
            { label: "Contributing", href: links.contributing },
            { label: "Security", href: `${links.repoBlob}/SECURITY.md` },
            { label: "Code of conduct", href: `${links.repoBlob}/CODE_OF_CONDUCT.md` },
            { label: "Changelog", href: links.changelog },
          ].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                rel="noreferrer"
                className="text-ink-dim hover:text-accent underline underline-offset-4 transition-colors"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </DocsShell>
  );
}
