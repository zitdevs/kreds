import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteFooter, SiteHeader } from "@kreds/ui";

import { SECTIONS } from "@/lib/content";
import { analytics, clarity, links, site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.author, url: site.authorUrl }],
  creator: site.author,
  publisher: site.author,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name}: ${site.tagline}`,
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
  formatDetection: { telephone: false, address: false, email: false },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

const footerGroups = [
  {
    title: "Documentation",
    items: SECTIONS.map((section) => ({ title: section.title, id: section.id })).map((s) => ({
      label: s.title,
      href: `/#${s.id}`,
    })),
  },
  {
    title: "Project",
    items: [
      { label: "kreds.sh", href: links.marketing },
      { label: "GitHub", href: links.github },
      { label: "Discussions", href: links.discussions },
      { label: "Changelog", href: links.changelog },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Contributing", href: links.contributing },
      { label: "Code of conduct", href: links.codeOfConduct },
      { label: "Security", href: links.security },
      { label: "Support", href: links.support },
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
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
          defer
          src={analytics.scriptUrl}
          data-website-id={analytics.websiteId}
          data-domains={analytics.domains}
        />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="focus:bg-accent sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#04140c]"
        >
          Skip to content
        </a>

        <SiteHeader
          brandHref={links.marketing}
          badge="Docs"
          githubUrl={links.github}
          items={SECTIONS.map((section) => ({ label: section.title, href: `/#${section.id}` }))}
        />

        {children}

        <SiteFooter
          brandHref={links.marketing}
          groups={footerGroups}
          tagline={site.tagline}
          githubUrl={links.github}
          githubLabel="zitdevs/kreds"
          author={site.author}
          authorUrl={site.authorUrl}
          domain={site.domain}
          licenseHref={links.license}
        />
      </body>
    </html>
  );
}
