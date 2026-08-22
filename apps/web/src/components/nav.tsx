import { Button, SiteHeader } from "@kreds/ui";
import { links } from "@/lib/site";

const items = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Self-host", href: "#self-hosting" },
  { label: "License", href: "#license" },
  { label: "Docs", href: links.docs },
];

export function Nav() {
  return (
    <SiteHeader
      items={items}
      githubUrl={links.github}
      action={<Button href="https://kreds.sh/signup">Get started</Button>}
    />
  );
}
