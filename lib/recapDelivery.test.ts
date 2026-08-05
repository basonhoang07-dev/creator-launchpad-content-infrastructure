import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { deliverRecap } from "./recapDelivery";

const client = { id: "c1", name: "Adam", google_meet_email: null as string | null, discord_webhook_url: null as string | null };
const recap = { id: "r1", title: "Weekly check-in", recap_date: "2026-07-22", recording_url: "https://fathom.video/x", transcript: "Coach: hey\nClient: hey" };
const parsed = { title: "Weekly check-in", tldr: "Covered content pacing.", actionItems: ["Post 3x this week"], decisions: ["Switch to daily uploads"] };

describe("deliverRecap", () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      OBSIDIAN_VAULT_PATH: "",
      DISCORD_BOT_TOKEN: "",
      DISCORD_SUPPORT_CATEGORY_ID: "",
      DISCORD_GUILD_ID: "",
    };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("no-ops on every channel when nothing is configured — never throws", async () => {
    await expect(deliverRecap(client, recap, parsed)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Discord when the client has a webhook URL, regardless of other channels", async () => {
    await deliverRecap({ ...client, discord_webhook_url: "https://discord.com/api/webhooks/xyz" }, recap, parsed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/webhooks/xyz");
    const body = JSON.parse(opts.body);
    expect(body.embeds[0].title).toContain("Weekly check-in");
    expect(body.embeds[0].fields.some((f: any) => f.value === "Post 3x this week")).toBe(true);
  });

  it("posts via the bot when a channel ID and bot token are both set, and skips the webhook fallback", async () => {
    process.env.DISCORD_BOT_TOKEN = "bot_test_token";
    await deliverRecap({ ...client, discord_channel_id: "999888777", discord_webhook_url: "https://discord.com/api/webhooks/should-not-be-used" }, recap, parsed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/channels/999888777/messages");
    expect(opts.headers.Authorization).toBe("Bot bot_test_token");
    const body = JSON.parse(opts.body);
    expect(body.embeds[0].title).toContain("Weekly check-in");
    expect(body.embeds[0].color).toBe(0xffffff);
  });

  it("falls back to the webhook URL when a bot token is set but the client has no channel ID and auto-discovery isn't configured", async () => {
    process.env.DISCORD_BOT_TOKEN = "bot_test_token";
    await deliverRecap({ ...client, discord_webhook_url: "https://discord.com/api/webhooks/xyz" }, recap, parsed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://discord.com/api/webhooks/xyz");
  });

  it("auto-discovers the channel by client name when no explicit channel ID is set", async () => {
    process.env.DISCORD_BOT_TOKEN = "bot_test_token";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/channels")) {
        return Promise.resolve({ ok: true, json: async () => [{ id: "chan-adam", name: "-adam", parent_id: "cat1" }, { id: "chan-other", name: "-someoneelse", parent_id: "cat1" }] });
      }
      return Promise.resolve({ ok: true });
    });
    await deliverRecap(client, recap, parsed);
    const messageCall = fetchMock.mock.calls.find(([url]) => url.includes("/messages"));
    expect(messageCall?.[0]).toBe("https://discord.com/api/v10/channels/chan-adam/messages");
  });

  it("skips email when RESEND_API_KEY is unset even if the client has an email on file", async () => {
    await deliverRecap({ ...client, google_meet_email: "adam@example.com" }, recap, parsed);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emails the client's google_meet_email when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    await deliverRecap({ ...client, google_meet_email: "adam@example.com" }, recap, parsed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(opts.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(opts.body);
    expect(body.to).toBe("adam@example.com");
    expect(body.html).toContain("Post 3x this week");
  });

  it("writes a per-client Obsidian note when OBSIDIAN_VAULT_PATH is set", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "cl-obsidian-test-"));
    process.env.OBSIDIAN_VAULT_PATH = vault;
    try {
      await deliverRecap(client, recap, parsed);
      const notePath = path.join(vault, "01 Coaching Calls", "2026-07-22 1-on-1 Adam — CL Recap.md");
      const content = await fs.readFile(notePath, "utf-8");
      expect(content).toContain("attendees: [Adam]");
      expect(content).toContain("- [ ] Post 3x this week");
      expect(content).toContain("- Switch to daily uploads");
      expect(content).toContain(">Coach: hey");
      expect(content).toContain("[[01 Coaching Calls/2026-07-22 1-on-1 Adam]]");
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it("never collides with Claudian's own note for the same call", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "cl-obsidian-test-"));
    process.env.OBSIDIAN_VAULT_PATH = vault;
    try {
      const callsDir = path.join(vault, "01 Coaching Calls");
      await fs.mkdir(callsDir, { recursive: true });
      const claudianPath = path.join(callsDir, "2026-07-22 1-on-1 Adam.md");
      await fs.writeFile(claudianPath, "Claudian's own synopsis — must survive untouched.", "utf-8");

      await deliverRecap(client, recap, parsed);

      expect(await fs.readFile(claudianPath, "utf-8")).toBe("Claudian's own synopsis — must survive untouched.");
      const ours = await fs.readFile(path.join(callsDir, "2026-07-22 1-on-1 Adam — CL Recap.md"), "utf-8");
      expect(ours).toContain("Weekly check-in");
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it("sanitizes client names that contain filesystem-unsafe characters", async () => {
    const vault = await fs.mkdtemp(path.join(os.tmpdir(), "cl-obsidian-test-"));
    process.env.OBSIDIAN_VAULT_PATH = vault;
    try {
      await deliverRecap({ ...client, name: 'Client/"Weird": Name' }, recap, parsed);
      const dirEntries = await fs.readdir(path.join(vault, "01 Coaching Calls"));
      expect(dirEntries).toEqual(["2026-07-22 1-on-1 Client--Weird-- Name — CL Recap.md"]);
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
