import React from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { SessionProvider } from "@/components/SessionProvider";
import PendingApproval from "@/components/PendingApproval";
import AppShell from "@/components/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, supabase } = await getCurrentProfile();

  // Middleware already gates unauthenticated requests, but a direct RSC
  // render (e.g. a stale session cookie mid-refresh) should still fail safe.
  if (!user) redirect("/login");

  if (!profile) {
    redirect("/login?error=no-profile");
  }

  if (profile.status === "pending") {
    return <PendingApproval name={profile.name} />;
  }

  const { data: announcement } = await supabase
    .from("announcements")
    .select("body, created_at")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <SessionProvider user={user} profile={profile as any}>
      <AppShell announcement={announcement}>{children}</AppShell>
    </SessionProvider>
  );
}
