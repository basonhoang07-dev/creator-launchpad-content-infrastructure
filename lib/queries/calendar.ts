// lib/queries/calendar.ts
//
// Fetch + mutation helpers for the Content Calendar page, ported from the
// prototype's ContentCalendarPage (data.calendar/.availabilityBlocks/
// .templates/.brandProfiles/.calendarTrash) onto the real per-table schema.
// Field names map snake_case (DB) <-> camelCase (component state) here only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { uid, isDayFilmable, nextOccurrence, parseDateOnly, formatDateOnly, type AvailabilityBlock } from "@/lib/helpers";
import type { Campaign } from "@/lib/queries/kpi";

export interface Comment {
  id: string;
  authorName: string;
  authorRole: string;
  text: string;
  createdAt: string;
}

export interface CalendarEntry {
  id: string;
  brand: string;
  title: string;
  format: string;
  script: string;
  date: string | null;
  batch: string | null;
  status: string;
  editorProfileId: string | null;
  referenceLink: string;
  rawVideoLink: string;
  finalVideoLink: string;
  notes: string;
  posted: boolean;
  viewCount: number;
  bonusLogged: boolean;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  comments: Comment[];
  sortOrder: number;
  referenceTranscript: string | null;
  referenceFramework: ReferenceFrameworkPart[] | null;
}

export interface ReferenceFrameworkPart {
  part: string;
  content: string;
  curiosityLoop: string;
  immutable: string | null;
  yourVersion: string;
  tonality: string;
  visual: string | null;
}

export interface TrashedEntry {
  trashId: string;
  entry: CalendarEntry;
  deletedAt: string;
}

export interface Template {
  id: string;
  brand: string;
  titleBase: string;
  format: string;
  freq: string;
  nextDue: string;
}

export interface BrandProfile {
  demoScript1: string;
  demoScript2: string;
  demoScript3: string;
  productNote: string;
}

export interface Editor {
  id: string;
  name: string;
}

function mapEntryRow(row: any): CalendarEntry {
  return {
    id: row.id,
    brand: row.brand,
    title: row.title,
    format: row.format || "",
    script: row.script || "",
    date: row.entry_date,
    batch: row.batch,
    status: row.status || "Unscripted",
    editorProfileId: row.editor_profile_id,
    referenceLink: row.reference_link || "",
    rawVideoLink: row.raw_video_link || "",
    finalVideoLink: row.final_video_link || "",
    notes: row.notes || "",
    posted: !!row.posted,
    viewCount: row.view_count || 0,
    bonusLogged: !!row.bonus_logged,
    driveFolderId: row.drive_folder_id || null,
    driveFolderUrl: row.drive_folder_url || null,
    comments: (row.calendar_comments || [])
      .map((c: any): Comment => ({ id: c.id, authorName: c.author_name, authorRole: c.author_role, text: c.body, createdAt: c.created_at }))
      .sort((a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt)),
    sortOrder: row.sort_order ?? 0,
    referenceTranscript: row.reference_transcript || null,
    referenceFramework: row.reference_framework || null,
  };
}

function mapBlockRow(row: any): AvailabilityBlock {
  return {
    id: row.id,
    client_id: row.client_id,
    label: row.label,
    block_date: row.block_date,
    all_day: row.all_day,
    start_time: row.start_time,
    end_time: row.end_time,
    repeat_freq: row.repeat_freq || "none",
    google_event_id: row.google_event_id || null,
  };
}

function mapTemplateRow(row: any): Template {
  return { id: row.id, brand: row.brand, titleBase: row.title_base, format: row.format || "", freq: row.freq, nextDue: row.next_due };
}

export interface CalendarPageData {
  entries: CalendarEntry[];
  campaigns: Campaign[];
  availabilityBlocks: AvailabilityBlock[];
  templates: Template[];
  brandProfiles: Record<string, BrandProfile>;
  trash: TrashedEntry[];
  editors: Editor[];
  brands: string[];
  gcalConnected: boolean;
  driveConnected: boolean;
  driveConnectedEmail: string | null;
}

