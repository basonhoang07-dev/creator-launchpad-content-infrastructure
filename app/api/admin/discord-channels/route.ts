// app/api/admin/discord-channels/route.ts
//
// Backs the Recap Delivery form's Discord channel picker. DISCORD_BOT_TOKEN
// is a server-only secret — the browser can't call Discord's API directly,
// so this proxies listSupportChannels() (lib/discord.ts) for an Admin to
// pick from a real dropdown of actual channel names instead of hand-copying
// a numeric ID out of Discord's UI.

import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { listSupportChannels } from "@/lib/discord";

export async function GET() {
  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "Admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const channels = await listSupportChannels();
  return NextResponse.json({ channels });
}
