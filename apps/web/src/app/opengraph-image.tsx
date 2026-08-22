import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = `${site.name}: ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Satori (the renderer behind ImageResponse) is not a browser.
 *
 * Two things it does NOT do, both of which broke the first version of this
 * card: `<br />` does not force a line break, and text does not wrap or
 * shrink to fit its container. It just overflows and gets clipped.
 *
 * So every line is its own element with an explicit width, and nothing here
 * relies on inline flow. Keep it that way.
 */
const HEADLINE = ["The leaderboard for your", "engineering team."];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#08090b",
        borderTop: "6px solid #5ee9a4",
        padding: "64px 72px",
        fontFamily: "sans-serif",
        color: "#e9edf2",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg
          viewBox="0 0 32 32"
          width={34}
          height={34}
          fill="none"
          stroke="#5ee9a4"
          strokeWidth={2.4}
          strokeLinecap="round"
        >
          <path d="M9 3.5V12" />
          <path d="M9 20V28.5" />
          <path d="M24.5 4.5 11.73 13.97" />
          <path d="M11.73 18.03 24.5 27.5" />
          <circle cx="9" cy="16" r="3.4" />
        </svg>
        <span style={{ fontSize: 30, fontWeight: 600 }}>Kreds</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", width: 1056 }}>
        {HEADLINE.map((line) => (
          <div
            key={line}
            style={{
              display: "flex",
              width: 1056,
              fontSize: 62,
              fontWeight: 600,
              letterSpacing: -1.5,
              lineHeight: 1.14,
              color: "#e9edf2",
            }}
          >
            {line}
          </div>
        ))}
        <div
          style={{
            display: "flex",
            width: 900,
            marginTop: 24,
            fontSize: 26,
            lineHeight: 1.45,
            color: "#9aa5b1",
          }}
        >
          Weighted so helping someone ship beats shipping alone.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: 1056,
          borderTop: "1px solid #1c2129",
          paddingTop: 26,
          fontSize: 23,
          color: "#6b7784",
        }}
      >
        <span>kreds.sh</span>
        <span>Open source · AGPLv3 · Self-hostable</span>
      </div>
    </div>,
    size,
  );
}
