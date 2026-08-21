"use client";

// components/Sidebar.tsx
//
// Ported from the prototype's Sidebar. Nav is now real Next.js routes
// (Link + usePathname) instead of an `active` string switch, and "jump to
// X" (from GlobalSearch) is now a router.push with query params instead of
// in-memory jump state — the target pages read those via useSearchParams.

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, DollarSign, BookOpen, CalendarDays, Plug, Film, UserCog,
  MessageSquare, ShieldCheck, ChevronRight, LogOut, X, Trophy,
} from "lucide-react";
import { C, WORKLOAD_LABELS } from "@/lib/theme";
import { Logo, Avatar } from "@/components/ui";
import { useSession } from "@/components/SessionProvider";
import GlobalSearch, { type SearchResult } from "@/components/GlobalSearch";
import ClientPickerModal from "@/components/ClientPickerModal";
import { createClient } from "@/lib/supabase";
import { useToast, toastMessage } from "@/components/Toast";

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { profile, effectiveRole, workingClient, setWorkingClient, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleAvatarChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      const supabase = createClient();
      const { error } = await supabase.from("profiles").update({ avatar_url: dataUrl }).eq("id", profile.id);
      if (error) throw error;
      router.refresh();
    } catch (err) {
      showToast(toastMessage(err, "Couldn't update your profile picture — try again."));
    } finally {
      setUploadingAvatar(false);
    }
  }

  const isCreativeDirector = profile.role === "Creative Director";
  const seesFinancials = profile.role === "Client" || profile.role === "Admin";
  // Admin has unrestricted access to every client in the org (enforced
  // server-side in lib/auth.ts) — the "Working in" picker just needed to
  // exist for them too, same as it already did for Creative Director.
  const canSwitchClient = isCreativeDirector || profile.role === "Admin";

  const items: { id: string; href: string; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "home", href: "/", label: "Home", icon: LayoutDashboard },
    ...(seesFinancials ? [{ id: "kpi", href: "/kpi", label: "KPI Trackers", icon: DollarSign }] : []),
    ...(seesFinancials ? [{ id: "leaderboard", href: "/leaderboard", label: "Leaderboard", icon: Trophy }] : []),
    // SOP Libraries: admin-only while it's still being built out. Flip this
    // back to unconditional once it's ready to publish to everyone. Gated on
    // effectiveRole (not profile.role) so it disappears while an Admin is
    // previewing a client — that client never sees it either.
    ...(effectiveRole === "Admin" ? [{ id: "sops", href: "/sops", label: "SOP Libraries", icon: BookOpen }] : []),
    { id: "calendar", href: "/calendar", label: "Content Calendar", icon: CalendarDays },
    ...(!isCreativeDirector ? [{ id: "integrations", href: "/integrations", label: "Integrations", icon: Plug }] : []),
  ];
  items.push({
    id: "workload",
    href: "/workload",
    label: WORKLOAD_LABELS[profile.role] || "Workload",
    icon: profile.role === "Client" ? Film : UserCog,
  });
  if (profile.role === "Client" || profile.role === "Admin") {
    items.push({ id: "recaps", href: "/recaps", label: "Call Recaps", icon: MessageSquare });
  }
  // effectiveRole, not profile.role — hidden while an Admin is previewing a
  // client via "Working in", same reasoning as the SOP Libraries gate above.
  if (effectiveRole === "Admin") items.push({ id: "admin", href: "/admin", label: "Admin Panel", icon: ShieldCheck });

  function handleGlobalSearchNavigate(r: SearchResult) {
    if (r.kind === "sop") router.push(`/sops?tab=${r.tab}&sop=${r.sopId}`);
    else if (r.kind === "script") router.push(`/calendar?brand=${encodeURIComponent(r.brand || "")}&view=table&entry=${r.entryId}`);
    else if (r.kind === "recap") router.push(`/recaps?recap=${r.recapId}`);
    onCloseMobile();
  }

  return (
    <div
      className={`cl-sidebar${mobileOpen ? " cl-sidebar-open" : ""}`}
      style={{ width: 232, minWidth: 232, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "20px 14px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 18 }}>
        <Logo size={32} />
        <span className="cl-display" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15, flex: 1 }}>
          Creator
          <br />
          Launchpad
        </span>
        <button
          onClick={onCloseMobile}
          style={{ display: "none", background: "none", border: "none", color: C.textFaint, cursor: "pointer" }}
          className="cl-sidebar-close"
        >
          <X size={18} />
        </button>
      </div>

      <GlobalSearch onNavigate={handleGlobalSearchNavigate} />

      {canSwitchClient && (
        <button
          onClick={() => setShowClientPicker(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 10px", marginBottom: 16, cursor: "pointer", textAlign: "left" }}
        >
          <UserCog size={14} color={C.accentLight} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>Working in</div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: workingClient ? C.text : C.textFaint,
              }}
            >
              {workingClient?.name || "Select a client"}
            </div>
          </div>
          <ChevronRight size={13} color={C.textFaint} />
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.id}
              href={it.href}
              onClick={onCloseMobile}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                background: isActive ? C.accentDim : "transparent",
                color: isActive ? C.accentLight : C.textMuted,
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Icon size={16} />
              {it.label}
            </Link>
          );
        })}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "0 8px" }}>
          <label
            title="Click to change your photo"
            style={{ cursor: uploadingAvatar ? "default" : "pointer", opacity: uploadingAvatar ? 0.5 : 1, flexShrink: 0 }}
          >
            <Avatar name={profile.name} avatarUrl={profile.avatar_url} />
            <input
              type="file"
              accept="image/*"
              disabled={uploadingAvatar}
              onChange={(e) => handleAvatarChange(e.target.files)}
              style={{ display: "none" }}
            />
          </label>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.name}</div>
            <div className="cl-mono" style={{ fontSize: 10.5, color: C.textFaint }}>{profile.role}</div>
          </div>
        </div>
        <button
          onClick={signOut}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", background: "transparent", border: "none", color: C.textFaint, fontSize: 13, cursor: "pointer" }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {showClientPicker && (
        <ClientPickerModal
          currentClientId={workingClient?.id ?? null}
          onSelect={(client) => {
            setWorkingClient(client);
            setShowClientPicker(false);
          }}
          onClose={() => setShowClientPicker(false)}
        />
      )}
    </div>
  );
}