export async function fetchCalendarPageData(supabase: SupabaseClient, clientId: string): Promise<CalendarPageData> {
  const [
    { data: entryRows },
    { data: campaignRows },
    { data: blockRows },
    { data: templateRows },
    { data: profileRows },
    { data: trashRows },
    { data: editorRows },
    { data: integrationRows },
  ] = await Promise.all([
    supabase.from("calendar_entries").select("*, calendar_comments(*)").eq("client_id", clientId).order("sort_order", { ascending: true }),
    supabase.from("retainer_campaigns").select("*, bonus_tiers(*)").eq("client_id", clientId),
    supabase.from("availability_blocks").select("*").eq("client_id", clientId),
    supabase.from("templates").select("*").eq("client_id", clientId),
    supabase.from("brand_profiles").select("*").eq("client_id", clientId),
    supabase.from("calendar_trash").select("*").order("deleted_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, name, account_client_access!inner(client_id)")
      .eq("role", "VA/Editor")
      .eq("status", "approved")
      .eq("account_client_access.client_id", clientId),
    supabase.from("integrations").select("integration_key, connected, connected_email").eq("client_id", clientId).in("integration_key", ["gcal", "drive"]),
  ]);

  const campaigns: Campaign[] = (campaignRows || []).map((row: any) => ({
    id: row.id,
    brand: row.brand,
    rate: row.rate || 0,
    minPosts: row.min_posts || 0,
    maxPosts: row.max_posts || 0,
    sessionCapacity: row.session_capacity || 0,
    bonusTiers: (row.bonus_tiers || []).map((t: any) => ({ id: t.id, views: t.views, bonus: t.bonus })),
  }));

  const brandProfiles: Record<string, BrandProfile> = {};
  (profileRows || []).forEach((row: any) => {
    brandProfiles[row.brand] = {
      demoScript1: row.demo_script_1 || "",
      demoScript2: row.demo_script_2 || "",
      demoScript3: row.demo_script_3 || "",
      productNote: row.product_note || "",
    };
  });

  // calendar_trash rows keep a full copy of the calendar_entries row (snake_case) in `original_entry`.
  const trash: TrashedEntry[] = (trashRows || []).map((row: any) => ({
    trashId: row.id,
    entry: mapEntryRow(row.original_entry),
    deletedAt: row.deleted_at,
  }));

  return {
    entries: (entryRows || []).map(mapEntryRow),
    campaigns,
    availabilityBlocks: (blockRows || []).map(mapBlockRow),
    templates: (templateRows || []).map(mapTemplateRow),
    brandProfiles,
    trash,
    editors: (editorRows || []).map((r: any) => ({ id: r.id, name: r.name })),
    brands: Array.from(new Set(campaigns.map((c) => c.brand))),
    gcalConnected: !!(integrationRows || []).find((r: any) => r.integration_key === "gcal")?.connected,
    driveConnected: !!(integrationRows || []).find((r: any) => r.integration_key === "drive")?.connected,
    driveConnectedEmail: (integrationRows || []).find((r: any) => r.integration_key === "drive")?.connected_email || null,
  };
}

const emptyEntryFields = {
  script: "",
  entry_date: null,
  batch: null,
  status: "Unscripted",
  editor_profile_id: null,
  reference_link: "",
  raw_video_link: "",
  final_video_link: "",
  notes: "",
  posted: false,
  view_count: 0,
  bonus_logged: false,
};

