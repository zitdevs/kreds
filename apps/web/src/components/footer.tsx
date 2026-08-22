import { SiteFooter } from "@kreds/ui";
import { links, site } from "@/lib/site";

const groups = [
  {
    title: "Product",
    items: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Self-hosting", href: "#self-hosting" },
      { label: "Changelog", href: links.changelog },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "Docs", href: links.docs },
      { label: "GitHub", href: links.github },
      { label: "Contributing", href: links.contributing },
      { label: "Discussions", href: links.discussions },
    ],
  },
  {
    title: "Legal & support",
    items: [
      { label: "License", href: links.license },
      { label: "Licensing FAQ", href: links.licenseDoc },
      { label: "Sponsor", href: links.sponsors },
      { label: "Contact", href: links.contact },
    ],
  },
];

export function Footer() {
  return (
    <SiteFooter
      groups={groups}
      tagline={`${site.tagline} Open source, self-hostable, and free for open-source teams.`}
      githubUrl={links.github}
      githubLabel="zitdevs/kreds"
      author={site.author}
      authorUrl={site.authorUrl}
      domain={site.domain}
      licenseHref={links.license}
    />
  );
}
