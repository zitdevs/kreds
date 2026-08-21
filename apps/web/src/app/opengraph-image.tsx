import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
        padding: "72px 80px",
        fontFamily: "sans-serif",
        color: "#e9edf2",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ color: "#5ee9a4", fontSize: 34 }}>&#8227;</span>
        <span style={{ fontSize: 30, fontWeight: 600 }}>Kreds</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <span style={{ fontSize: 66, fontWeight: 600, letterSpacing: -2, lineHeight: 1.1 }}>
          The leaderboard for your
          <br />
          engineering team.
        </span>
        <span style={{ fontSize: 27, color: "#9aa5b1", lineHeight: 1.4 }}>
          Merges, reviews and closed issues — weighted so helping someone ship beats shipping alone.
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
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
