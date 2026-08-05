// lib/supabase.ts
//
// Frontend Supabase client — this is what replaces every `window.storage`
// call in the prototype. Same idea (get/set data), real database underneath.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Example of the exact kind of swap needed throughout the ported UI code:
//
// BEFORE (prototype):
//   const res = await window.storage.get("cl-dashboard-data");
//   const data = JSON.parse(res.value);
//
// AFTER (real app):
//   const supabase = createClient();
//   const { data: entries } = await supabase
//     .from("calendar_entries")
//     .select("*")
//     .eq("client_id", clientId);
//
// The prototype's single giant `data` object becomes real, separately-queried
// tables — better for performance too, since a component only fetches the
// slice of data it actually renders instead of the whole app's state at once.
