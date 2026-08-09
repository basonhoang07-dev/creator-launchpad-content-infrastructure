// app/api/google-calendar/events/route.ts
//
// Read-only pull of a client's real Google Calendar events for a date range,
// for AvailabilityEditor to render alongside availability blocks. Empty
// array (not an error) if they've never connected Calendar.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { listUpcomingEvents } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!clientId || !start || !end) return NextResponse.json({ error: "Missing clientId, start, or end" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const events = await listUpcomingEvents(clientId, start, end);
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load Google Calendar events" }, { status: 500 });
  }
}
