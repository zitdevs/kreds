export const site = {
  name: "Kreds docs",
  url: "https://docs.kreds.sh",
  domain: "docs.kreds.sh",
  tagline: "How Kreds works, from self-hosting to the laws the economy runs on.",
  description:
    "Documentation for Kreds: self-hosting with Docker, the scoring rules, the economic constitution, and what the AGPLv3 licence lets you do.",
  author: "ZitDevs",
  authorUrl: "https://zitdevs.com",
} as const;

export const links = {
  marketing: "https://kreds.sh",
  github: "https://github.com/zitdevs/kreds",
  discussions: "https://github.com/zitdevs/kreds/discussions",
  issues: "https://github.com/zitdevs/kreds/issues",
  sponsors: "https://github.com/sponsors/zitdevs",
  license: "https://github.com/zitdevs/kreds/blob/main/LICENSE",
  changelog: "https://github.com/zitdevs/kreds/blob/main/CHANGELOG.md",
  contributing: "https://github.com/zitdevs/kreds/blob/main/.github/CONTRIBUTING.md",
  security: "https://github.com/zitdevs/kreds/blob/main/.github/SECURITY.md",
  codeOfConduct: "https://github.com/zitdevs/kreds/blob/main/.github/CODE_OF_CONDUCT.md",
  support: "https://github.com/zitdevs/kreds/blob/main/.github/SUPPORT.md",
  /** Where an unpublished repository-relative link resolves to. */
  repoBlob: "https://github.com/zitdevs/kreds/blob/main",
  /** Where the markdown behind a published page lives. */
  contentBlob: "https://github.com/zitdevs/kreds/blob/main/apps/docs/content",
  contentEdit: "https://github.com/zitdevs/kreds/edit/main/apps/docs/content",
} as const;

/**
 * Self-hosted Umami, on its own website id. Sharing the marketing site's id
 * merged both surfaces into a single property, so documentation traffic was
 * indistinguishable from the landing page's.
 *
 * `domains` scopes the beacon to the production hostname: without it every
 * page load on a preview URL and on localhost lands in the same dashboard.
 *
 * `origin` exists separately from `src` so the document can preconnect to it.
 * The shape matches the marketing site's on purpose: the same config under two
 * different names is how two sites drift apart.
 */
export const analytics = {
  src: "https://analytics.zitdevs.com/script.js",
  origin: "https://analytics.zitdevs.com",
  websiteId: "86b0d8a6-9f6e-49db-a9e0-77f67bb5ecca",
  domains: "docs.kreds.sh",
} as const;

export const clarity = { projectId: "y64elrildm" } as const;
