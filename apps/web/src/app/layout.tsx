import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "engineering leaderboard",
    "developer gamification",
    "GitHub leaderboard",
    "code review incentives",
    "engineering team metrics",
    "self-hosted",
    "source available",
  ],
  authors: [{ name: site.author, url: site.authorUrl }],
  creator: site.author,
  publisher: site.author,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: site.name,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web, Docker",
  url: site.url,
  description: site.description,
  author: { "@type": "Organization", name: site.author, url: site.authorUrl },
  offers: [
    {
      "@type": "Offer",
      name: "Community",
      price: "0",
      priceCurrency: "USD",
      description: "Up to 20 members, 1 team, unlimited repositories.",
    },
    {
      "@type": "Offer",
      name: "Team",
      price: "2.99",
      priceCurrency: "USD",
      description: "Per member, per month. Unlimited members and integrations.",
    },
    {
      "@type": "Offer",
      name: "Growing",
      price: "79",
      priceCurrency: "USD",
      description: "Flat monthly rate for up to 50 members.",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="focus:bg-accent sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#04140c]"
        >
          Skip to content
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
