import type { MetadataRoute } from "next";
import { DOC_PAGES } from "@/lib/content";
import { site } from "@/lib/site";

const LAST_MODIFIED = "2026-08-22";

export default function sitemap(): MetadataRoute.Sitemap {
  const modified = new Date(LAST_MODIFIED);
  return [
    { url: site.url, lastModified: modified, changeFrequency: "weekly", priority: 1 },
    ...DOC_PAGES.map((page) => ({
      url: `${site.url}/${page.slug}`,
      lastModified: modified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
