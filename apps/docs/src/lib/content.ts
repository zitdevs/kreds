import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Element, Root, Text } from "hast";

import { links } from "@/lib/site";

/**
 * The documents this site publishes.
 *
 * An explicit allowlist, not a glob over `content/`. A glob eventually
 * publishes a file somebody added without thinking about who reads it, and this
 * project keeps a hard line between what is public and what is not. Adding a
 * page here is a deliberate act.
 *
 * `source` is relative to `content/`, and the route mirrors the folder, so a
 * reader who finds `content/economy/constitution.md` in the repository already
 * knows it lives at `/economy/constitution`.
 */
export interface DocPage {
  readonly slug: string;
  readonly source: string;
  readonly title: string;
  readonly summary: string;
  readonly section: SectionId;
}

export type SectionId = "getting-started" | "economy" | "architecture" | "legal";

export interface DocSection {
  readonly id: SectionId;
  readonly title: string;
  readonly blurb: string;
}

export const SECTIONS: readonly DocSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "Run Kreds yourself, on your own infrastructure.",
  },
  {
    id: "economy",
    title: "The economy",
    blurb: "The laws the KRED economy runs on, and what each action is worth.",
  },
  {
    id: "architecture",
    title: "Architecture",
    blurb: "What is open source, what is not, and the reasoning behind the line.",
  },
  {
    id: "legal",
    title: "Legal",
    blurb: "The licence in plain terms, and how to use the Kreds name.",
  },
];

export const DOC_PAGES: readonly DocPage[] = [
  {
    slug: "getting-started/self-hosting",
    source: "getting-started/self-hosting.md",
    title: "Self-hosting",
    summary: "Docker, the GitHub App setup, upgrades and backups. About twenty minutes.",
    section: "getting-started",
  },
  {
    slug: "economy/constitution",
    source: "economy/constitution.md",
    title: "Economic Constitution",
    summary: "The thirty-four laws the KRED economy runs on. Everything else is subordinate.",
    section: "economy",
  },
  {
    slug: "economy/kreds-rules",
    source: "economy/kreds-rules.md",
    title: "Kreds rules",
    summary: "What each action is worth, and how to tune it for your team.",
    section: "economy",
  },
  {
    slug: "economy/contribution-rules",
    source: "economy/contribution-rules.md",
    title: "Contribution rules",
    summary: "How work is recognised, and why recognition is deliberately not payment.",
    section: "economy",
  },
  {
    slug: "architecture/core-and-network",
    source: "architecture/core-and-network.md",
    title: "Core and Network",
    summary: "The three layers, and why the anti-abuse half cannot be public.",
    section: "architecture",
  },
  {
    slug: "legal/licensing",
    source: "legal/licensing.md",
    title: "Licensing",
    summary: "What AGPLv3 means for you, in plain terms.",
    section: "legal",
  },
  {
    slug: "legal/trademarks",
    source: "legal/trademarks.md",
    title: "Trademarks",
    summary: "Using the Kreds name. Permissive about honest use, strict about passing off.",
    section: "legal",
  },
];

const bySource = new Map(DOC_PAGES.map((page) => [page.source, page]));

export function findDoc(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

export function pagesIn(section: SectionId): readonly DocPage[] {
  return DOC_PAGES.filter((page) => page.section === section);
}

/**
 * Where the markdown lives, relative to the app root.
 *
 * Deliberately a static path rather than a search upward from this file. A
 * computed root cannot be analysed by the bundler, so it concludes that any
 * file in the project might be read and traces the entire tree into the server
 * output, source and all. A literal segment lets it trace `content/` and
 * nothing else.
 *
 * `process.cwd()` is the app root because every script that reads this runs
 * from `apps/docs`, both during the build and under `next start`.
 */
const CONTENT_ROOT = "content";

export interface Heading {
  readonly id: string;
  readonly text: string;
  readonly depth: 2 | 3;
}

export interface RenderedDoc {
  readonly page: DocPage;
  readonly html: string;
  readonly headings: readonly Heading[];
}

/**
 * Rewrite the links a markdown file carries so they resolve on the web.
 *
 * These files are written to be readable on GitHub too, where a link like
 * `../legal/licensing.md` is a real path. Three cases:
 *
 * 1. the target is published here, so it becomes a route on this site;
 * 2. the target is a repository file that is not published, such as
 *    `CONTRIBUTING.md`, so it becomes a GitHub blob URL;
 * 3. the link is already absolute or a bare anchor, so it is left alone.
 *
 * Anchors survive all three. Losing them would quietly break every deep link
 * the documents make into each other.
 */
function rewriteLinks(sourcePath: string) {
  const sourceDir = posix.dirname(sourcePath);

  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.["href"];
      if (typeof href !== "string" || href === "") return;
      if (/^([a-z]+:|\/\/|#|\/)/i.test(href)) return;

      const [rawPath = "", anchor = ""] = href.split("#");
      const suffix = anchor ? `#${anchor}` : "";
      const resolved = posix.normalize(posix.join(sourceDir, rawPath)).replace(/^\.\//, "");

      const published = bySource.get(resolved);
      node.properties = {
        ...node.properties,
        href: published
          ? `/${published.slug}${suffix}`
          : `${links.contentBlob}/${resolved}${suffix}`,
        ...(published ? {} : { rel: ["noreferrer"] }),
      };
    });
  };
}

/** Collect the headings a reader can jump to. Depth 2 and 3 only: deeper is noise in a sidebar. */
function collectHeadings(into: Heading[]) {
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") return;
      const id = node.properties?.["id"];
      if (typeof id !== "string") return;
      const text = textOf(node).trim();
      if (text === "") return;
      into.push({ id, text, depth: node.tagName === "h2" ? 2 : 3 });
    });
  };
}

function textOf(node: Element): string {
  let out = "";
  visit(node, "text", (child: Text) => {
    out += child.value;
  });
  return out;
}

/**
 * Drop the leading `# Title`.
 *
 * The page renders its own heading from the registry, so keeping the file's
 * would print it twice. The registry title is also the one used in navigation
 * and in the page metadata, which keeps a single source for it.
 */
function stripLeadingTitle() {
  return () => (tree: Root) => {
    const index = tree.children.findIndex(
      (child) => child.type === "element" && (child as Element).tagName === "h1",
    );
    if (index !== -1) tree.children.splice(index, 1);
  };
}

export async function renderDoc(page: DocPage): Promise<RenderedDoc> {
  const raw = await readFile(join(process.cwd(), CONTENT_ROOT, page.source), "utf8");
  const headings: Heading[] = [];

  const file = await unified()
    .use(remarkParse)
    // The documents are mostly tables. Without GFM they render as paragraphs of
    // pipes, which is worse than not publishing them.
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: { className: ["heading-anchor"] },
    })
    .use(stripLeadingTitle())
    .use(collectHeadings(headings))
    .use(rewriteLinks(page.source))
    .use(rehypeStringify, { allowDangerousHtml: false })
    .process(raw);

  return { page, html: String(file), headings };
}
