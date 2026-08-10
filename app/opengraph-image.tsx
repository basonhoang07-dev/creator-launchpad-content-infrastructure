// app/opengraph-image.tsx
//
// Next.js's special-filename convention: this route gets auto-generated and
// automatically wired into every page's og:image / twitter:image tags
// (app/layout.tsx's metadata doesn't need to reference it directly). Same
// dark/purple palette and logo mark as the app itself (lib/theme.ts), so a
// pasted link actually looks like it belongs to this product instead of
// showing a bare text card.

import { ImageResponse } from "next/og";
import { LOGO_DATA_URI } from "@/lib/theme";

// next/og's default font loading only resolves correctly under the edge
// runtime — without this, `next build` fails trying to fetch its default
// font via a relative URL that has nothing to resolve against statically.
export const runtime = "edge";

export const alt = "Creator Launchpad — client portal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #1a1027 0%, #0A0A0A 65%)",
        }}
      >
        <img src={LOGO_DATA_URI} width={140} height={140} style={{ borderRadius: 32, marginBottom: 36 }} />
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
          Creator Launchpad
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#B79CF0", marginTop: 18 }}>Client portal</div>
      </div>
    ),
    { ...size }
  );
}
