import React from "react";
import { C } from "@/lib/theme";
import { Card, Logo } from "@/components/ui";
import SignOutButton from "@/components/SignOutButton";

export default function PendingApproval({ name }: { name: string }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 420, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, justifyContent: "center" }}>
          <Logo size={40} />
          <span className="cl-display" style={{ fontSize: 22, fontWeight: 700, color: C.text }}>
            Creator Launchpad
          </span>
        </div>
        <Card style={{ padding: 28, textAlign: "center" }}>
          <h1 className="cl-display" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 10px", color: C.text }}>
            Hey {name}, you're on the list
          </h1>
          <p style={{ fontSize: 13.5, color: C.textMuted, margin: "0 0 20px", lineHeight: 1.6 }}>
            Your account request is waiting on approval from the CL admin. Once it's approved, sign back in and you'll
            land straight in your portal — nothing else to do on your end.
          </p>
          <SignOutButton />
        </Card>
      </div>
    </div>
  );
}
