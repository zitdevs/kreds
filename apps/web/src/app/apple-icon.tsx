import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Generated at build time rather than committed as a binary, so the mark stays
 * in sync with the brand colours in one place.
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
        background: "#08090b",
        color: "#5ee9a4",
        fontSize: 104,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      K
    </div>,
    size,
  );
}
