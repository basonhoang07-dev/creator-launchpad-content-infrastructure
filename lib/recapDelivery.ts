// lib/recapDelivery.ts
//
// Fan-out for a freshly generated recap: a Discord message to the client's
// 1-on-1 channel, an email to the client with the same to-do list, and an
// Obsidian vault note filed under that client. Called from both the manual
// "New Recap" route and the Fathom webhook (lib/generateRecap.ts already
// documented that both entry points should behave identically) — same
// delivery whether a human pasted the transcript or Fathom triggered it.
//
// Every channel here is opt-in via env var / per-client settings, and
// independently best-effort: a missing webhook URL, missing API key, or a
// filesystem error never throws back into the caller — the recap is already
// saved in the database by the time this runs, and one channel failing
// should never take down the others or the request.
//
// Setup:
//   - Discord: channel resolution order per client —
//       1. discord_channel_id if set on the client (Admin Panel → Recap
//          delivery) — explicit override, always wins.
//       2. Otherwise, auto-discovery: set DISCORD_BOT_TOKEN and
//          DISCORD_SUPPORT_CATEGORY_ID (the category all the 1-on-1
//          channels live under), and it matches the client's name against
//          the channel names in that category (see lib/discord.ts). This is
//          the point — with 14+ real client channels, typing in a channel
//          ID for each one by hand doesn't scale.
//       3. No match on either → Discord delivery is skipped for that
//          client, not an error.
//     Once a channel ID is resolved, it posts as an embed (white accent bar
//     — see lib/discord.ts) via the bot if DISCORD_BOT_TOKEN is set,
//     falling back to discord_webhook_url (plain webhook, no bot needed) if
//     not.
//   - Email: off by default — Fathom already emails call participants
//     directly, so this is redundant unless that ever changes. Still here or
//     set RESEND_API_KEY (https://resend.com) if you want CL to send its own
//     branded recap email later. Sends to `google_meet_email` (the only
//     email on file for a client record today).
//   - Obsidian: set OBSIDIAN_VAULT_PATH to the absolute path of your vault
//     on disk (e.g. "C:\\Users\\bason\\Documents\\MyVault"). Only works when
//     this server process can see that path — true for `npm run dev` on
//     your own machine, NOT true if this app gets deployed to a host that
//     isn't your computer. If you deploy elsewhere later, this channel needs
//     to change to something like syncing through a GitHub repo instead —
//     ask for that when it's actually time to deploy.

import fs from "fs/promises";
import path from "path";
import { findChannelIdByClientName, buildRecapEmbed } from "@/lib/discord";

interface RecapClient {
  id: string;
  name: string;
  google_meet_email?: string | null;
  discord_webhook_url?: string | null;
  discord_channel_id?: string | null;
}
interface RecapRow {
  id: string;
  title: string;
  recap_date: string;
  recording_url: string | null;
  transcript?: string | null;
}
interface ParsedRecap {
  title: string;
  tldr: string;
  actionItems: { body: string; due: string | null }[];
  decisions: string[];
}

export async function deliverRecap(client: RecapClient, recap: RecapRow, parsed: ParsedRecap) {
  await Promise.allSettled([notifyDiscord(client, recap, parsed), emailClient(client, recap, parsed), writeObsidianNote(client, recap, parsed)]);
}

async function notifyDiscord(client: RecapClient, recap: RecapRow, parsed: ParsedRecap) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = client.discord_channel_id || (botToken ? await findChannelIdByClientName(client.name) : null);

  const embed = buildRecapEmbed({
    clientName: client.name,
    title: parsed.title,
    tldr: parsed.tldr,
    actionItems: parsed.actionItems,
    decisions: parsed.decisions,
    recordingUrl: recap.recording_url,
    recapDate: recap.recap_date,
  });

  if (botToken && channelId) {
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
      if (!res.ok) console.error("[recapDelivery] Discord bot post failed", res.status, await res.text());
      return;
    } catch (err) {
      console.error("[recapDelivery] Discord bot post failed", err);
      return;
    }
  }

  if (!client.discord_webhook_url) return;
  try {
    await fetch(client.discord_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error("[recapDelivery] Discord webhook post failed", err);
  }
}

async function emailClient(client: RecapClient, recap: RecapRow, parsed: ParsedRecap) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !client.google_meet_email) return;
  const from = process.env.EMAIL_FROM || "Creator Launchpad <onboarding@resend.dev>";
  const html = `
    <h2>${escapeHtml(parsed.title)}</h2>
    <p>${escapeHtml(parsed.tldr)}</p>
    ${parsed.actionItems.length ? `<h3>To-dos</h3><ul>${parsed.actionItems.map((item) => `<li>${escapeHtml(item.body)}${item.due ? ` <i>(Due ${escapeHtml(item.due)})</i>` : ""}</li>`).join("")}</ul>` : ""}
    ${parsed.decisions.length ? `<h3>Decisions</h3><ul>${parsed.decisions.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}
    ${recap.recording_url ? `<p><a href="${recap.recording_url}">Watch the recording</a></p>` : ""}
  `.trim();
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: client.google_meet_email, subject: `Call recap: ${parsed.title}`, html }),
    });
  } catch (err) {
    console.error("[recapDelivery] Email failed", err);
  }
}

function escapeHtml(s: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

async function writeObsidianNote(client: RecapClient, recap: RecapRow, parsed: ParsedRecap) {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) return;
  try {
    // Lands next to whatever Claudian already writes for the same call
    // (vault convention: "01 Coaching Calls/{date} 1-on-1 {Client Name}.md")
    // rather than a separate folder tree — same place, cross-linked, and the
    // " — CL Recap" suffix means this can never collide with or overwrite
    // Claudian's own note for that call.
    const callsDir = path.join(vaultPath, "01 Coaching Calls");
    await fs.mkdir(callsDir, { recursive: true });
    const claudianNoteStem = `${recap.recap_date} 1-on-1 ${sanitizeFilename(client.name)}`;
    const fileName = `${claudianNoteStem} — CL Recap.md`;
    const frontmatter = [
      "---",
      `date: ${recap.recap_date}`,
      "type: 1-on-1",
      `attendees: [${client.name}]`,
      recap.recording_url ? `fathom_url: ${recap.recording_url}` : null,
      "recap_source: creator-launchpad",
      "---",
    ].filter((l): l is string => l !== null);
    const body = [
      ...frontmatter,
      "",
      `# ${parsed.title}`,
      "",
      `_Companion recap to [[01 Coaching Calls/${claudianNoteStem}]]_`,
      "",
      parsed.tldr,
      "",
      "## To-dos",
      ...(parsed.actionItems.length ? parsed.actionItems.map((item) => `- [ ] ${item.body}${item.due ? ` (Due ${item.due})` : ""}`) : ["_none_"]),
      "",
      "## Decisions",
      ...(parsed.decisions.length ? parsed.decisions.map((t) => `- ${t}`) : ["_none_"]),
      ...(recap.transcript
        ? ["", ">[!note]- Transcript", ...recap.transcript.split("\n").map((l) => `>${l}`)]
        : []),
    ].join("\n");
    await fs.writeFile(path.join(callsDir, fileName), body, "utf-8");
  } catch (err) {
    console.error("[recapDelivery] Obsidian note write failed", err);
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}
