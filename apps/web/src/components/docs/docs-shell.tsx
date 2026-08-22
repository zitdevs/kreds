import Link from "next/link";

import { DOC_GROUPS, DOC_PAGES, type DocPage, type Heading } from "@/lib/docs";
import { links } from "@/lib/site";

function Sidebar({ current }: { current?: string }) {
  return (
    <nav aria-label="Documentation" className="text-sm">
      {DOC_GROUPS.map((group) => {
        const pages = DOC_PAGES.filter((page) => page.group === group);
        if (pages.length === 0) return null;
        return (
          <div key={group} className="mb-7">
            <h2 className="text-ink-faint mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em]">
              {group}
            </h2>
            <ul className="space-y-0.5">
              {pages.map((page) => {
                const active = page.slug === current;
                return (
                  <li key={page.slug}>
                    <Link
                      href={`/docs/${page.slug}`}
                      aria-current={active ? "page" : undefined}
                      className={`-ml-px block border-l py-1.5 pl-3.5 transition-colors ${
                        active
                          ? "border-accent text-ink font-medium"
                          : "border-line text-ink-dim hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {page.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function OnThisPage({ headings }: { headings: readonly Heading[] }) {
  if (headings.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-sm">
      <h2 className="text-ink-faint mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em]">
        On this page
      </h2>
      <ul className="space-y-1.5">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.depth === 3 ? "pl-3.5" : undefined}>
            <a
              href={`#${heading.id}`}
              className="text-ink-dim hover:text-ink block leading-snug transition-colors"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Three columns on a wide screen, one on a phone.
 *
 * The sidebars are `min-w-0` inside the grid because a long unbroken heading in
 * the table of contents will otherwise inflate its track and push the page into
 * horizontal scroll, which is the exact bug that cost 47 pixels on the landing
 * page once already.
 */
export function DocsShell({
  page,
  headings,
  children,
}: {
  page?: DocPage;
  headings?: readonly Heading[];
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[13rem_minmax(0,1fr)_12rem]">
      {/*
        Two render sites for one component. On a phone the full index is around
        nine hundred pixels of navigation sitting between the reader and the
        first paragraph, so it collapses into a disclosure. A CSS-only approach
        does not work here: a closed `details` hides its contents at the browser
        level, and no media query reopens it.
      */}
      <details className="border-line bg-surface/40 rounded-card min-w-0 border px-4 py-3 lg:hidden">
        <summary className="text-ink-dim hover:text-ink cursor-pointer list-none text-sm font-medium">
          {page ? page.title : "All documentation"}
          <span className="text-ink-faint ml-2 text-xs">Browse</span>
        </summary>
        <div className="mt-5">
          <Sidebar current={page?.slug} />
        </div>
      </details>

      <aside className="hidden min-w-0 lg:sticky lg:top-24 lg:block lg:self-start">
        <Sidebar current={page?.slug} />
      </aside>

      <main className="min-w-0">{children}</main>

      <aside className="hidden min-w-0 xl:sticky xl:top-24 xl:block xl:self-start">
        {headings ? <OnThisPage headings={headings} /> : null}
      </aside>
    </div>
  );
}

/**
 * The line that makes the whole approach legible to a reader: this page is a
 * rendering of a file in the repository, and here is that file.
 */
export function SourceNote({ page }: { page: DocPage }) {
  return (
    <p className="text-ink-faint border-line mt-14 border-t pt-6 text-sm">
      This page renders{" "}
      <a
        href={`${links.repoBlob}/${page.source}`}
        rel="noreferrer"
        className="text-ink-dim hover:text-accent underline underline-offset-4 transition-colors"
      >
        {page.source}
      </a>{" "}
      from the repository. Same file, whether you read it here or after cloning.{" "}
      <a
        href={`${links.github}/edit/main/${page.source}`}
        rel="noreferrer"
        className="text-ink-dim hover:text-accent underline underline-offset-4 transition-colors"
      >
        Suggest an edit
      </a>
      .
    </p>
  );
}
