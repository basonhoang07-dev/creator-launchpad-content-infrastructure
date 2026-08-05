import React from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { C } from "@/lib/theme";
import { getEmbedUrl } from "@/lib/helpers";

export default function EmbeddedVideoLink({ url, label = "Reference video" }: { url?: string | null; label?: string }) {
  const embedUrl = getEmbedUrl(url);
  if (!url) return null;
  if (!embedUrl) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
        <Link2 size={15} color={C.accentLight} style={{ flexShrink: 0 }} />
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>
          {url}
        </a>
        <ExternalLink size={13} color={C.textFaint} style={{ flexShrink: 0 }} />
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 10.5, color: C.textFaint, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <iframe
        src={embedUrl}
        width="100%"
        height="480"
        frameBorder="0"
        scrolling="no"
        allow="encrypted-media; picture-in-picture"
        style={{ borderRadius: 12, border: `1px solid ${C.border}`, maxWidth: 340, display: "block" }}
        title={label}
      />
    </div>
  );
}
