import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsShell, SourceNote } from "@/components/docs-shell";
import { DOC_PAGES, SECTIONS, findDoc, renderDoc } from "@/lib/content";

/**
 * Every page is generated at build time, so the filesystem read happens once
 * during the build and never in a request. Production serves static HTML.
 */
export function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: page.slug.split("/") }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findDoc(slug.join("/"));
  if (!page) return {};
  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: `/${page.slug}` },
    openGraph: { title: page.title, description: page.summary, url: `/${page.slug}` },
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = findDoc(slug.join("/"));
  if (!page) notFound();

  const { html, headings } = await renderDoc(page);
  const section = SECTIONS.find((candidate) => candidate.id === page.section);

  return (
    <DocsShell page={page} headings={headings}>
      <article>
        <header className="mb-10">
          <p className="text-ink-faint text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
            {section?.title}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{page.title}</h1>
          <p className="text-ink-dim mt-3 max-w-2xl leading-relaxed">{page.summary}</p>
        </header>

        {/*
          The markdown is authored in this repository and rendered through a
          pipeline configured with `allowDangerousHtml: false`, so raw HTML in a
          source file is dropped rather than passed through.
        */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

        <SourceNote page={page} />
      </article>
    </DocsShell>
  );
}
