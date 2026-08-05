// app/api/drive/create-script-folder/route.ts
//
// Called right after a new calendar_entries row (a "script") is created.
// Safely no-ops if the client hasn't connected Google Drive yet — same
// "leave both blank to disable" pattern as the Discord/Fathom integrations,
// just discovered per-client at request time instead of via env var.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureScriptFolder, driveOAuthConfigured } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const { entryId } = await req.json();
  if (!entryId) return NextResponse.json({ error: "Missing entryId" }, { status: 400 });
  if (!driveOAuthConfigured()) return NextResponse.json({ skipped: true });

  // RLS on calendar_entries ("client-scoped access") already enforces that
  // the signed-in user can see this row — no separate auth check needed.
  const supabase = createServerSupabaseClient();
  const { data: entry, error } = await supabase.from("calendar_entries").select("id, client_id, brand, title").eq("id", entryId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entry) return NextResponse.json({ error: "Script not found" }, { status: 404 });

  try {
    const url = await ensureScriptFolder(entry.client_id, entry.brand, entry.title);
    if (!url) return NextResponse.json({ skipped: true });

    const admin = createAdminSupabaseClient();
    await admin.from("calendar_entries").update({ drive_folder_url: url }).eq("id", entryId);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    // A Drive hiccup shouldn't be treated as the script creation having
    // failed — the caller already has its entry either way.
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't create the Drive folder" }, { status: 500 });
  }
}
