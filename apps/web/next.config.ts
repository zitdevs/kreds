import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  /**
   * The shared design system is TypeScript source rather than a build artefact,
   * so Next has to compile it alongside the app.
   */
  transpilePackages: ["@kreds/ui"],
  // Fonts are self-hosted by next/font and every icon is inline SVG, so the
  // page makes no third-party requests at all. Nothing to preconnect to.
  experimental: {
    optimizePackageImports: ["geist"],
  },
  /**
   * www -> apex, 308, path and query preserved.
   *
   * Cloudflare sits in front, so a Redirect Rule there would bounce www at the
   * edge without ever hitting Railway, which is cheaper and worth adding. This stays
   * regardless: it is version-controlled, it survives a dashboard change nobody
   * remembers making, and if the edge rule fires first this simply never runs.
   */
  async redirects() {
    return [
      /**
       * The documentation moved to its own origin. These paths were live, in
       * the sitemap and submitted to Search Console, so they redirect rather
       * than 404. Permanent, because they are never coming back.
       */
      { source: "/docs", destination: "https://docs.kreds.sh", permanent: true },
      {
        source: "/docs/self-hosting",
        destination: "https://docs.kreds.sh/getting-started/self-hosting",
        permanent: true,
      },
      {
        source: "/docs/rules",
        destination: "https://docs.kreds.sh/economy/kreds-rules",
        permanent: true,
      },
      {
        source: "/docs/constitution",
        destination: "https://docs.kreds.sh/economy/constitution",
        permanent: true,
      },
      {
        source: "/docs/contribution-rules",
        destination: "https://docs.kreds.sh/economy/contribution-rules",
        permanent: true,
      },
      {
        source: "/docs/architecture",
        destination: "https://docs.kreds.sh/architecture/core-and-network",
        permanent: true,
      },
      {
        source: "/docs/licensing",
        destination: "https://docs.kreds.sh/legal/licensing",
        permanent: true,
      },
      {
        source: "/docs/trademarks",
        destination: "https://docs.kreds.sh/legal/trademarks",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.kreds.sh" }],
        destination: "https://kreds.sh/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
