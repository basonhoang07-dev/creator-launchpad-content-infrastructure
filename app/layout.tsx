import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator Launchpad",
  description: "Client portal for Creator Launchpad's UGC coaching clients.",
  // Confirms domain ownership for Google Search Console / OAuth consent
  // screen branding verification — safe to leave in permanently once set.
  verification: {
    google: "yCXuXQP50x3wn8o8olmOeXPoutf-ycsmogKr8Kigwb8",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="cl-root">{children}</body>
    </html>
  );
}