// Best-effort — a Drive hiccup (not connected, expired grant, API error)
// must never block script creation itself, so failures just leave
// driveFolderId/Url null instead of throwing.
async function requestDriveFolder(entryId: string): Promise<{ id: string; url: string } | null> {
  try {
    const res = await fetch("/api/drive/create-script-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.id && json.url ? { id: json.id, url: json.url } : null;
  } catch {
    return null;
  }
}

// New scripts land at the bottom of the list by default (matching creation
// order) — everything already there keeps its position, no renumbering.
async function nextSortOrder(supabase: SupabaseClient, clientId: string): Promise<number> {
  const { data } = await supabase
    .from("calendar_entries")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 1;
}

export async function insertEntry(
  supabase: SupabaseClient,
  clientId: string,
  fields: { brand: string; title: string; format: string; notes?: string }
): Promise<CalendarEntry> {
  const sortOrder = await nextSortOrder(supabase, clientId);
  const { data, error } = await supabase
    .from("calendar_entries")
    .insert({ client_id: clientId, ...fields, ...emptyEntryFields, sort_order: sortOrder, notes: fields.notes || "" })
    .select()
    .single();
  if (error) throw error;
  const entry = mapEntryRow({ ...data, calendar_comments: [] });
  const folder = await requestDriveFolder(entry.id);
  return folder ? { ...entry, driveFolderId: folder.id, driveFolderUrl: folder.url } : entry;
}

const patchToColumns: Record<string, string> = {
  status: "status",
  date: "entry_date",
  editorProfileId: "editor_profile_id",
  script: "script",
  referenceLink: "reference_link",
  rawVideoLink: "raw_video_link",
  finalVideoLink: "final_video_link",
  notes: "notes",
  posted: "posted",
  viewCount: "view_count",
  bonusLogged: "bonus_logged",
  format: "format",
  batch: "batch",
  sortOrder: "sort_order",
};

export async function updateEntryFields(supabase: SupabaseClient, id: string, patch: Partial<CalendarEntry>) {
  const columns: Record<string, any> = {};
  Object.entries(patch).forEach(([k, v]) => {
    const col = patchToColumns[k];
    if (col) columns[col] = v;
  });
  const { error } = await supabase.from("calendar_entries").update(columns).eq("id", id);
  if (error) throw error;
}

export async function bulkUpdateEntries(supabase: SupabaseClient, ids: string[], patch: Partial<CalendarEntry>) {
  await Promise.all(ids.map((id) => updateEntryFields(supabase, id, patch)));
}

export async function deleteEntry(supabase: SupabaseClient, entry: CalendarEntry, clientId: string) {
  const row = {
    id: entry.id,
    client_id: clientId,
    brand: entry.brand,
    title: entry.title,
    format: entry.format,
    script: entry.script,
    entry_date: entry.date,
    batch: entry.batch,
    status: entry.status,
    editor_profile_id: entry.editorProfileId,
    reference_link: entry.referenceLink,
    raw_video_link: entry.rawVideoLink,
    final_video_link: entry.finalVideoLink,
    notes: entry.notes,
    posted: entry.posted,
    view_count: entry.viewCount,
    bonus_logged: entry.bonusLogged,
    drive_folder_id: entry.driveFolderId,
    drive_folder_url: entry.driveFolderUrl,
    sort_order: entry.sortOrder,
  };
  const { error: insertError } = await supabase.from("calendar_trash").insert({ original_entry: row });
  if (insertError) throw insertError;
  const { error: deleteError } = await supabase.from("calendar_entries").delete().eq("id", entry.id);
  if (deleteError) throw deleteError;
}

export async function restoreEntry(supabase: SupabaseClient, trashId: string, entry: CalendarEntry, clientId: string) {
  const { error: insertError } = await supabase.from("calendar_entries").insert({
    id: entry.id,
    client_id: clientId,
    brand: entry.brand,
    title: entry.title,
    format: entry.format,
    script: entry.script,
    entry_date: entry.date,
    batch: entry.batch,
    status: entry.status,
    editor_profile_id: entry.editorProfileId,
    reference_link: entry.referenceLink,
    raw_video_link: entry.rawVideoLink,
    final_video_link: entry.finalVideoLink,
    notes: entry.notes,
    posted: entry.posted,
    view_count: entry.viewCount,
    bonus_logged: entry.bonusLogged,
    drive_folder_id: entry.driveFolderId,
    drive_folder_url: entry.driveFolderUrl,
    sort_order: entry.sortOrder,
  });
  if (insertError) throw insertError;
  const { error: deleteError } = await supabase.from("calendar_trash").delete().eq("id", trashId);
  if (deleteError) throw deleteError;
}

// Trashes the entry's Drive folder (if it has one — see lib/google-drive.ts's
// trashDriveFolder for why that moves it to Drive's own trash rather than
// destroying it) before permanently removing the calendar_trash row itself.
// Best-effort on the Drive side — a Drive hiccup shouldn't block the user
// from actually clearing their trash.
export async function deleteEntryForever(supabase: SupabaseClient, trashId: string, clientId: string, driveFolderId: string | null) {
  if (driveFolderId) {
    try {
      await fetch("/api/drive/trash-script-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, driveFolderId }),
      });
    } catch {
      // Swallowed on purpose — see doc comment above.
    }
  }
  const { error } = await supabase.from("calendar_trash").delete().eq("id", trashId);
  if (error) throw error;
}

export async function addComment(supabase: SupabaseClient, entryId: string, authorName: string, authorRole: string, body: string): Promise<Comment> {
  const { data, error } = await supabase
    .from("calendar_comments")
    .insert({ entry_id: entryId, author_name: authorName, author_role: authorRole, body })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, authorName: data.author_name, authorRole: data.author_role, text: data.body, createdAt: data.created_at };
}

