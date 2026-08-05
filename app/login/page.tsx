"use client";

// app/login/page.tsx
//
// Replaces the prototype's LoginScreen (a fake role-picker — role was just
// whatever button you clicked). Real identity now comes from Supabase Auth;
// role/org/client_id come from the matching `profiles` row, not user choice.
// Visual layout ported from the prototype's LoginScreen as closely as the
// swap from "pick a role" to "sign in with credentials" allows.

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { C } from "@/lib/theme";
import { Card, Field, Button, Logo, inputStyle } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "request">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqError, setReqError] = useState("");
  const [reqSubmitted, setReqSubmitted] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push(searchParams.get("next") || "/");
    router.refresh();
  }

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    setReqError("");
    if (!reqName.trim() || !reqEmail.trim()) {
      setReqError("Name and email are both required.");
      return;
    }
    setLoading(true);

    // Deliberately does NOT create a real Supabase Auth account or profile —
    // this only queues a request. No login exists until an Admin approves it
    // from the Admin Panel (app/api/admin/approve-request), which is the only
    // place a real account ever gets created. Goes through a server route
    // (not a direct insert) so repeated submissions can be throttled —
    // access_requests has no anonymous read policy, so the throttle check
    // has to happen server-side with the service-role key.
    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: reqName.trim(), email: reqEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't submit that request — try again.");
      setReqSubmitted(true);
    } catch (err: any) {
      setReqError(err.message || "Couldn't submit that request — try again.");
    } finally {
      setLoading(false);
    }
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
          {mode === "login" ? (
            <form onSubmit={handleLogin}>
              <div
                className="cl-mono"
                style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accentLight, marginBottom: 6, textTransform: "uppercase" }}
              >
                Sign in
              </div>
              <h1 className="cl-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 18px", color: C.text }}>
                Welcome back
              </h1>

              <Field label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  style={inputStyle}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  style={inputStyle}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {error && <div style={{ fontSize: 12.5, color: C.danger, marginBottom: 12 }}>{error}</div>}

              <Button type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
                {loading ? <Loader2 size={16} className="cl-spin" /> : <>Enter dashboard <ChevronRight size={16} /></>}
              </Button>

              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setMode("request")}
                  style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer" }}
                >
                  New client? Request access →
                </button>
              </div>
            </form>
          ) : reqSubmitted ? (
            <>
              <h1 className="cl-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: C.text }}>
                Request sent
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 18px" }}>
                Your request is waiting on approval from the CL admin. Once approved, you'll get an email with a link to set
                your password and sign in.
              </p>
              <Button
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => {
                  setMode("login");
                  setReqSubmitted(false);
                  setReqName("");
                  setReqEmail("");
                }}
              >
                Back to sign in
              </Button>
            </>
          ) : (
            <form onSubmit={handleRequestAccess}>
              <h1 className="cl-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: C.text }}>
                Request an account
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 18px" }}>
                Sent to the CL admin for approval — no account is created until they approve it.
              </p>
              <Field label="Name">
                <input style={inputStyle} value={reqName} onChange={(e) => setReqName(e.target.value)} />
              </Field>
              <Field label="Email">
                <input type="email" style={inputStyle} value={reqEmail} onChange={(e) => setReqEmail(e.target.value)} />
              </Field>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: -10, marginBottom: 16, lineHeight: 1.5 }}>
                Join every Google Meet call with your coach using this exact email — it's how call recaps get matched to
                your account automatically.
              </div>

              {reqError && <div style={{ fontSize: 12.5, color: C.danger, marginBottom: 12 }}>{reqError}</div>}

              <Button type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
                {loading ? <Loader2 size={16} className="cl-spin" /> : "Submit request"}
              </Button>
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer" }}
                >
                  ← Back to sign in
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
