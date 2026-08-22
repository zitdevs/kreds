import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Bump on every meaningful content change. An inaccurate lastmod is worse
// than none, because crawlers learn to ignore it.
const LAST_MODIFIED = "2026-08-21";

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
