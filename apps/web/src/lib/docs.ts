import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

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
 * The documents published to kreds.sh/docs.
 *
 * This is an explicit allowlist, not a glob over the repository. A glob would
 * eventually publish a file somebody added without thinking about who reads it,
 * and this project already keeps a hard line between what is public and what is
 * not. Adding a page here is a deliberate act.
 *
 * `source` is relative to the repository root. The markdown stays exactly where
 * it is: these pages render the same bytes that a self-hoster reads after
 * cloning, so the two can never drift apart.
 */
export interface DocPage {
  readonly slug: string;
  readonly source: string;
  readonly title: string;
  readonly summary: string;
  readonly group: DocGroup;
}

export type DocGroup = "Start here" | "The economy" | "Legal";

export const DOC_PAGES: readonly DocPage[] = [
  {
    slug: "self-hosting",
    source: "docs/self-hosting.md",
    title: "Self-hosting",
    summary: "Docker, the GitHub App setup, upgrades and backups. About twenty minutes.",
    group: "Start here",
  },
  {
    slug: "rules",
    source: "docs/kreds-rules.md",
    title: "Kreds rules",
    summary: "What each action is worth, and how to tune it for your team.",
    group: "Start here",
  },
  {
    slug: "architecture",
    source: "docs/architecture/kreds-core-vs-network.md",
    title: "Core and Network",
    summary: "What is open source, what is not, and the reasoning behind the line.",
    group: "Start here",
  },
  {
    slug: "constitution",
    source: "ECONOMIC_CONSTITUTION.md",
    title: "Economic Constitution",
    summary: "The thirty-four laws the KRED economy runs on. Everything else is subordinate.",
    group: "The economy",
  },
  {
    slug: "contribution-rules",
    source: "CONTRIBUTION_RULES.md",
    title: "Contribution rules",
    summary: "How work is recognised, and why recognition is deliberately not payment.",
    group: "The economy",
  },
  {
    slug: "licensing",
    source: "docs/licensing.md",
    title: "Licensing",
    summary: "What AGPLv3 means for you, in plain terms.",
    group: "Legal",
  },
  {
    slug: "trademarks",
    source: "TRADEMARKS.md",
    title: "Trademarks",
    summary: "Using the Kreds name. Permissive about honest use, strict about passing off.",
    group: "Legal",
  },
];

export const DOC_GROUPS: readonly DocGroup[] = ["Start here", "The economy", "Legal"];

const bySource = new Map(DOC_PAGES.map((page) => [page.source, page]));

export function findDoc(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

/**
 * Walk up from this file until the workspace root appears.
 *
 * The markdown lives outside `apps/web`, so the path cannot be relative to the
 * app. Resolving by marker rather than by a fixed number of `..` segments means
 * moving the app inside the monorepo does not silently break the docs build.
 */
function repositoryRoot(): string {
  let current = resolve(dirname(new URL(import.meta.url).pathname));
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("could not locate the workspace root from the docs loader.");
}

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
 * A repository-relative link is written for someone reading on GitHub, where
 * `docs/self-hosting.md` is a real path. Three cases:
 *
 * 1. the target is published here, so it becomes a docs route;
 * 2. the target is a repository file that stays on GitHub, such as
 *    `CONTRIBUTING.md` or `LICENSE`, so it becomes a blob URL;
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
          ? `/docs/${published.slug}${suffix}`
          : `${links.repoBlob}/${resolved}${suffix}`,
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
 * and in the page metadata, so this keeps a single source for it.
 */
function stripLeadingTitle(into: { value?: string }) {
  return () => (tree: Root) => {
    const index = tree.children.findIndex(
      (child) => child.type === "element" && (child as Element).tagName === "h1",
    );
    if (index === -1) return;
    into.value = textOf(tree.children[index] as Element);
    tree.children.splice(index, 1);
  };
}

export async function renderDoc(page: DocPage): Promise<RenderedDoc> {
  const raw = await readFile(join(repositoryRoot(), page.source), "utf8");
  const headings: Heading[] = [];
  const title: { value?: string } = {};

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
    .use(stripLeadingTitle(title))
    .use(collectHeadings(headings))
    .use(rewriteLinks(page.source))
    .use(rehypeStringify, { allowDangerousHtml: false })
    .process(raw);

  return { page, html: String(file), headings };
}
