import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The favicon tile at touch-icon size: accent ground, ink-on-green Merge K.
 * Same geometry as `icon.svg` (a 64 unit tile), scaled to 180. Generated at
 * build time rather than committed as a binary, so the mark stays in sync with
 * the brand colours in one place.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#5ee9a4",
      }}
    >
      <svg
        viewBox="0 0 64 64"
        width={180}
        height={180}
        fill="none"
        stroke="#04140c"
        strokeWidth={2.4}
        strokeLinecap="round"
      >
        <g transform="translate(32 32) scale(1.3) translate(-16.75 -16)">
          <path d="M9 3.5V12" />
          <path d="M9 20V28.5" />
          <path d="M24.5 4.5 11.73 13.97" />
          <path d="M11.73 18.03 24.5 27.5" />
          <circle cx="9" cy="16" r="3.4" />
        </g>
      </svg>
    </div>,
    size,
  );
}
