import { describe, it, expect } from "vitest";
import {
  isDayFilmable,
  blockOccursOn,
  occurrencesOn,
  monthlyIncomeHistory,
  isWeekActuallyLogged,
  nextOccurrence,
  getWeekKey,
  type AvailabilityBlock,
  type WeeklyLog,
} from "@/lib/helpers";

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

describe("blockOccursOn", () => {
  it("matches a one-off block only on its exact date", () => {
    const b = block({ block_date: "2024-01-15", repeat_freq: "none" });
    expect(blockOccursOn(b, "2024-01-15")).toBe(true);
    expect(blockOccursOn(b, "2024-01-16")).toBe(false);
    expect(blockOccursOn(b, "2024-01-14")).toBe(false);
  });

  it("a daily block occurs every day on or after its start date, never before", () => {
    const b = block({ block_date: "2024-01-10", repeat_freq: "daily" });
    expect(blockOccursOn(b, "2024-01-10")).toBe(true);
    expect(blockOccursOn(b, "2024-02-01")).toBe(true);
    expect(blockOccursOn(b, "2024-01-09")).toBe(false);
  });

  it("a weekly block recurs on the same weekday as its anchor date", () => {
    // 2024-01-08 is a Monday
    const b = block({ block_date: "2024-01-08", repeat_freq: "weekly" });
    expect(blockOccursOn(b, "2024-01-15")).toBe(true); // next Monday
    expect(blockOccursOn(b, "2024-01-16")).toBe(false); // Tuesday
    expect(blockOccursOn(b, "2024-01-01")).toBe(false); // before anchor, even though same weekday
  });

  it("a weekday block occurs Mon-Fri on or after its start date, never on weekends", () => {
    const b = block({ block_date: "2024-01-01", repeat_freq: "weekday" });
    expect(blockOccursOn(b, "2024-01-08")).toBe(true); // Monday
    expect(blockOccursOn(b, "2024-01-13")).toBe(false); // Saturday
    expect(blockOccursOn(b, "2024-01-14")).toBe(false); // Sunday
  });
});

describe("isDayFilmable", () => {
  it("defaults to filmable when there are no blocks configured for that day at all", () => {
    expect(isDayFilmable([], "2024-01-15")).toBe(true);
  });

  it("is filmable when a Filming block occurs that day", () => {
    const blocks = [block({ label: "Filming", block_date: "2024-01-15" })];
    expect(isDayFilmable(blocks, "2024-01-15")).toBe(true);
  });

  it("is NOT filmable when marked Unavailable all day", () => {
    const blocks = [block({ label: "Unavailable", all_day: true, block_date: "2024-01-15" })];
    expect(isDayFilmable(blocks, "2024-01-15")).toBe(false);
  });

  // Subtle rule, easy to get wrong when reading the function name alone: a day
  // that has SOME block configured, but that block is neither "Filming" nor an
  // all-day "Unavailable", is still NOT filmable — occurrences.length > 0 with
  // no Filming block present falls through to `false`, not the "no blocks = open" default.
  it("is NOT filmable when the only block that day is neither Filming nor all-day Unavailable", () => {
    const blocks = [block({ label: "Scripting", all_day: true, block_date: "2024-01-15" })];
    expect(isDayFilmable(blocks, "2024-01-15")).toBe(false);
  });

  it("an Unavailable block that is NOT all-day does not block the day by itself", () => {
    const blocks = [block({ label: "Unavailable", all_day: false, start_time: "09:00", end_time: "11:00", block_date: "2024-01-15" })];
    // Not all-day Unavailable, and no Filming block either -> still falls to false
    // per the same rule as above (occurrences exist, none are Filming).
    expect(isDayFilmable(blocks, "2024-01-15")).toBe(false);
  });

  it("Unavailable (all day) wins even if a Filming block is also configured that day", () => {
    const blocks = [
      block({ label: "Filming", block_date: "2024-01-15" }),
      block({ id: "b2", label: "Unavailable", all_day: true, block_date: "2024-01-15" }),
    ];
    expect(isDayFilmable(blocks, "2024-01-15")).toBe(false);
  });
});

describe("occurrencesOn", () => {
  it("returns every block whose recurrence includes the given date", () => {
    const blocks = [
      block({ id: "b1", label: "Filming", block_date: "2024-01-15", repeat_freq: "none" }),
      block({ id: "b2", label: "Unavailable", block_date: "2024-01-01", repeat_freq: "weekly" }),
      block({ id: "b3", label: "Editing", block_date: "2024-06-01", repeat_freq: "none" }),
    ];
    const occ = occurrencesOn(blocks, "2024-01-15");
    expect(occ.map((b) => b.id).sort()).toEqual(["b1", "b2"]);
  });
});

