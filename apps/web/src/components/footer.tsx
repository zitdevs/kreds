import Link from "next/link";
import { GitHub } from "@/components/ui/icons";
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
      { label: "GitHub", href: links.github },
      { label: "Docs", href: links.docs },
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
    <footer className="border-line border-t">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="Kreds home">
              <span aria-hidden className="text-accent text-lg leading-none">
                &#8227;
              </span>
              <span className="text-[0.95rem] font-semibold tracking-tight">Kreds</span>
            </Link>
            <p className="text-ink-dim mt-3.5 max-w-xs text-sm leading-relaxed">
              {site.tagline} Open source, self-hostable, and free for open-source teams.
            </p>
            <Link
              href={links.github}
              className="text-ink-faint hover:text-ink mt-5 inline-flex items-center gap-2 text-sm transition-colors"
            >
              <GitHub className="h-4 w-4" />
              zitdevs/kreds
            </Link>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-ink-faint font-mono text-xs uppercase tracking-[0.12em]">
                {group.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-ink-dim hover:text-ink text-sm transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-line text-ink-faint mt-12 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            Built and maintained by{" "}
            <Link href={site.authorUrl} className="text-ink-dim hover:text-ink transition-colors">
              {site.author}
            </Link>
            {" · "}
            <span className="font-mono">{site.domain}</span>
          </p>
          <p>
            Kreds Core is{" "}
            <Link href={links.license} className="text-ink-dim hover:text-ink transition-colors">
              AGPLv3
            </Link>
            {" · "}Apache 2.0 from 2030
          </p>
        </div>
      </div>
    </footer>
  );
}
