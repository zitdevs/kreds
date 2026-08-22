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

/** Analytics is shared with the marketing site so the two surfaces report together. */
export const analytics = {
  scriptUrl: "https://analytics.zitdevs.com/script.js",
  websiteId: "25cde335-408e-425b-be19-8b90ba66281c",
  domains: "docs.kreds.sh",
} as const;

export const clarity = { projectId: "y64elrildm" } as const;