describe("nextOccurrence", () => {
  it("advances weekly by 7 days", () => {
    expect(nextOccurrence("2024-01-01", "weekly")).toBe("2024-01-08");
  });
  it("advances biweekly by 14 days", () => {
    expect(nextOccurrence("2024-01-01", "biweekly")).toBe("2024-01-15");
  });
  it("advances monthly by 1 calendar month", () => {
    expect(nextOccurrence("2024-01-31", "monthly")).toBe("2024-03-02"); // JS Date month-overflow behavior, ported as-is
  });
});

function log(overrides: Partial<WeeklyLog>): WeeklyLog {
  return {
    id: "log-1",
    weekOf: "2024-01-08",
    campaignEntries: [],
    ugcOneOff: 0,
    ...overrides,
  };
}

describe("isWeekActuallyLogged", () => {
  it("is false for a null/undefined log", () => {
    expect(isWeekActuallyLogged(null)).toBe(false);
    expect(isWeekActuallyLogged(undefined)).toBe(false);
  });

  it("is false when every campaign entry is zeroed and there's no UGC one-off", () => {
    const l = log({ campaignEntries: [{ campaignBrand: "Acme", videosFilmed: 0, amountEarned: 0, bonusEarned: 0 }], ugcOneOff: 0 });
    expect(isWeekActuallyLogged(l)).toBe(false);
  });

  it("is true when a campaign entry has real videos or earnings, even if other fields are zero", () => {
    const l = log({ campaignEntries: [{ campaignBrand: "Acme", videosFilmed: 2, amountEarned: 0, bonusEarned: 0 }] });
    expect(isWeekActuallyLogged(l)).toBe(true);
  });

  it("is true from a UGC one-off alone, with no campaign entries at all", () => {
    const l = log({ campaignEntries: [], ugcOneOff: 150 });
    expect(isWeekActuallyLogged(l)).toBe(true);
  });

  // This is the exact scenario applyBonusToLog creates: a log that exists only
  // because a bonus got auto-logged into it, with the real weekly numbers never filled in.
  it("is false for a log that exists purely from an auto-logged bonus (bonusEarned > 0, everything else 0)", () => {
    const l = log({ campaignEntries: [{ campaignBrand: "Acme", videosFilmed: 0, amountEarned: 0, bonusEarned: 75 }] });
    expect(isWeekActuallyLogged(l)).toBe(false);
  });
});

describe("monthlyIncomeHistory", () => {
  it("buckets logs by month and sums campaign earnings + bonuses + UGC one-offs", () => {
    const logs: WeeklyLog[] = [
      log({ id: "1", weekOf: "2024-01-01", campaignEntries: [{ campaignBrand: "A", videosFilmed: 1, amountEarned: 100, bonusEarned: 20 }], ugcOneOff: 10 }),
      log({ id: "2", weekOf: "2024-01-15", campaignEntries: [{ campaignBrand: "A", videosFilmed: 1, amountEarned: 50, bonusEarned: 0 }], ugcOneOff: 0 }),
      log({ id: "3", weekOf: "2024-02-01", campaignEntries: [{ campaignBrand: "A", videosFilmed: 1, amountEarned: 200, bonusEarned: 0 }], ugcOneOff: 0 }),
    ];
    const history = monthlyIncomeHistory(logs);
    expect(history).toHaveLength(2);
    expect(history[0].total).toBe(100 + 20 + 10 + 50); // January
    expect(history[1].total).toBe(200); // February
  });

  it("returns months sorted chronologically regardless of input order", () => {
    const logs: WeeklyLog[] = [
      log({ id: "1", weekOf: "2024-03-01", campaignEntries: [] }),
      log({ id: "2", weekOf: "2024-01-01", campaignEntries: [] }),
      log({ id: "3", weekOf: "2024-02-01", campaignEntries: [] }),
    ];
    const history = monthlyIncomeHistory(logs);
    const janIndex = history.findIndex((h) => h.month.includes("Jan"));
    const marIndex = history.findIndex((h) => h.month.includes("Mar"));
    expect(janIndex).toBeLessThan(marIndex);
  });
});

describe("getWeekKey", () => {
  it("always resolves to a Monday, regardless of which day of the week is passed in", () => {
    // 2024-01-10 is a Wednesday
    expect(getWeekKey(new Date("2024-01-10T12:00:00Z"))).toBe("2024-01-08");
    // 2024-01-07 is a Sunday -> should roll back to the Monday before it
    expect(getWeekKey(new Date("2024-01-07T12:00:00Z"))).toBe("2024-01-01");
    // 2024-01-08 is already a Monday -> stays put
    expect(getWeekKey(new Date("2024-01-08T12:00:00Z"))).toBe("2024-01-08");
  });
});
