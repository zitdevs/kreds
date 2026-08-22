import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GitHub } from "@/components/ui/icons";
import { links } from "@/lib/site";

const items = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Self-host", href: "#self-hosting" },
  { label: "License", href: "#license" },
  { label: "Docs", href: "/docs" },
];

export function Nav() {
  return (
    <header className="border-line bg-bg/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5 sm:px-8"
      >
        <Link href="/" className="flex items-center gap-2.5" aria-label="Kreds home">
          <span aria-hidden className="text-accent text-lg leading-none">
            &#8227;
          </span>
          <span className="text-[0.95rem] font-semibold tracking-tight">Kreds</span>
        </Link>

        <ul className="hidden items-center gap-7 md:flex">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-ink-dim hover:text-ink text-sm transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={links.github}
            className="text-ink-dim hover:text-ink hover:border-line-strong border-line hidden h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors sm:inline-flex"
          >
            <GitHub className="h-4 w-4" />
            <span className="hidden lg:inline">GitHub</span>
          </Link>
          <Button href="https://kreds.sh/signup">Get started</Button>
        </div>
      </nav>
    </header>
  );
}
