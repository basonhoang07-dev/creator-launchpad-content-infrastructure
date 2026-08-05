// app/api/drive/disconnect/route.ts
//
// "Disconnect" on the Integrations page — deletes the stored OAuth tokens
// entirely (not just flipping a flag) so a stale refresh_token never lingers.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { disconnectDrive } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await disconnectDrive(clientId);
  return NextResponse.json({ ok: true });
}
