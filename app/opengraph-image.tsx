import { ImageResponse } from "next/og";

// Static social-preview card. Rendered at build time into og:image and
// reused as twitter:image (see app/layout.tsx). Aesthetic mirrors the
// site: off-white ground, near-black ink, single orange accent.
export const alt =
  "ifcfast — an open IFC parser. IFC into pandas, meshes, and point clouds.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#fafaf7";
const FG = "#0d0d0c";
const MUTED = "#686766";
const LINE = "#e6e5df";
const ACCENT = "#e07c2f";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: BG,
          color: FG,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: FG,
              color: BG,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontFamily: "monospace",
            }}
          >
            if
          </div>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>
            ifcfast
          </div>
          <div
            style={{
              marginLeft: 8,
              border: `1px solid ${LINE}`,
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 18,
              color: MUTED,
              fontFamily: "monospace",
              display: "flex",
            }}
          >
            experimental
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 600,
              letterSpacing: -2,
              lineHeight: 1.05,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Open any IFC.</span>
            <span style={{ color: MUTED }}>Ask any question.</span>
          </div>
          <div style={{ fontSize: 30, color: MUTED, maxWidth: 900, lineHeight: 1.4 }}>
            A native IFC parser with a Python API — data and geometry into
            pandas, meshes, and point clouds. No geometry kernel on the hot path.
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 24,
            color: MUTED,
            fontFamily: "monospace",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: ACCENT,
            }}
          />
          <span>pip install ifcfast</span>
          <span style={{ color: LINE }}>·</span>
          <span>Rust core · MIT</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
