"use client";

import React, { useState } from "react";
import { MessageSquare } from "lucide-react";
import { C } from "@/lib/theme";
import { Button, inputStyle } from "@/components/ui";
import { createClient } from "@/lib/supabase";
import { addComment, type CalendarEntry, type Comment } from "@/lib/queries/calendar";
import { useSession } from "@/components/SessionProvider";
import { useToast, toastMessage } from "@/components/Toast";

export default function CommentThread({ entry, onUpdate }: { entry: CalendarEntry; onUpdate: (id: string, patch: Partial<CalendarEntry>) => void }) {
  const { profile } = useSession();
  const { showToast } = useToast();
  const [draft, setDraft] = useState("");
  const comments = entry.comments || [];

  async function postComment() {
    if (!draft.trim()) return;
    try {
      const supabase = createClient();
      const comment: Comment = await addComment(supabase, entry.id, profile.name, profile.role, draft.trim());
      onUpdate(entry.id, { comments: [...comments, comment] });
      setDraft("");
    } catch (err) {
      showToast(toastMessage(err, "Couldn't post that comment — try again."));
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <MessageSquare size={12} color={C.textMuted} />
        <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>Comments {comments.length > 0 ? `(${comments.length})` : ""}</span>
      </div>
      {comments.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 10, maxHeight: 200, overflowY: "auto" }} className="cl-scroll">
          {comments.map((c) => (
            <div key={c.id} style={{ background: C.surface2, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{c.authorName}</span>
                <span className="cl-mono" style={{ fontSize: 9.5, color: C.textFaint }}>{c.authorRole}</span>
                <span style={{ fontSize: 9.5, color: C.textFaint, marginLeft: "auto" }}>
                  {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.4 }}>{c.text}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") postComment();
          }}
          placeholder="Leave a note for the editor or client..."
        />
        <Button size="sm" onClick={postComment} disabled={!draft.trim()}>
          Post
        </Button>
      </div>
    </div>
  );
}
