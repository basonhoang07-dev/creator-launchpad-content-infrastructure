// app/api/extension/key/route.ts
//
// Issues and reveals the browser extension's connection key.
//
// Separate from the extension's own two routes because this one is the
// opposite direction: it's called from inside the app by a signed-in user,
// and it's the only place the key is ever handed out. The extension routes
// only ever consume it.
//
// GET reveals the current key, POST rotates it. Rotation is the revoke
// button — there's no list of installed extensions to remove one from, so
// replacing the key is how you cut off a copy you no longer control.

import { NextRequest, NextResponse } from "next/server";
import { requireClientAccess } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateExtensionToken } from "@/lib/extensionAuth";

async function tokenFor(clientId: string, rotate: boolean): Promise<string> {
  const admin = createAdminSupabaseClient();

  if (!rotate) {
    const { data } = await admin.from("clients").select("extension_token").eq("id", clientId).maybeSingle();
    if (data?.extension_token) return data.extension_token;
  }

  // Issued lazily: a client who never installs the extension never gets a
  // credential, which is one fewer thing to leak.
  const token = generateExtensionToken();
  await admin.from("clients").update({ extension_token: token }).eq("id", clientId);
  return token;
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId") || "";
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  return NextResponse.json({ token: await tokenFor(clientId, false) });
}

export async function POST(req: NextRequest) {
  const { clientId } = await req.json();
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  return NextResponse.json({ token: await tokenFor(clientId, true), rotated: true });
}
