// app/api/google-calendar/sync-availability/route.ts
//
// Called by AvailabilityEditor right after an availability block is saved
// or deleted, to keep the client's real Google Calendar in sync. A no-op
// (not an error) if they've never connected Calendar — see
// lib/google-calendar.ts's syncAvailabilityBlock/deleteAvailabilityEvent.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { syncAvailabilityBlock, deleteAvailabilityEvent } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clientId, action } = body;
  if (!clientId || !action) return NextResponse.json({ error: "Missing clientId or action" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;

  try {
    if (action === "delete") {
      if (!body.googleEventId) return NextResponse.json({ ok: true }); // nothing was ever synced for this block
      await deleteAvailabilityEvent(clientId, body.googleEventId);
      return NextResponse.json({ ok: true });
    }

    if (action === "sync") {
      const { blockId, timeZone } = body;
      if (!blockId) return NextResponse.json({ error: "Missing blockId" }, { status: 400 });
      const { data: block, error } = await supabase.from("availability_blocks").select("*").eq("id", blockId).single();
      if (error) throw error;

      const eventId = await syncAvailabilityBlock(clientId, block, timeZone || "UTC");
      if (eventId && eventId !== block.google_event_id) {
        await supabase.from("availability_blocks").update({ google_event_id: eventId }).eq("id", blockId);
      }
      return NextResponse.json({ ok: true, googleEventId: eventId });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    // Calendar sync is a best-effort side effect of saving a block, not the
    // block save itself — surface the failure but don't make the caller
    // treat it as fatal (the block is already saved either way).
    return NextResponse.json({ error: err instanceof Error ? err.message : "Google Calendar sync failed" }, { status: 500 });
  }
}
