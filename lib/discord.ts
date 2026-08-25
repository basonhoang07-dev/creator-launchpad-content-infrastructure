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
  const trimmedName = clientName.trim();
  const target = normalizeChannelName(trimmedName);
  const exact = channels.find((c) => normalizeChannelName(c.name) === target);
  if (exact) return exact.id;

  // Real channels are overwhelmingly named after a first name or Discord
  // username (e.g. "👤-jack"), while clients are stored under their full
  // name (e.g. "Jack Ford") — a full-name match alone misses most of them.
  // Best-guess fallback, same caveat as the rest of this function: can
  // collide if two clients share a first name, which is exactly what the
  // manual discord_channel_id override (Admin Panel → Recap delivery)
  // exists to override precisely.
  const firstWord = trimmedName.split(/\s+/)[0];
  if (firstWord && firstWord !== trimmedName) {
    const firstTarget = normalizeChannelName(firstWord);
    const firstMatch = channels.find((c) => normalizeChannelName(c.name) === firstTarget);
    if (firstMatch) return firstMatch.id;
  }
  return null;
}

export interface RecapActionItemInput {
  body: string;
  due: string | null;
}

export interface RecapEmbedInput {
  clientName: string;
  title: string;
  tldr: string;
  actionItems: RecapActionItemInput[];
  decisions: string[];
  recordingUrl: string | null;
  recapDate: string;
}

// White instead of Nova's brown — same shape otherwise (title, description,
// bolded Action/Decision fields, footer).
const EMBED_COLOR_WHITE = 0xffffff;

// Matches Nova's own "Action" field text exactly: repeats the client's name
// per item, and appends "— Due X" only when the call transcript actually
// stated a deadline for that item (generateRecapFromTranscript never
// fabricates one — due is null when none was mentioned).
function formatActionValue(clientName: string, item: RecapActionItemInput): string {
  return item.due ? `${clientName} — ${item.body} — Due ${item.due}` : `${clientName} — ${item.body}`;
}

export function buildRecapEmbed(input: RecapEmbedInput) {
  const fields: { name: string; value: string }[] = [];
  input.actionItems.forEach((item) => fields.push({ name: "Action", value: formatActionValue(input.clientName, item).slice(0, 1024) }));
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

// Posted to one shared, org-wide accountability channel (not per-client, see
// DISCORD_ACCOUNTABILITY_CHANNEL_ID) — replaces the previous Google Form +
// Zapier chain with a direct post built from the real weekly_logs data the
// client just submitted in-app, so the numbers here can never drift from
// what's actually on their dashboard.
export interface AccountabilityEmbedInput {
  clientName: string;
  weekLabel: string;
  energyLevel: number | null;
  wentWell: string;
  couldImprove: string;
  roadblock: string;
  roadblockAction: string;
  videosFilmed: number;
  cashThisWeek: number;
  dealsClosed: number;
  outreachSent: number;
  nextWeekTasks: string;
}

const EMBED_COLOR_ACCOUNTABILITY = 0x9b59f6;

// Posted to the client's own 1-on-1 channel (same channel resolution as a
// recap — see findChannelIdByClientName) when a tracked creator's video
// crosses that creator's views/24h threshold.
export interface ViralAlertEmbedInput {
  clientName: string;
  creatorHandle: string;
  platform: "tiktok" | "instagram";
  brand: string | null;
  description: string | null;
  url: string | null;
  thumbnail: string | null;
  views: number;
  velocity: number;
}

const EMBED_COLOR_VIRAL = 0xf5a623;

export function buildViralAlertEmbed(input: ViralAlertEmbedInput) {
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Pace", value: `${formatCount(input.velocity)} views / 24h`, inline: true },
    { name: "Total views", value: formatCount(input.views), inline: true },
    { name: "Creator", value: `@${input.creatorHandle}`, inline: true },
  ];
  if (input.brand) fields.push({ name: "Board", value: input.brand, inline: true });

  return {
    title: `🚀 Going viral — @${input.creatorHandle}`.slice(0, 256),
    description: (input.description || "").slice(0, 4096) || undefined,
    color: EMBED_COLOR_VIRAL,
    url: input.url || undefined,
    fields,
    ...(input.thumbnail ? { thumbnail: { url: input.thumbnail } } : {}),
    footer: { text: `Creator Launchpad · Viral Alert · ${input.clientName}` },
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function buildAccountabilityEmbed(input: AccountabilityEmbedInput) {
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Videos filmed", value: String(input.videosFilmed), inline: true },
    { name: "Cash this week", value: `$${input.cashThisWeek.toLocaleString()}`, inline: true },
    { name: "Deals closed", value: String(input.dealsClosed), inline: true },
  ];
  if (input.outreachSent > 0) fields.push({ name: "Outreach sent", value: String(input.outreachSent), inline: true });
  if (input.wentWell) fields.push({ name: "Went well", value: input.wentWell.slice(0, 1024) });
  if (input.couldImprove) fields.push({ name: "Could improve", value: input.couldImprove.slice(0, 1024) });
  if (input.roadblock) fields.push({ name: "Roadblock", value: [input.roadblock, input.roadblockAction].filter(Boolean).join(" → ").slice(0, 1024) });
  if (input.nextWeekTasks) fields.push({ name: "Next week", value: input.nextWeekTasks.slice(0, 1024) });

  return {
    title: `${input.clientName} — Week of ${input.weekLabel}`.slice(0, 256),
    description: input.energyLevel !== null ? `Energy: ${input.energyLevel}/10` : undefined,
    color: EMBED_COLOR_ACCOUNTABILITY,
    fields: fields.slice(0, 25),
    footer: { text: "Creator Launchpad · Weekly Check-In" },
  };
}
