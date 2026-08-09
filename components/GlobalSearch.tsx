"use client";

// components/GlobalSearch.tsx
//
// Ported from the prototype's GlobalSearch, which searched the entire
// in-memory `data` blob client-side. The real app has no such blob — SOPs
// are org-wide (real query), but scripts and recaps are per-client, so
// those two only search the currently-scoped client (the Client's own
// portal, or a Creative Director/Admin's "working in" selection). Debounced
// against Supabase instead of filtering an in-memory array.

import React, { useEffect, useState } from "react";
import { Search, BookOpen, Film, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { C } from "@/lib/theme";
import { useSession, useScopedClientId } from "@/components/SessionProvider";

export interface SearchResult {
  kind: "sop" | "script" | "recap";
  tab?: "ugc" | "format";
  sopId?: string;
  brand?: string;
  entryId?: string;
  recapId?: string;
  icon: typeof BookOpen;
  title: string;
  sub: string;
}

export default function GlobalSearch({ onNavigate }: { onNavigate: (r: SearchResult) => void }) {
  const { profile } = useSession();
  const scopedClientId = useScopedClientId();
  const canSeeRecaps = profile.role === "Client" || profile.role === "Admin";
  // SOP Libraries is admin-only while it's still being built out (see Sidebar) —
  // keep search results in sync so it can't be jumped to that way either.
  const canSeeSops = profile.role === "Admin";

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const supabase = createClient();
    const timer = setTimeout(async () => {
      const found: SearchResult[] = [];

      if (canSeeSops) {
        const { data: sops } = await supabase
          .from("sops")
          .select("id, kind, title, body")
          .eq("organization_id", profile.organization_id)
          .is("deleted_at", null)
          .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
          .limit(5);
        (sops || []).forEach((s) => {
          found.push({
            kind: "sop",
            tab: s.kind,
            sopId: s.id,
            icon: BookOpen,
            title: s.title,
            sub: s.kind === "ugc" ? "UGC SOP" : "Format SOP",
          });
        });
      }

      if (scopedClientId) {
        const { data: entries } = await supabase
          .from("calendar_entries")
          .select("id, brand, title, script")
          .eq("client_id", scopedClientId)
          .or(`title.ilike.%${q}%,script.ilike.%${q}%`)
          .limit(5);
        (entries || []).forEach((c) => {
          found.push({ kind: "script", brand: c.brand, entryId: c.id, icon: Film, title: c.title, sub: `${c.brand} · script` });
        });

        if (canSeeRecaps) {
          const { data: recaps } = await supabase
            .from("recaps")
            .select("id, title, tldr")
            .eq("client_id", scopedClientId)
            .or(`title.ilike.%${q}%,tldr.ilike.%${q}%`)
            .limit(5);
          (recaps || []).forEach((r) => {
            found.push({ kind: "recap", recapId: r.id, icon: MessageSquare, title: r.title, sub: "Call recap" });
          });
        }
      }

      setResults(found.slice(0, 8));
    }, 250);

    return () => clearTimeout(timer);
  }, [query, scopedClientId, canSeeRecaps, profile.organization_id]);

  function handleClick(r: SearchResult) {
    onNavigate(r);
    setQuery("");
    setFocused(false);
  }

  const q = query.trim();

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <div style={{ position: "relative" }}>
        <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.textFaint, pointerEvents: "none" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search everything..."
          style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px 7px 30px", fontSize: 12.5, color: C.text, boxSizing: "border-box" }}
        />
      </div>
      {focused && q && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.surface2, border: `1px solid ${C.borderLight}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 250, maxHeight: 320, overflowY: "auto" }}>
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <button
                key={i}
                onClick={() => handleClick(r)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : "none" }}
              >
                <Icon size={13} color={C.accentLight} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                  <div style={{ fontSize: 10, color: C.textFaint }}>{r.sub}</div>
                </div>
              </button>
            );
          })}
          {results.length === 0 && <div style={{ padding: "12px 10px", fontSize: 12, color: C.textFaint }}>No matches.</div>}
        </div>
      )}
    </div>
  );
}
