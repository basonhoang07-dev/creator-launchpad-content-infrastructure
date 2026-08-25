import { describe, it, expect } from "vitest";
import { bonusForEntry, computeAutoSchedule, buildRepeatWinningConceptFields, type CalendarEntry } from "@/lib/queries/calendar";
import type { AvailabilityBlock } from "@/lib/helpers";
import type { Campaign } from "@/lib/queries/kpi";

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: "e1",
    brand: "Acme",
    title: "Untitled",
    format: "Talking head",
    script: "",
    date: null,
    batch: null,
    status: "Unscripted",
    editorProfileId: null,
    referenceLink: "",
    rawVideoLink: "",
    finalVideoLink: "",
    notes: "",
    posted: false,
    viewCount: 0,
    bonusLogged: false,
    driveFolderId: null,
    driveFolderUrl: null,
    comments: [],
    sortOrder: 0,
    referenceTranscript: null,
    referenceFramework: null,
    ...overrides,
  };
}

function campaign(overrides: Partial<Campaign>): Campaign {
  return {
    id: "c1",
    brand: "Acme",
    rate: 25,
    minPosts: 1,
    maxPosts: 2,
    sessionCapacity: 0,
    bonusTiers: [],
    ...overrides,
  };
}

function block(overrides: Partial<AvailabilityBlock>): AvailabilityBlock {
  return {
    id: "b1",
    client_id: "client-1",
    label: "Filming",
    block_date: "2024-01-01",
    all_day: true,
    start_time: null,
    end_time: null,
    repeat_freq: "none",
    ...overrides,
  };
}

describe("bonusForEntry", () => {
  it("returns null when the entry's brand has no matching campaign", () => {
    const e = entry({ brand: "Nobody's Campaign", viewCount: 50000 });
    expect(bonusForEntry(e, [campaign({ brand: "Acme" })])).toBeNull();
  });

  it("returns null when no tier's view threshold has been crossed yet", () => {
    const e = entry({ viewCount: 5000 });
    const c = campaign({ bonusTiers: [{ id: "t1", views: 10000, bonus: 50 }] });
    expect(bonusForEntry(e, [c])).toBeNull();
  });

  it("returns the tier once its view threshold is crossed", () => {
    const e = entry({ viewCount: 10000 });
    const c = campaign({ bonusTiers: [{ id: "t1", views: 10000, bonus: 50 }] });
    expect(bonusForEntry(e, [c])?.bonus).toBe(50);
  });

  it("among multiple eligible tiers, picks the highest BONUS, not the highest view threshold", () => {
    // Deliberately construct a case where they'd disagree: the 20k-view tier
    // pays out more than the 50k-view tier. bonusForEntry must pick $80, not
    // just "the tier with the biggest views number" or "the last one crossed".
    const e = entry({ viewCount: 60000 });
    const c = campaign({
      bonusTiers: [
        { id: "t1", views: 10000, bonus: 30 },
        { id: "t2", views: 20000, bonus: 80 },
        { id: "t3", views: 50000, bonus: 40 },
      ],
    });
    expect(bonusForEntry(e, [c])?.id).toBe("t2");
    expect(bonusForEntry(e, [c])?.bonus).toBe(80);
  });

  // Ported quirk from the prototype, worth pinning down with a test: a tier
  // whose `views` is 0/falsy is treated as UNREACHABLE (Number(0) || Infinity
  // -> Infinity), not as "always eligible". A malformed/zeroed tier should
  // never silently pay out.
  it("treats a tier with views=0 as unreachable, not as an always-on bonus", () => {
    const e = entry({ viewCount: 1 });
    const c = campaign({ bonusTiers: [{ id: "t1", views: 0, bonus: 999 }] });
    expect(bonusForEntry(e, [c])).toBeNull();
  });

  it("zero view count never qualifies for any real tier", () => {
    const e = entry({ viewCount: 0 });
    const c = campaign({ bonusTiers: [{ id: "t1", views: 1000, bonus: 50 }] });
    expect(bonusForEntry(e, [c])).toBeNull();
  });
});

describe("computeAutoSchedule", () => {
  it("continues from the day after the latest scheduled entry across ALL brands, not from today", () => {
    const scheduledAll = [entry({ id: "existing", date: "2024-01-10" })];
    const unscheduled = [entry({ id: "u1" }), entry({ id: "u2" })];
    const placements = computeAutoSchedule(unscheduled, scheduledAll, [], 2);
    expect(placements).toEqual([
      { id: "u1", date: "2024-01-11" },
      { id: "u2", date: "2024-01-11" },
    ]);
  });

  it("batches exactly dailyVolume entries per day, then rolls to the next day", () => {
    const scheduledAll = [entry({ id: "existing", date: "2024-01-10" })];
    const unscheduled = [entry({ id: "u1" }), entry({ id: "u2" }), entry({ id: "u3" }), entry({ id: "u4" }), entry({ id: "u5" })];
    const placements = computeAutoSchedule(unscheduled, scheduledAll, [], 2);
    expect(placements.map((p) => p.date)).toEqual(["2024-01-11", "2024-01-11", "2024-01-12", "2024-01-12", "2024-01-13"]);
  });

  it("skips a day that isn't filmable and resumes batching on the next filmable day", () => {
    const scheduledAll = [entry({ id: "existing", date: "2024-01-10" })];
    const unscheduled = [entry({ id: "u1" }), entry({ id: "u2" })];
    // 2024-01-11 is marked fully unavailable -> must be skipped entirely.
    const blocks = [block({ label: "Unavailable", all_day: true, block_date: "2024-01-11" })];
    const placements = computeAutoSchedule(unscheduled, scheduledAll, blocks, 2);
    expect(placements).toEqual([
      { id: "u1", date: "2024-01-12" },
      { id: "u2", date: "2024-01-12" },
    ]);
  });

  it("with no prior scheduled entries, starts from today", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const placements = computeAutoSchedule([entry({ id: "u1" })], [], [], 1);
    expect(placements).toEqual([{ id: "u1", date: todayStr }]);
  });

  it("returns no placements when there's nothing unscheduled to place", () => {
    expect(computeAutoSchedule([], [entry({ date: "2024-01-10" })], [], 2)).toEqual([]);
  });
});

describe("buildRepeatWinningConceptFields", () => {
  it("replaces a script's leading 'Hook:' line with a fresh-hook placeholder, keeping the body untouched", () => {
    const source = entry({ title: "Winning concept", script: "Hook: this is the opener\n\nBody: rest of the script stays exactly the same" });
    const result = buildRepeatWinningConceptFields(source);
    expect(result.script).toContain("[Write a fresh hook here");
    expect(result.script).not.toContain("this is the opener");
    expect(result.script).toContain("Body: rest of the script stays exactly the same");
  });

  it("prepends a fresh-hook placeholder instead when the script has no 'Hook:' line at all", () => {
    const source = entry({ title: "No hook label", script: "Just straight into the content, no Hook: label up top." });
    const result = buildRepeatWinningConceptFields(source);
    expect(result.script.startsWith("[Write a fresh hook here")).toBe(true);
    expect(result.script).toContain("Just straight into the content, no Hook: label up top.");
  });

  it("titles the new concept '(remix)' and preserves brand/format/reference link", () => {
    const source = entry({ title: "Original", brand: "Vela", format: "Demo", referenceLink: "https://example.com/ref", script: "Hook: x" });
    const result = buildRepeatWinningConceptFields(source);
    expect(result.title).toBe("Original (remix)");
    expect(result.brand).toBe("Vela");
    expect(result.format).toBe("Demo");
    expect(result.referenceLink).toBe("https://example.com/ref");
  });
});
