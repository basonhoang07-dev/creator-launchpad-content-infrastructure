import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator Launchpad",
  description: "Client portal for Creator Launchpad's UGC coaching clients.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="cl-root">{children}</body>
    </html>
  );
}
