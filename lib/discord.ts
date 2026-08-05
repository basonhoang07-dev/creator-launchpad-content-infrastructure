// lib/discord.ts
//
// Two jobs: find which Discord channel a client's 1-on-1 support channel
// actually is (without needing a manually-entered ID for every one of them —
// Akira has 14+ real clients each with their own channel under one
// category), and build the recap embed in the same visual format as the
// existing "Nova Recap" bot he already uses in that server (colored left
// bar, title, description, bolded "Action" fields, footer) — just white
// instead of Nova's brown.
//
// Channel resolution order, per client:
//   1. clients.discord_channel_id if set (Admin Panel → Recap delivery,
//      picked from a real dropdown of the category's channels — see
//      app/api/admin/discord-channels) — always wins. This is required, not
//      just a fallback, for real channels: the live channel list has names
//      like "👤-fatim" or "👤-ghrndz72" (usernames/nicknames, not the
//      client's actual name), so name-matching alone will always miss some.
//   2. Otherwise, if DISCORD_BOT_TOKEN + DISCORD_SUPPORT_CATEGORY_ID are
//      set, best-effort match by name against every channel in that
//      category — this is what pre-fills the dropdown's best guess and is
//      also used directly at delivery time for any client that was never
//      manually mapped.
//   3. No match → Discord delivery for that recap is skipped, same as any
//      other not-configured channel.

const DISCORD_API = "https://discord.com/api/v10";

// Channel names in the real server are like "👤-adam" or "👤-ivan-tong" —
// strip every non-alphanumeric character (not just a leading dash) so the
// emoji, dashes, spaces, and underscores all get ignored the same way,
// regardless of where they land in the string.
// Exported so the Admin Panel's picker (a client component, no access to
// DISCORD_BOT_TOKEN) can compute the same "best guess" pre-selection using
// exactly this rule, instead of a second copy that could drift from it.
export function normalizeChannelName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// The bot only needs to be in one server for this app — if DISCORD_GUILD_ID
// isn't set explicitly, ask Discord which guilds the bot's in and use it if
// there's exactly one. Not cached: this app's recap volume is a handful a
// day, so the extra call is negligible, and not caching means a future
// second-server invite (or a first-time invite after startup) is picked up
// immediately instead of needing a server restart.
async function resolveGuildId(token: string): Promise<string | null> {
  if (process.env.DISCORD_GUILD_ID) return process.env.DISCORD_GUILD_ID;
  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bot ${token}` } });
    if (!res.ok) return null;
    const guilds: any[] = await res.json();
    return guilds.length === 1 ? guilds[0].id : null;
  } catch {
    return null;
  }
}

export interface SupportChannel {
  id: string;
  name: string;
}

// Every channel in the configured support category — used both to power
// the Admin Panel's picker dropdown and as the source list for best-guess
// name matching below.
export async function listSupportChannels(): Promise<SupportChannel[]> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const categoryId = process.env.DISCORD_SUPPORT_CATEGORY_ID;
  if (!token || !categoryId) return [];

  const guildId = await resolveGuildId(token);
  if (!guildId) return [];

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${token}` } });
    if (!res.ok) return [];
    const channels: any[] = await res.json();
    return channels
      .filter((c) => c.parent_id === categoryId)
      .map((c) => ({ id: c.id, name: c.name || "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function findChannelIdByClientName(clientName: string): Promise<string | null> {
  const channels = await listSupportChannels();
  const target = normalizeChannelName(clientName);
  const match = channels.find((c) => normalizeChannelName(c.name) === target);
  return match?.id || null;
}

export interface RecapEmbedInput {
  clientName: string;
  title: string;
  tldr: string;
  actionItems: string[];
  decisions: string[];
  recordingUrl: string | null;
  recapDate: string;
}

// White instead of Nova's brown — same shape otherwise (title, description,
// bolded Action/Decision fields, footer).
const EMBED_COLOR_WHITE = 0xffffff;

export function buildRecapEmbed(input: RecapEmbedInput) {
  const fields: { name: string; value: string }[] = [];
  input.actionItems.forEach((text) => fields.push({ name: "Action", value: text.slice(0, 1024) }));
  input.decisions.forEach((text) => fields.push({ name: "Decision", value: text.slice(0, 1024) }));

  return {
    title: `${input.clientName} — ${input.title}`.slice(0, 256),
    description: (input.tldr || "").slice(0, 4096),
    color: EMBED_COLOR_WHITE,
    url: input.recordingUrl || undefined,
    fields: fields.slice(0, 25), // Discord's hard limit per embed
    footer: { text: `Creator Launchpad · ${input.recapDate}` },
  };
}
