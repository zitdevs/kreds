export const site = {
  name: "Kreds",
  domain: "kreds.sh",
  url: "https://kreds.sh",
  tagline: "The leaderboard for your engineering team.",
  // Kept under ~155 characters so search results show the whole thing,
  // differentiating clause included.
  description:
    "Merged pull requests, code reviews and closed issues become a live leaderboard for your engineering team \u2014 weighted so helping others ship wins.",
  author: "ZitDevs",
  authorUrl: "https://zitdevs.com",
} as const;

/**
 * Self-hosted Umami. Cookieless, no personal data, so no consent banner.
 *
 * `domains` scopes collection to the production hostname: without it, every
 * page load on the Railway preview URL and on localhost lands in the same
 * dashboard and quietly inflates the numbers.
 */
export const analytics = {
  src: "https://analytics.zitdevs.com/script.js",
  origin: "https://analytics.zitdevs.com",
  websiteId: "25cde335-408e-425b-be19-8b90ba66281c",
  domains: "kreds.sh",
} as const;

/**
 * Microsoft Clarity — heatmaps and session replay.
 *
 * Unlike Umami this is NOT cookieless: the loader declares `_clck` plus the
 * Microsoft Advertising identifiers `_uetmsclkid` and `_uetvid`, all with a
 * 365-day expiry, and `content: true` means the DOM is captured for replay.
 * Treat it as consent-requiring in the EU, and configure masking before the
 * app itself (real handles, real team data) is ever recorded.
 */
export const clarity = {
  projectId: "y64elrildm",
} as const;

export const links = {
  github: "https://github.com/zitdevs/kreds",
  discussions: "https://github.com/zitdevs/kreds/discussions",
  issues: "https://github.com/zitdevs/kreds/issues",
  goodFirstIssue: "https://github.com/zitdevs/kreds/labels/good%20first%20issue",
  license: "https://github.com/zitdevs/kreds/blob/main/LICENSE",
  licenseDoc: "https://github.com/zitdevs/kreds/blob/main/docs/licensing.md",
  selfHosting: "https://github.com/zitdevs/kreds/blob/main/docs/self-hosting.md",
  rules: "https://github.com/zitdevs/kreds/blob/main/docs/kreds-rules.md",
  contributing: "https://github.com/zitdevs/kreds/blob/main/CONTRIBUTING.md",
  changelog: "https://github.com/zitdevs/kreds/blob/main/CHANGELOG.md",
  docs: "https://github.com/zitdevs/kreds/tree/main/docs",
  sponsors: "https://github.com/sponsors/zitdevs",
  contact: "mailto:contact@zitdevs.com",
} as const;

/** Default Kreds values. Mirrors docs/kreds-rules.md — keep the two in step. */
export const rules = [
  { action: "Pull request merged to main", value: 25, note: "to the author" },
  { action: "Code review submitted", value: 15, note: "to the reviewer" },
  { action: "Your pull request gets approved", value: 10, note: "to the author" },
  { action: "Issue closed", value: 10, note: "to whoever closed it" },
  { action: "Five-day contribution streak", value: 50, note: "once per streak" },
  { action: "Finish the week at #1", value: 100, note: "Friday 18:00" },
  { action: "Commit pushed", value: 1, note: "off by default", muted: true },
] as const;