// Finds the highest-bonus tier this entry's view count has crossed (ported as-is:
// a 0/falsy tier threshold is treated as unreachable, not "always eligible").
export function bonusForEntry(entry: CalendarEntry, campaigns: Campaign[]) {
  const campaign = campaigns.find((c) => c.brand === entry.brand);
  const tiers = campaign?.bonusTiers || [];
  const views = Number(entry.viewCount) || 0;
  const eligible = tiers.filter((t) => views >= (Number(t.views) || Infinity));
  if (eligible.length === 0) return null;
  return eligible.reduce((max, t) => (t.bonus > max.bonus ? t : max), eligible[0]);
}

// Logs a video's earned bonus into the current week's log — creates the week if
// needed, stacks onto an existing campaign row, or adds a new one.
export async function applyBonusToLog(supabase: SupabaseClient, clientId: string, entry: CalendarEntry, campaigns: Campaign[], weekKey: string) {
  const tier = bonusForEntry(entry, campaigns);
  if (!tier) return;

  const { data: existing, error: existingError } = await supabase
    .from("weekly_logs")
    .select("id, weekly_log_campaign_entries(*)")
    .eq("client_id", clientId)
    .eq("week_of", weekKey)
    .maybeSingle();
  // A failed lookup must not fall through to "create a new week" — that
  // path would insert a duplicate weekly_logs row for a week that already
  // has one, double-counting the bonus instead of stacking onto it.
  if (existingError) throw existingError;

  if (existing) {
    const row = (existing.weekly_log_campaign_entries || []).find((e: any) => e.campaign_brand === entry.brand);
    if (row) {
      await supabase
        .from("weekly_log_campaign_entries")
        .update({ bonus_earned: (row.bonus_earned || 0) + tier.bonus })
        .eq("id", row.id);
    } else {
      await supabase
        .from("weekly_log_campaign_entries")
        .insert({ weekly_log_id: existing.id, campaign_brand: entry.brand, videos_filmed: 0, amount_earned: 0, bonus_earned: tier.bonus });
    }
  } else {
    const { data: newLog, error } = await supabase.from("weekly_logs").insert({ client_id: clientId, week_of: weekKey }).select().single();
    if (error) throw error;
    await supabase
      .from("weekly_log_campaign_entries")
      .insert({ weekly_log_id: newLog.id, campaign_brand: entry.brand, videos_filmed: 0, amount_earned: 0, bonus_earned: tier.bonus });
  }

  await updateEntryFields(supabase, entry.id, { bonusLogged: true });
}

// Duplicates a proven (posted) script for reuse — body kept as-is, only the
// hook gets replaced with a placeholder.
export function buildRepeatWinningConceptFields(entry: CalendarEntry) {
  const scriptText = entry.script || "";
  const hookMatch = scriptText.match(/^(Hook:.*?)(\n\n|\nBody:|\nCTA:|$)/is);
  let newScript: string;
  if (hookMatch) {
    newScript = scriptText.replace(hookMatch[1], "Hook: [Write a fresh hook here — this exact body has proven to work, don't reuse the old opening]");
  } else {
    newScript = `[Write a fresh hook here — everything below this line worked before, keep it as-is]\n\n${scriptText}`;
  }
  return {
    brand: entry.brand,
    title: `${entry.title} (remix)`,
    format: entry.format,
    script: newScript,
    referenceLink: entry.referenceLink,
    notes: `Repeated from a proven concept ("${entry.title}") — body kept as-is, hook needs a fresh take.`,
  };
}

