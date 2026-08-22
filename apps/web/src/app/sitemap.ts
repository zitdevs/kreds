import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Bump on every meaningful content change. An inaccurate lastmod is worse
// than none, because crawlers learn to ignore it.
const LAST_MODIFIED = "2026-08-22";

// The documentation has its own origin and its own sitemap at
// docs.kreds.sh/sitemap.xml. Listing those URLs here would claim pages this
// site does not serve.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: site.url,
      lastModified: new Date(LAST_MODIFIED),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
