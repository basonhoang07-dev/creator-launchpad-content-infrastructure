"use client";

// components/SessionProvider.tsx
//
// Replaces the prototype's fake `session` React state (role-picker login,
// never persisted — a refresh logged you out). Real identity now comes from
// Supabase Auth + the `profiles` row, fetched server-side in
// app/(dashboard)/layout.tsx and handed down here as the initial value.
//
// `workingClient` is the one piece of prototype "session" state that stays
// client-only and unpersisted, same as before: it's the "which client am I
// working in right now" picker (prototype: session.clientName), available to
// both Creative Director and Admin. It's a real data-scoping mechanism for
// both (see useDefaultScopedClientId) — for Admin specifically it's also an
// identity preview: effectiveRole below flips to "Client" whenever an Admin
// has one selected, so pages that render a fundamentally different
// experience per role (Home, Sidebar nav, Admin Panel access) show what that
// client actually sees instead of the Admin's own view. Nothing about the
// user's real permissions changes — every write still goes through as the
// real Admin, enforced server-side — this only affects what renders.

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import type { Role } from "@/lib/theme";

export interface Profile {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  email: string;
  role: Role;
  status: "pending" | "approved";
  google_meet_email: string | null;
  avatar_url: string | null;
}

export interface WorkingClient {
  id: string;
  name: string;
}

interface SessionContextValue {
  user: User;
  profile: Profile;
  isAdmin: boolean;
  workingClient: WorkingClient | null;
  setWorkingClient: (client: WorkingClient | null) => void;
  // profile.role, except an Admin previewing a client via "Working in" reads
  // as "Client" — see the comment above workingClient. Use this (not
  // profile.role) for anything that should render the client's actual
  // experience while previewing; use profile.role directly only for things
  // tied to the real account (e.g. who can open the "Working in" picker).
  effectiveRole: Role;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  user,
  profile,
  children,
}: {
  user: User;
  profile: Profile;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [workingClient, setWorkingClient] = useState<WorkingClient | null>(null);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      profile,
      isAdmin: profile.role === "Admin",
      workingClient,
      setWorkingClient,
      effectiveRole: profile.role === "Admin" && workingClient ? "Client" : profile.role,
      signOut,
    }),
    [user, profile, workingClient, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

// The client id a Client/VA-Editor/Admin/Creative Director's page work should
// scope to right now: the Client's own client_id, or the Creative Director's
// currently-selected "working in" client. Null means "no client scope yet"
// (e.g. a Creative Director who hasn't picked one, or an Admin/VA-Editor
// viewing a page that lets them choose a client explicitly).
export function useScopedClientId() {
  const { profile, workingClient } = useSession();
  if (profile.role === "Client") return profile.client_id;
  if (profile.role === "Creative Director") return workingClient?.id ?? null;
  return workingClient?.id ?? null;
}
