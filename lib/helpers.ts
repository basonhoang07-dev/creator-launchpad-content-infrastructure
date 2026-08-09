// lib/helpers.ts
//
// Pure date/business-rule helper functions, ported verbatim from
// cl_dashboard_prototype.jsx. These carry real business logic (bonus tiers,
// filmable-day math, recurring templates) — do not "clean up" the logic,
// only the module wiring changed.

export const uid = () => Math.random().toString(36).slice(2, 10);

// Parses a "YYYY-MM-DD" date-only string as a LOCAL calendar date (midnight
// local time). Deliberately not `new Date(dateStr)` (which the spec parses
// as UTC midnight) or `new Date(dateStr + "T00:00:00")` piped through
// `.toISOString()` later (which converts back to UTC and can shift the date
// by a day) — this app's dates are calendar dates, not instants, so every
// place that turns a stored date string into a Date object goes through
// this one function to stay internally consistent regardless of the
// runtime's timezone.
export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
// Inverse of parseDateOnly — always reads LOCAL calendar fields, never
// round-trips through toISOString/UTC.
export function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayPlus(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return formatDateOnly(d);
}

// Monday-based week key, e.g. "2026-07-06"
export function getWeekKey(date: Date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return formatDateOnly(d);
}
export function getWeekKeyStatic(weeksAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() + weeksAgo * 7);
  return getWeekKey(d);
}
export function formatWeekLabel(weekKey: string) {
  const start = parseDateOnly(weekKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}
export function isSameMonth(weekKey: string, ref: Date = new Date()) {
  const d = parseDateOnly(weekKey);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

export interface WeeklyLogCampaignEntry {
  campaignBrand: string;
  videosFilmed: number;
  amountEarned: number;
  bonusEarned: number;
}
export interface WeeklyLog {
  id: string;
  weekOf: string;
  campaignEntries: WeeklyLogCampaignEntry[];
  ugcOneOff: number;
  [key: string]: any;
}

// A weekly log record can exist purely because a video bonus was applied to it
// (see applyBonusToLog) without the client ever actually logging their real
// weekly videos/earnings. This checks for real content, not just existence,
// so "log this week" prompts don't disappear just because a bonus landed.
export function isWeekActuallyLogged(log?: WeeklyLog | null) {
  if (!log) return false;
  const hasCampaignData = log.campaignEntries.some((e) => (e.videosFilmed || 0) > 0 || (e.amountEarned || 0) > 0);
  return hasCampaignData || (log.ugcOneOff || 0) > 0;
}

// Buckets weekly logs into monthly cash totals for a personal income trend chart —
// same shape TrendChart expects ({ month, total }).
export function monthlyIncomeHistory(weeklyLogs: WeeklyLog[]) {
  const buckets: Record<string, { key: string; month: string; total: number }> = {};
  weeklyLogs.forEach((log) => {
    const d = parseDateOnly(log.weekOf);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    const cash =
      log.campaignEntries.reduce((s, e) => s + (e.amountEarned || 0) + (e.bonusEarned || 0), 0) + (log.ugcOneOff || 0);
    if (!buckets[key]) buckets[key] = { key, month: label, total: 0 };
    buckets[key].total += cash;
  });
  return Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
}

// Shape matches the real `availability_blocks` table (db/schema.sql) — flat,
// snake_case columns, not the prototype's in-memory { date, allDay, repeat:{freq} }
// nesting. This is the same shape the plan-calendar API route already queries
// and re-implements its own copy of this logic against — keep both in sync.
export interface AvailabilityBlock {
  id: string;
  client_id: string;
  label: string;
  block_date: string;
  all_day: boolean;
  start_time?: string | null;
  end_time?: string | null;
  repeat_freq: string; // 'none' | 'daily' | 'weekly' | 'weekday'
  google_event_id?: string | null;
}

// Resolves whether a recurring availability block occurs on a given date
export function blockOccursOn(block: AvailabilityBlock, dateStr: string) {
  const freq = block.repeat_freq || "none";
  if (freq === "none") return block.block_date === dateStr;
  const blockDate = parseDateOnly(block.block_date);
  const target = parseDateOnly(dateStr);
  if (target < blockDate) return false;
  if (freq === "daily") return true;
  if (freq === "weekly") return blockDate.getDay() === target.getDay();
  if (freq === "weekday") return target.getDay() >= 1 && target.getDay() <= 5;
  return false;
}
export function occurrencesOn(blocks: AvailabilityBlock[], dateStr: string) {
  return blocks.filter((b) => blockOccursOn(b, dateStr));
}
// A day is filmable unless it's explicitly marked unavailable (all day) or has
// configured blocks that don't include a "Filming" block. Unconfigured days default to open.
export function isDayFilmable(blocks: AvailabilityBlock[], dateStr: string) {
  const occ = occurrencesOn(blocks, dateStr);
  if (occ.length === 0) return true;
  if (occ.some((b) => b.label === "Unavailable" && b.all_day)) return false;
  return occ.some((b) => b.label === "Filming");
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function repeatLabel(freq: string, anchorDate: string) {
  if (freq === "daily") return "Daily";
  if (freq === "weekday") return "Every weekday (Mon–Fri)";
  if (freq === "weekly") return `Weekly on ${WEEKDAY_NAMES[parseDateOnly(anchorDate).getDay()]}`;
  return "Does not repeat";
}

// Advances a date by a template's cadence — used for recurring concept templates
export function nextOccurrence(fromDateStr: string, freq: string) {
  const d = parseDateOnly(fromDateStr);
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "biweekly") d.setDate(d.getDate() + 14);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else return fromDateStr;
  return formatDateOnly(d);
}
export function templateFreqLabel(freq: string) {
  return ({ weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly" } as Record<string, string>)[freq] || freq;
}

// Detects Instagram Reel/Post and TikTok video links and returns their official
// no-API-key iframe embed URL. Both platforms support this directly — no backend needed.
export function getEmbedUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "instagram.com") {
      const m = u.pathname.match(/\/(reel|p|tv)\/([^/]+)/);
      if (m) return `https://www.instagram.com/${m[1]}/${m[2]}/embed`;
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      const m = u.pathname.match(/\/video\/(\d+)/);
      if (m) return `https://www.tiktok.com/embed/v2/${m[1]}`;
    }
    if (host === "vm.tiktok.com") {
      // short-link form can't be resolved client-side without a fetch — fall back to a plain link
      return null;
    }
  } catch {
    return null;
  }
  return null;
}