export async function insertRepeatEntry(supabase: SupabaseClient, clientId: string, entry: CalendarEntry): Promise<CalendarEntry> {
  const fields = buildRepeatWinningConceptFields(entry);
  const sortOrder = await nextSortOrder(supabase, clientId);
  const { data, error } = await supabase
    .from("calendar_entries")
    .insert({ client_id: clientId, ...fields, ...emptyEntryFields, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  const created = mapEntryRow({ ...data, calendar_comments: [] });
  const folder = await requestDriveFolder(created.id);
  return folder ? { ...created, driveFolderId: folder.id, driveFolderUrl: folder.url } : created;
}

// ---------- Availability blocks ----------

export async function saveBlock(
  supabase: SupabaseClient,
  clientId: string,
  block: { id?: string; label: string; date: string; allDay: boolean; startTime: string; endTime: string; freq: string }
): Promise<AvailabilityBlock> {
  const row = {
    client_id: clientId,
    label: block.label,
    block_date: block.date,
    all_day: block.allDay,
    start_time: block.allDay ? null : block.startTime,
    end_time: block.allDay ? null : block.endTime,
    repeat_freq: block.freq,
  };
  if (block.id) {
    const { data, error } = await supabase.from("availability_blocks").update(row).eq("id", block.id).select().single();
    if (error) throw error;
    return mapBlockRow(data);
  }
  const { data, error } = await supabase.from("availability_blocks").insert(row).select().single();
  if (error) throw error;
  return mapBlockRow(data);
}

export async function deleteBlock(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("availability_blocks").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Templates ----------

// Materializes any due recurring-template occurrences (format/structure only —
// script is always written fresh). Ported from the prototype's per-mount effect;
// here it's an explicit call on page load instead of a React effect with no deps,
// since it needs to await Supabase writes.
export async function materializeDueTemplates(supabase: SupabaseClient, clientId: string, templates: Template[]): Promise<boolean> {
  const today = formatDateOnly(new Date());
  const due = templates.filter((t) => t.nextDue <= today);
  if (due.length === 0) return false;

  const baseSortOrder = await nextSortOrder(supabase, clientId);
  const created = await Promise.all(
    due.map((t, i) =>
      supabase
        .from("calendar_entries")
        .insert({
          client_id: clientId,
          brand: t.brand,
          title: `${t.titleBase} (${t.nextDue})`,
          format: t.format,
          ...emptyEntryFields,
          sort_order: baseSortOrder + i,
        })
        .select("id")
        .single()
    )
  );
  await Promise.all(due.map((t) => supabase.from("templates").update({ next_due: nextOccurrence(t.nextDue, t.freq) }).eq("id", t.id)));
  // Fire-and-forget — these materialize silently on page load, so a Drive
  // hiccup here shouldn't hold up rendering the calendar.
  created.forEach((r) => {
    if (r.data?.id) requestDriveFolder(r.data.id);
  });
  return true;
}

export async function deleteTemplate(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Brand profiles ----------

export async function saveBrandProfile(supabase: SupabaseClient, clientId: string, brand: string, profile: BrandProfile) {
  const { error } = await supabase
    .from("brand_profiles")
    .upsert(
      { client_id: clientId, brand, demo_script_1: profile.demoScript1, demo_script_2: profile.demoScript2, demo_script_3: profile.demoScript3, product_note: profile.productNote },
      { onConflict: "client_id,brand" }
    );
  if (error) throw error;
}

// ---------- New board ----------

export async function createBoard(
  supabase: SupabaseClient,
  clientId: string,
  input: { name: string; rate: number; minPosts: number; maxPosts: number; sessionCapacity: number; concept: { title: string; format: string } | null }
) {
  const { error: campaignError } = await supabase.from("retainer_campaigns").insert({
    client_id: clientId,
    brand: input.name,
    rate: input.rate,
    min_posts: input.minPosts,
    max_posts: input.maxPosts,
    session_capacity: input.sessionCapacity,
  });
  if (campaignError) throw campaignError;

  if (input.concept) {
    await insertEntry(supabase, clientId, { brand: input.name, title: input.concept.title, format: input.concept.format });
  }
}

// ---------- Scheduling ----------

// Ported as-is from the prototype's autoSchedule: continues from the day after
// the latest scheduled entry across ALL brands, skips non-filmable days, and
// batches `dailyVolume` entries per filmable day.
export function computeAutoSchedule(
  unscheduled: CalendarEntry[],
  scheduledAll: CalendarEntry[],
  availabilityBlocks: AvailabilityBlock[],
  dailyVolume: number
): { id: string; date: string }[] {
  let cursor = new Date();
  const lastDate = scheduledAll.length ? scheduledAll[scheduledAll.length - 1].date : null;
  if (lastDate) {
    cursor = parseDateOnly(lastDate);
    cursor.setDate(cursor.getDate() + 1);
  }
  let guard = 0;
  while (!isDayFilmable(availabilityBlocks, formatDateOnly(cursor)) && guard < 120) {
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  let placedToday = 0;
  const placements: { id: string; date: string }[] = [];
  for (const c of unscheduled) {
    if (placedToday >= dailyVolume) {
      cursor.setDate(cursor.getDate() + 1);
      let guard2 = 0;
      while (!isDayFilmable(availabilityBlocks, formatDateOnly(cursor)) && guard2 < 120) {
        cursor.setDate(cursor.getDate() + 1);
        guard2++;
      }
      placedToday = 0;
    }
    placedToday++;
    placements.push({ id: c.id, date: formatDateOnly(cursor) });
  }
  return placements;
}

export async function applyAutoSchedule(supabase: SupabaseClient, placements: { id: string; date: string }[], batchId: string) {
  await Promise.all(placements.map((p) => supabase.from("calendar_entries").update({ entry_date: p.date, batch: batchId }).eq("id", p.id)));
}
