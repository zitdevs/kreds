import type { MetadataRoute } from "next";
import { DOC_PAGES } from "@/lib/docs";
import { site } from "@/lib/site";

// Bump on every meaningful content change. An inaccurate lastmod is worse
// than none, because crawlers learn to ignore it.
const LAST_MODIFIED = "2026-08-22";

export default function sitemap(): MetadataRoute.Sitemap {
  const modified = new Date(LAST_MODIFIED);

  return [
    {
      url: site.url,
      lastModified: modified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${site.url}/docs`,
      lastModified: modified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...DOC_PAGES.map((page) => ({
      url: `${site.url}/docs/${page.slug}`,
      lastModified: modified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
