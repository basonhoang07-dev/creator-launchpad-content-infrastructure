// app/api/drive/trash-script-folder/route.ts
//
// Called when a script is permanently deleted (Content Calendar → Trash →
// Delete forever). Moves the script's Drive folder to Drive's own trash —
// recoverable by the client from Drive for ~30 days, same as if they'd
// dragged it to trash themselves — rather than destroying it outright, since
// deleting a calendar row is not sufficient reason to make real uploaded
// footage unrecoverable.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { trashDriveFolder } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const { clientId, driveFolderId } = await req.json();
  if (!clientId || !driveFolderId) return NextResponse.json({ ok: true }); // nothing to clean up

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await trashDriveFolder(clientId, driveFolderId);
  return NextResponse.json({ ok: true });
}
