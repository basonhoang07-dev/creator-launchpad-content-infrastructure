// lib/queries/sops.ts
//
// Fetch + mutation helpers for SOP Libraries. Images are stored as base64
// data URIs directly in text columns (thumbnail_url / sop_images.image_url),
// same as the prototype's readFileAsDataURL approach — no Supabase Storage
// bucket setup required, matching the scope of this launch.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SopKind = "ugc" | "format";

export interface Sop {
  id: string;
  kind: SopKind;
  title: string;
  body: string;
  authorName: string | null;
  authorRole: string | null;
  thumbnail: string;
  images: string[];
  referenceVideoLink: string;
  deletedAt: string | null;
}

function mapRow(row: any): Sop {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body || "",
    authorName: row.author_name,
    authorRole: row.author_role,
    thumbnail: row.thumbnail_url || "",
    images: (row.sop_images || []).map((i: any) => i.image_url),
    referenceVideoLink: row.reference_video_link || "",
    deletedAt: row.deleted_at,
  };
}

export async function fetchSops(supabase: SupabaseClient, organizationId: string): Promise<{ ugc: Sop[]; format: Sop[] }> {
  const { data } = await supabase.from("sops").select("*, sop_images(*)").eq("organization_id", organizationId);
  const all = (data || []).map(mapRow);
  return { ugc: all.filter((s) => s.kind === "ugc"), format: all.filter((s) => s.kind === "format") };
}

export async function createSop(
  supabase: SupabaseClient,
  organizationId: string,
  kind: SopKind,
  fields: { title: string; body: string; thumbnail?: string; images?: string[]; referenceVideoLink?: string; authorName?: string; authorRole?: string }
): Promise<Sop> {
  const { data, error } = await supabase
    .from("sops")
    .insert({
      organization_id: organizationId,
      kind,
      title: fields.title,
      body: fields.body,
      thumbnail_url: fields.thumbnail || null,
      reference_video_link: fields.referenceVideoLink || null,
      author_name: fields.authorName || null,
      author_role: fields.authorRole || null,
    })
    .select()
    .single();
  if (error) throw error;

  if (fields.images && fields.images.length > 0) {
    await supabase.from("sop_images").insert(fields.images.map((image_url) => ({ sop_id: data.id, image_url })));
  }
  return mapRow({ ...data, sop_images: (fields.images || []).map((image_url) => ({ image_url })) });
}

export async function updateSop(
  supabase: SupabaseClient,
  id: string,
  fields: { title: string; body: string; thumbnail?: string; images?: string[]; referenceVideoLink?: string }
) {
  const { error } = await supabase
    .from("sops")
    .update({ title: fields.title, body: fields.body, thumbnail_url: fields.thumbnail || null, reference_video_link: fields.referenceVideoLink || null })
    .eq("id", id);
  if (error) throw error;

  if (fields.images !== undefined) {
    await supabase.from("sop_images").delete().eq("sop_id", id);
    if (fields.images.length > 0) {
      await supabase.from("sop_images").insert(fields.images.map((image_url) => ({ sop_id: id, image_url })));
    }
  }
}

export async function softDeleteSop(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("sops").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function restoreSop(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("sops").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function deleteSopForever(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("sops").delete().eq("id", id);
  if (error) throw error;
}
