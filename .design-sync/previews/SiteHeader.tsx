import { Button, SiteHeader } from "@kreds/ui";

const nav = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "/docs" },
];

export const Marketing = () => (
  <SiteHeader
    items={nav}
    githubUrl="https://github.com/zitdevs/kreds"
    action={
      <Button href="#get-started" size="md">
        Get started
      </Button>
    }
  />
);

export const WithSurfaceBadge = () => (
  <SiteHeader
    items={[
      { label: "Getting started", href: "/docs" },
      { label: "Economy", href: "/docs/economy" },
      { label: "Architecture", href: "/docs/architecture" },
    ]}
    githubUrl="https://github.com/zitdevs/kreds"
    brandHref="https://kreds.sh"
    badge="docs"
  />
);

export const LinksOnly = () => (
  <SiteHeader items={nav} githubUrl="https://github.com/zitdevs/kreds" />
);
