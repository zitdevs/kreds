import { SiteFooter } from "@kreds/ui";

const groups = [
  {
    title: "Product",
    items: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Self-hosting", href: "#self-hosting" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "Docs", href: "/docs" },
      { label: "GitHub", href: "https://github.com/zitdevs/kreds" },
      { label: "Contributing", href: "/docs/contributing" },
      { label: "Code of conduct", href: "/docs/code-of-conduct" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Licence", href: "/docs/licensing" },
      { label: "Trademarks", href: "/docs/trademarks" },
      { label: "Security", href: "/docs/security" },
    ],
  },
];

export const Marketing = () => (
  <SiteFooter
    groups={groups}
    tagline="The leaderboard for your engineering team."
    githubUrl="https://github.com/zitdevs/kreds"
    githubLabel="zitdevs/kreds"
    author="ZitDevs"
    authorUrl="https://zitdevs.com"
    domain="kreds.sh"
    licenseHref="/docs/licensing"
  />
);

export const SingleColumn = () => (
  <SiteFooter
    groups={[groups[0]!]}
    tagline="Merged work, reviews and closed issues become a live standing."
    githubUrl="https://github.com/zitdevs/kreds"
    githubLabel="Star the repository"
    author="ZitDevs"
    authorUrl="https://zitdevs.com"
    domain="docs.kreds.sh"
    licenseHref="/docs/licensing"
    brandHref="https://kreds.sh"
  />
);
