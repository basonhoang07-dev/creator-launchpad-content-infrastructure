"use client";

// components/AppShell.tsx
//
// Ported from the prototype's App root composition (mobile topbar, sidebar
// overlay, Sidebar, AnnouncementBanner, main scroll area). Each page's
// content now comes from Next.js routing (`children`) instead of the
// prototype's `active === "..."` conditional block.

import React, { useState } from "react";
import { Menu } from "lucide-react";
import { C } from "@/lib/theme";
import { Logo } from "@/components/ui";
import Sidebar from "@/components/Sidebar";
import AnnouncementBanner, { type Announcement } from "@/components/AnnouncementBanner";
import { ToastProvider } from "@/components/Toast";

export default function AppShell({
  announcement,
  children,
}: {
  announcement: Announcement | null;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="cl-root" style={{ minHeight: "100vh", background: C.bg, display: "flex" }}>
        <div
          className="cl-mobile-topbar"
          style={{ position: "fixed", top: 0, left: 0, right: 0, height: 56, background: C.surface, borderBottom: `1px solid ${C.border}`, alignItems: "center", padding: "0 14px", gap: 10, zIndex: 150 }}
        >
          <button onClick={() => setMobileNavOpen(true)} style={{ background: "none", border: "none", color: C.text, cursor: "pointer", padding: 4 }}>
            <Menu size={22} />
          </button>
          <Logo size={26} />
          <span className="cl-display" style={{ fontSize: 14, fontWeight: 700 }}>Creator Launchpad</span>
        </div>
        <div className={`cl-sidebar-overlay${mobileNavOpen ? " cl-sidebar-open" : ""}`} onClick={() => setMobileNavOpen(false)} />

        <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <AnnouncementBanner announcement={announcement} />
          <div className="cl-scroll cl-main-scroll" style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
            {children}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
