import React from "react";
import { Megaphone } from "lucide-react";
import { C } from "@/lib/theme";

export interface Announcement {
  body: string;
  created_at: string;
}

export default function AnnouncementBanner({ announcement }: { announcement: Announcement | null }) {
  if (!announcement?.body) return null;
  return (
    <div
      style={{
        background: `linear-gradient(90deg, ${C.accentDim}, transparent)`,
        borderBottom: `1px solid ${C.border}`,
        padding: "10px 28px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Megaphone size={15} color={C.accentLight} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: C.text }}>{announcement.body}</span>
      <span className="cl-mono" style={{ fontSize: 11, color: C.textFaint, marginLeft: "auto", flexShrink: 0 }}>
        {new Date(announcement.created_at).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" })}
      </span>
    </div>
  );
}
