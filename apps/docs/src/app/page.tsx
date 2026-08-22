import Link from "next/link";

import { DocsShell } from "@/components/docs-shell";
import { SECTIONS, pagesIn } from "@/lib/content";
import { links, site } from "@/lib/site";

export default function DocsHomePage() {
  return (
    <DocsShell>
      <header className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Documentation</h1>
        <p className="text-ink-dim mt-4 max-w-2xl text-base leading-relaxed">
          Every page here renders a markdown file from the Kreds repository. Nothing is copied, so
          what you read on this site and what ships in the box are the same bytes.
        </p>
      </header>

      {SECTIONS.map((section) => {
        const pages = pagesIn(section.id);
        if (pages.length === 0) return null;
        return (
          <section key={section.id} id={section.id} className="mb-12 scroll-mt-24">
            <h2 className="text-base font-medium">{section.title}</h2>
            <p className="text-ink-faint mt-1 text-sm">{section.blurb}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {pages.map((page) => (
                <li key={page.slug} className="min-w-0">
                  <Link
                    href={`/${page.slug}`}
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
        <h2 className="text-base font-medium">In the repository</h2>
        <p className="text-ink-dim mt-3 max-w-2xl text-sm leading-relaxed">
          Contributing, the code of conduct, security reporting and the changelog stay on GitHub,
          where they get a report button, a prompt when you open a pull request, and a badge.
          Publishing them here would trade working features for a tidier list.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {[
            { label: "Contributing", href: links.contributing },
            { label: "Security", href: links.security },
            { label: "Code of conduct", href: links.codeOfConduct },
            { label: "Support", href: links.support },
            { label: "Changelog", href: links.changelog },
            { label: "Licence", href: links.license },
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
        <p className="text-ink-faint mt-6 text-sm">
          Looking for the product?{" "}
          <a
            href={links.marketing}
            className="text-ink-dim hover:text-accent underline underline-offset-4 transition-colors"
          >
            {site.name.replace(" docs", "")} lives at kreds.sh
          </a>
          .
        </p>
      </section>
    </DocsShell>
  );
}
