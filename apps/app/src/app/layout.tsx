import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteHeader } from "@kreds/ui";

import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${site.name}: sign in`, template: `%s | ${site.name}` },
  description: site.tagline,
  // The product is behind a sign-in and has nothing useful for a crawler.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <SiteHeader
          brandHref={site.marketing}
          badge="App"
          githubUrl={site.github}
          items={[{ label: "Docs", href: site.docs }]}
        />
        <main id="main" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          {children}
        </main>
      </body>
    </html>
  );
}
