"use client";

// app/set-password/page.tsx
//
// Where every invite link (client "Add client"/"Request access" approval,
// or team member "Invite team member") actually lands. Supabase's
// inviteUserByEmail uses the implicit flow — the email link carries
// access_token/refresh_token in the URL *fragment* (#...), which never
// reaches the server, so middleware can't see it.
//
// This page explicitly parses those tokens and calls supabase.auth.
// setSession() with them, rather than trusting the browser client's
// automatic hash-detection. That auto-detection races against whatever
// session cookie already exists in the browser — on a machine where an
// Admin is already logged in (e.g. testing an invite link in the same
// browser), getSession() can resolve with the ADMIN's existing session
// before the hash finishes processing, silently changing the wrong
// account's password when the form submits. Explicit setSession from the
// URL's own tokens has no such race: the invite link's identity always
// wins, deterministically, regardless of whatever was active before.

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { C } from "@/lib/theme";
import { Card, Field, Button, Logo, inputStyle, Avatar } from "@/components/ui";

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"password" | "avatar">("password");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      let session = null;
      if (accessToken && refreshToken) {
        // Explicit and deterministic — overwrites any prior session with
        // exactly the identity this invite link was minted for.
        const { data, error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        session = sessionError ? null : data.session;
      } else {
        // No tokens in the URL at all (e.g. a bookmarked/reloaded link after
        // the fragment's already been consumed) — fall back to whatever
        // session already exists, same as before.
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }
      setHasSession(!!session);
      if (session) {
        setUserId(session.user.id);
        const { data: profile } = await supabase.from("profiles").select("name").eq("id", session.user.id).maybeSingle();
        setUserName(profile?.name || "");
      }
      setChecking(false);
    })();
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // One more quick step (a profile picture) before landing on the real
    // dashboard, rather than sending them straight in.
    setStep("avatar");
  }

  async function handleAvatarFile(files: FileList | null) {
    const file = files?.[0];
    if (!file || !userId) return;
    setAvatarSaving(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      setAvatarUrl(dataUrl);
      const supabase = createClient();
      await supabase.from("profiles").update({ avatar_url: dataUrl }).eq("id", userId);
    } finally {
      setAvatarSaving(false);
    }
  }

  function finishOnboarding() {
    router.push("/");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, justifyContent: "center" }}>
          <Logo size={40} />
          <span className="cl-display" style={{ fontSize: 22, fontWeight: 700, color: C.text }}>
            Creator Launchpad
          </span>
        </div>

        <Card style={{ padding: 28 }}>
          {checking ? (
            <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center" }}>Loading…</div>
          ) : !hasSession ? (
            <>
              <h1 className="cl-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: C.text }}>
                Link expired or already used
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 18px", lineHeight: 1.5 }}>
                This setup link isn't valid anymore. If you've already set your password, sign in below — otherwise ask your admin to resend your invite.
              </p>
              <Button style={{ width: "100%", justifyContent: "center" }} onClick={() => router.push("/login")}>
                Go to sign in
              </Button>
            </>
          ) : step === "password" ? (
            <form onSubmit={handleSetPassword}>
              <div
                className="cl-mono"
                style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accentLight, marginBottom: 6, textTransform: "uppercase" }}
              >
                Welcome
              </div>
              <h1 className="cl-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 18px", color: C.text }}>
                Set your password
              </h1>

              <Field label="Password">
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  style={inputStyle}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirm password">
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  style={inputStyle}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>

              {error && <div style={{ fontSize: 12.5, color: C.danger, marginBottom: 12 }}>{error}</div>}

              <Button type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
                {loading ? <Loader2 size={16} className="cl-spin" /> : <>Set password & continue <ChevronRight size={16} /></>}
              </Button>
            </form>
          ) : (
            <div>
              <div
                className="cl-mono"
                style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accentLight, marginBottom: 6, textTransform: "uppercase" }}
              >
                Almost there
              </div>
              <h1 className="cl-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: C.text }}>
                Add a profile picture
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 20px", lineHeight: 1.5 }}>
                Optional, but it makes things like the leaderboard and account list less anonymous. You can always change it later from the sidebar.
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
                <Avatar name={userName || "?"} avatarUrl={avatarUrl} size={56} />
                <label style={{ cursor: avatarSaving ? "default" : "pointer" }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: C.accentLight,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "7px 12px",
                      opacity: avatarSaving ? 0.6 : 1,
                    }}
                  >
                    {avatarSaving ? "Uploading…" : avatarUrl ? "Choose a different photo" : "Choose a photo"}
                  </span>
                  <input type="file" accept="image/*" disabled={avatarSaving} onChange={(e) => handleAvatarFile(e.target.files)} style={{ display: "none" }} />
                </label>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" style={{ flex: 1, justifyContent: "center" }} onClick={finishOnboarding}>
                  Skip for now
                </Button>
                <Button style={{ flex: 1, justifyContent: "center" }} disabled={avatarSaving} onClick={finishOnboarding}>
                  {avatarUrl ? "Continue" : "Continue without a photo"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
