// app/api/google-calendar/disconnect/route.ts
//
// "Disconnect" on the Integrations page for Google Calendar — deletes the
// stored OAuth tokens entirely, same as /api/drive/disconnect.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { disconnectCalendar } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await disconnectCalendar(clientId);
  return NextResponse.json({ ok: true });
}
