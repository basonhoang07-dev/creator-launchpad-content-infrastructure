// lib/supabase/admin.ts
//
// Service-role Supabase client — SERVER-SIDE ONLY, never imported into a
// Client Component. Needed for the two admin actions that categorically
// require it and can't be done with the anon key + RLS: inviting a new
// team member into real Supabase Auth (auth.admin.inviteUserByEmail) and
// wiping an organization's content data on request (Danger Zone).

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
