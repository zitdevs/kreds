import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Satori (the renderer behind ImageResponse) is not a browser.
 *
 * Two things it does NOT do, both of which broke the first version of this
 * card: `<br />` does not force a line break, and text does not wrap or
 * shrink to fit its container — it just overflows and gets clipped.
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
        <span style={{ color: "#5ee9a4", fontSize: 34, lineHeight: 1 }}>&#8227;</span>
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
        <span>Source-available · Self-hostable</span>
      </div>
    </div>,
    size,
  );
}
