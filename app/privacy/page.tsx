// app/privacy/page.tsx
//
// Public (see PUBLIC_PATHS in lib/supabase/middleware.ts) — this is the URL
// submitted to Google Cloud Console's OAuth consent screen as the "Privacy
// policy link" for the Google Drive integration (lib/google-drive.ts).
// Plain server component, no dashboard chrome, since it has to load for a
// signed-out Google reviewer.

import { Logo } from "@/components/ui";
import { C } from "@/lib/theme";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="cl-display" style={{ fontSize: 17, fontWeight: 700, margin: "0 0 10px", color: C.text }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "48px 20px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Logo size={32} />
          <span className="cl-display" style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
            Creator Launchpad
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: C.textFaint, marginBottom: 36 }}>Privacy Policy — last updated {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>

        <Section title="What this covers">
          <p>
            Creator Launchpad is a private client portal for UGC-creator coaching. This page explains what data we collect, and in
            particular what we do with data accessed through Google APIs (specifically Google Drive), since that's the part subject to
            Google's own review process.
          </p>
        </Section>

        <Section title="Google Drive access — what it's for">
          <p>
            From the Integrations page, a client can choose to "Connect Google Drive." Doing so authorizes Creator Launchpad to create
            folders in that person's own Google Drive — specifically, a top-level "File For Editor" folder, a subfolder per brand
            campaign, and a subfolder per content script — so raw and edited footage stays organized without anyone doing it by hand.
          </p>
          <p style={{ marginTop: 10 }}>
            We request the narrowest scope Google offers for this:{" "}
            <code style={{ background: C.surface2, padding: "2px 6px", borderRadius: 4, fontSize: 12.5 }}>drive.file</code>. This scope only
            lets the app see and manage files/folders that the app itself created — it cannot browse, read, or modify anything else
            already in that person's Drive. We also request basic profile scopes (
            <code style={{ background: C.surface2, padding: "2px 6px", borderRadius: 4, fontSize: 12.5 }}>email</code>,{" "}
            <code style={{ background: C.surface2, padding: "2px 6px", borderRadius: 4, fontSize: 12.5 }}>openid</code>) solely to display
            which Google account is connected on the Integrations page.
          </p>
        </Section>

        <Section title="How that data is stored and used">
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
            <li>The OAuth token that lets us create folders on a client's behalf is stored encrypted at rest in our database and is never exposed to any browser, including the connected client's own.</li>
            <li>It is only ever used server-side, only to create the specific folders described above, and only when that client creates a new script in the Content Calendar.</li>
            <li>We do not read, download, share, sell, or use the contents of a client's Drive for advertising, AI model training, or any purpose beyond the folder-creation feature itself.</li>
            <li>A client can revoke this access at any time, either by clicking "Disconnect" on the Integrations page (which deletes the stored token immediately) or from their own Google Account's "Third-party access" settings.</li>
          </ul>
        </Section>

        <Section title="Google API Services User Data Policy">
          <p>
            Creator Launchpad's use and transfer of information received from Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: C.accentLight }}>
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Other data we collect">
          <p>
            For clients, VAs/editors, creative directors, and admins with an account: name, email, and the content, scripts, call
            recaps, and business data they enter into the portal on their coaching organization's behalf. This data is only visible to
            that organization's own team, per each account's role.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy or a request to delete your data: contact your Creator Launchpad admin directly.</p>
        </Section>
      </div>
    </div>
  );
}
