import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Without this, Next.js resolves the OG image's URL against
  // localhost:3000 in production — meaning link unfurlers (Discord, etc.)
  // would get a URL they can't ever actually fetch.
  metadataBase: new URL("https://creator-launchpad-content-infrastru.vercel.app"),
  title: "Creator Launchpad",
  description: "Client portal for Creator Launchpad.",
  // Confirms domain ownership for Google Search Console / OAuth consent
  // screen branding verification — safe to leave in permanently once set.
  verification: {
    google: "yCXuXQP50x3wn8o8olmOeXPoutf-ycsmogKr8Kigwb8",
  },
  // Powers the link-preview card Discord/Slack/iMessage/etc. show when this
  // URL gets pasted somewhere — without this, unfurlers fall back to plain
  // title/description text with no image. The actual image comes from
  // app/opengraph-image.tsx (Next.js auto-generates and wires up its URL).
  openGraph: {
    title: "Creator Launchpad",
    description: "Client portal for Creator Launchpad.",
    siteName: "Creator Launchpad",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Creator Launchpad",
    description: "Client portal for Creator Launchpad.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="cl-root">{children}</body>
    </html>
  );
}
