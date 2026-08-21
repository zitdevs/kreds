export const site = {
  name: "Kreds",
  domain: "kreds.sh",
  url: "https://kreds.sh",
  tagline: "The leaderboard for your engineering team.",
  description:
    "Kreds turns merged pull requests, code reviews and closed issues into a live leaderboard for your engineering team. Weighted so that helping someone ship beats shipping alone.",
  author: "ZitDevs",
  authorUrl: "https://zitdevs.com",
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
