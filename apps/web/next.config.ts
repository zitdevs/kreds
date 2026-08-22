import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
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
