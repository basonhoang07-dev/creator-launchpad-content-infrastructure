"use client";

// app/error.tsx
//
// Next.js's App Router error boundary — catches anything that throws while
// rendering a page and shows this instead of the framework's generic crash
// screen. Doesn't need its own <html>/<body>; app/layout.tsx already wraps
// it. Logs to the console so it's visible in server/browser logs, same as
// an uncaught error would be — this only changes what the user sees, not
// whether the error gets recorded anywhere.

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { C } from "@/lib/theme";
import { Card, Button, Logo } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app/error.tsx] Unhandled error:", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 440, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, justifyContent: "center" }}>
          <Logo size={40} />
          <span className="cl-display" style={{ fontSize: 22, fontWeight: 700, color: C.text }}>
            Creator Launchpad
          </span>
        </div>

        <Card style={{ padding: 28, textAlign: "center" }}>
          <AlertTriangle size={28} color={C.warning} style={{ marginBottom: 12 }} />
          <h1 className="cl-display" style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: C.text }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 20px", lineHeight: 1.5 }}>
            That page hit an error. It's been logged — try again, and if it keeps happening, let your coach know what you were doing when it happened.
          </p>
          <Button onClick={reset} style={{ width: "100%", justifyContent: "center" }}>
            <RefreshCw size={14} /> Try again
          </Button>
        </Card>
      </div>
    </div>
  );
}
