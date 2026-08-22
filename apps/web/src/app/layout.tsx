import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { site, links, analytics, clarity } from "@/lib/site";
import { plans } from "@/lib/pricing";
import { faqs } from "@/lib/faq";
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
    "developer recognition",
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
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, address: false, email: false },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

/**
 * One @graph rather than several loose blocks, so the entities can reference
 * each other by @id.
 *
 * The FAQ and pricing entries are generated from the same modules the page
 * renders from — structured data that disagrees with the visible page is worse
 * than none at all.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${site.url}/#organization`,
      name: site.author,
      url: site.authorUrl,
      email: "contact@zitdevs.com",
      sameAs: ["https://github.com/zitdevs"],
    },
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      url: site.url,
      name: site.name,
      description: site.description,
      inLanguage: "en-US",
      publisher: { "@id": `${site.url}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${site.url}/#software`,
      name: site.name,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Engineering analytics",
      operatingSystem: "Web, Docker",
      url: site.url,
      description: site.description,
      softwareVersion: "0.1.0",
      license: links.license,
      codeRepository: links.github,
      author: { "@id": `${site.url}/#organization` },
      publisher: { "@id": `${site.url}/#organization` },
      offers: plans
        .filter((plan) => plan.price.startsWith("$"))
        .map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: plan.price.replace("$", ""),
          priceCurrency: "USD",
          description: plan.blurb,
          url: `${site.url}/#pricing`,
        })),
    },
    {
      "@type": "FAQPage",
      "@id": `${site.url}/#faq`,
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* The only third-party origin the page touches. */}
        <link rel="preconnect" href={analytics.origin} />
        {/*
          A plain deferred tag rather than next/script: `afterInteractive`
          waits for hydration, so anyone who leaves before React boots is
          never counted. `defer` starts fetching during HTML parse, does not
          block rendering, and runs before DOMContentLoaded.
        */}
        <script
          defer
          src={analytics.src}
          data-website-id={analytics.websiteId}
          data-domains={analytics.domains}
        />
        {/*
          Clarity's own loader, kept as they ship it. It is not optional
          boilerplate: the tag at clarity.ms/tag/<id> calls window.clarity()
          on its first line, so without this queue stub defined first it
          throws. Loading the tag on its own does not work.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarity.projectId}");`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="focus:bg-accent sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#04140c]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
