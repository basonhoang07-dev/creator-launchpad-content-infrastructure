import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findChannelIdByClientName, buildRecapEmbed, listSupportChannels } from "./discord";

describe("buildRecapEmbed", () => {
  it("builds a white-accent embed with title, description, and one field per action/decision", () => {
    const embed = buildRecapEmbed({
      clientName: "Adam",
      title: "Weekly check-in",
      tldr: "Covered pacing.",
      actionItems: ["Post 3x this week", "Film Tuesday"],
      decisions: ["Switch to daily uploads"],
      recordingUrl: "https://fathom.video/x",
      recapDate: "2026-07-22",
    });
    expect(embed.color).toBe(0xffffff);
    expect(embed.title).toBe("Adam — Weekly check-in");
    expect(embed.description).toBe("Covered pacing.");
    expect(embed.url).toBe("https://fathom.video/x");
    expect(embed.footer.text).toBe("Creator Launchpad · 2026-07-22");
    expect(embed.fields).toEqual([
      { name: "Action", value: "Post 3x this week" },
      { name: "Action", value: "Film Tuesday" },
      { name: "Decision", value: "Switch to daily uploads" },
    ]);
  });

  it("omits the url field entirely when there's no recording", () => {
    const embed = buildRecapEmbed({ clientName: "Adam", title: "x", tldr: "", actionItems: [], decisions: [], recordingUrl: null, recapDate: "2026-07-22" });
    expect(embed.url).toBeUndefined();
    expect(embed.fields).toEqual([]);
  });
});

describe("findChannelIdByClientName", () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env = { ...originalEnv, DISCORD_BOT_TOKEN: "", DISCORD_SUPPORT_CATEGORY_ID: "", DISCORD_GUILD_ID: "" };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns null immediately when the bot token or category isn't configured", async () => {
    expect(await findChannelIdByClientName("Adam")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.DISCORD_BOT_TOKEN = "tok";
    expect(await findChannelIdByClientName("Adam")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches a channel by name, ignoring the leading dash and case", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1"; // explicit guild — no /users/@me/guilds call needed
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "wrong-category", name: "-adam", parent_id: "other-cat" },
        { id: "chan-adam", name: "-Adam", parent_id: "cat1" },
        { id: "chan-aidan", name: "-aidan", parent_id: "cat1" },
      ],
    });
    expect(await findChannelIdByClientName("Adam")).toBe("chan-adam");
    expect(fetchMock).toHaveBeenCalledWith("https://discord.com/api/v10/guilds/guild1/channels", { headers: { Authorization: "Bot tok" } });
  });

  it("ignores a leading emoji, not just a leading dash (real channel names are like '👤-adam')", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: "chan-adam", name: "👤-adam", parent_id: "cat1" }] });
    expect(await findChannelIdByClientName("Adam")).toBe("chan-adam");
  });

  it("ignores spaces/dashes/underscores when matching multi-word names", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: "chan-ivan", name: "-ivan-tong", parent_id: "cat1" }] });
    expect(await findChannelIdByClientName("Ivan Tong")).toBe("chan-ivan");
  });

  it("falls back to matching just the first word of a multi-word client name against a first-name-only channel", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: "chan-jack", name: "👤-jack", parent_id: "cat1" }] });
    expect(await findChannelIdByClientName("Jack Ford")).toBe("chan-jack");
  });

  it("prefers an exact full-name match over the first-word fallback", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "chan-jack", name: "👤-jack", parent_id: "cat1" },
        { id: "chan-jackford", name: "👤-jackford", parent_id: "cat1" },
      ],
    });
    expect(await findChannelIdByClientName("Jack Ford")).toBe("chan-jackford");
  });

  it("returns null when no channel in the category matches", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: "chan-rn51", name: "-rn51", parent_id: "cat1" }] });
    expect(await findChannelIdByClientName("Ryan Nguyen")).toBeNull();
  });

  it("auto-detects the guild via /users/@me/guilds when DISCORD_GUILD_ID isn't set, only if the bot is in exactly one server", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/users/@me/guilds")) return Promise.resolve({ ok: true, json: async () => [{ id: "guild-auto" }] });
      if (url.includes("/guilds/guild-auto/channels")) return Promise.resolve({ ok: true, json: async () => [{ id: "chan-adam", name: "-adam", parent_id: "cat1" }] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    expect(await findChannelIdByClientName("Adam")).toBe("chan-adam");
  });

  it("gives up (returns null) rather than guessing when the bot is in multiple servers and no DISCORD_GUILD_ID is set", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: "guild-a" }, { id: "guild-b" }] });
    expect(await findChannelIdByClientName("Adam")).toBeNull();
  });

  it("returns null instead of throwing when the Discord API call fails", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await findChannelIdByClientName("Adam")).toBeNull();
  });
});

describe("listSupportChannels", () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env = { ...originalEnv, DISCORD_BOT_TOKEN: "", DISCORD_SUPPORT_CATEGORY_ID: "", DISCORD_GUILD_ID: "" };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns only channels in the configured category, sorted by name, without the category-scoping field", async () => {
    process.env.DISCORD_BOT_TOKEN = "tok";
    process.env.DISCORD_SUPPORT_CATEGORY_ID = "cat1";
    process.env.DISCORD_GUILD_ID = "guild1";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "z", name: "👤-zoe", parent_id: "cat1" },
        { id: "outside", name: "👤-nope", parent_id: "other-cat" },
        { id: "a", name: "👤-adam", parent_id: "cat1" },
      ],
    });
    expect(await listSupportChannels()).toEqual([
      { id: "a", name: "👤-adam" },
      { id: "z", name: "👤-zoe" },
    ]);
  });

  it("returns an empty list rather than throwing when nothing is configured", async () => {
    expect(await listSupportChannels()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
