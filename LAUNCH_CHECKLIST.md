# Creator Launchpad — Launch Checklist

This is the exact, click-by-click path from "code is done" to "real app Adam can log into." Everything with a checkbox is something you do by hand in a browser — I can't create accounts or click buttons on external sites on your behalf. Follow it in order; each step assumes the one before it is done.

**Given "bill's on me, no client payment for now":** no Stripe anywhere in this checklist. Your only recurring costs are Supabase (free tier), Vercel (free tier), and your own Anthropic API usage.

---

## Everything is now written — this file is just the setup order

The full page-by-page port is done: every page is real Next.js wired to Supabase, auth is real, and the app has passed a clean production build. What's left is entirely the manual steps below.

---

## Step 1 — Create your Supabase project

- [ ] Go to **supabase.com** and click **"Start your project"** (top right)
- [ ] Sign in — easiest is **"Continue with GitHub"** if you have a GitHub account, otherwise sign up with email
- [ ] You'll land on the Supabase dashboard. Click the green **"New project"** button
- [ ] If this is your first project, it'll first ask you to create an **Organization** — name it anything (e.g. "Creator Launchpad"), leave the plan on **Free**, click **Create organization**
- [ ] Now fill in the **New project** form:
  - **Name**: `creator-launchpad` (or anything)
  - **Database Password**: click **Generate a password**, then click the copy icon and **paste it somewhere safe** (a notes app, password manager) — you likely won't need it again unless you connect a database tool directly, but don't lose it
  - **Region**: pick whichever is closest to you/Adam
  - **Pricing Plan**: leave on **Free**
- [ ] Click **"Create new project"**
- [ ] Wait — it takes **1-3 minutes** to provision. You'll see a progress screen; don't close the tab. When it's done you land on the project's main dashboard (a page with API usage graphs, etc.)

---

## Step 2 — Run `db/schema.sql` (creates every table)

This is the step that builds your entire database. Full detail since one paste + one click does all the work:

- [ ] In the **left sidebar** of your Supabase project, find the icon that looks like `>_` (a terminal/code icon) — it's labeled **SQL Editor**. Click it.
- [ ] You'll land on the SQL Editor page. Click the **"+ New query"** button (top left, above the empty editor pane) if a blank query isn't already open.
- [ ] On your own computer, open the file **`cl-production/db/schema.sql`** in any text editor (VS Code, Notepad, TextEdit — anything that shows plain text).
- [ ] **Select all the text in that file** (Ctrl+A / Cmd+A) and **copy it** (Ctrl+C / Cmd+C).
- [ ] Click into the empty SQL Editor pane in your browser (the big text area) and **paste** (Ctrl+V / Cmd+V). You should see the whole schema — comments, `create table` statements, all the way down to the RLS policies at the bottom.
- [ ] Click the green **"Run"** button (bottom right of the editor pane — or press Ctrl+Enter / Cmd+Enter).
- [ ] You should see a green **"Success. No rows returned"** message at the bottom. That means every table, every column, and every security policy got created in one shot.
  - **If you see a red error instead:** the most likely cause is pasting only part of the file (scroll up in the editor to check nothing got cut off) — select all and re-copy the whole file, clear the editor pane, paste again, and re-run.
- [ ] Optional sanity check: in the left sidebar, click the **Table Editor** icon (looks like a grid/table icon, just above SQL Editor). You should see a list of tables on the left — `organizations`, `clients`, `profiles`, `calendar_entries`, `retainer_campaigns`, `sops`, and more (17 total). If you see that list, the schema is in.

---

## Step 3 — Create your login and Adam's login

- [ ] In the left sidebar, click the icon that looks like a **person/silhouette** — labeled **Authentication**. Click it.
- [ ] You land on the **Users** tab (if not, click **"Users"** in the sub-navigation near the top).
- [ ] Click **"Add user"** (top right) → from the dropdown choose **"Create new user"**.
- [ ] A modal appears with **Email** and **Password** fields, plus a checkbox.
  - Fill in **your own email** and pick a password you'll remember.
  - **Check the box "Auto Confirm User"** — this matters, it lets you sign in immediately without clicking an email link.
  - Click **"Create user"**.
- [ ] Your new user now shows up in the Users table. Click on that row to open its details, and find the field labeled **"User UID"** — it looks like `a1b2c3d4-e5f6-...`. Click the copy icon next to it, and **paste it somewhere safe** (same notes file as before). Label it "MY UID".
- [ ] Repeat the same **"Add user"** flow for **Adam**: his email, a password (you'll hand this off to him later, or he can reset it), check **Auto Confirm User**, create, then copy his **User UID** too. Label it "ADAM UID".

You should now have two things saved: **MY UID** and **ADAM UID**.

---

## Step 4 — Run `db/seed_org.sql` (creates your org + both profiles)

- [ ] On your computer, open **`cl-production/db/seed_org.sql`** in your text editor.
- [ ] Find and replace these placeholders (use your editor's Find & Replace, or just edit by hand):
  - `<YOUR_AUTH_USER_UID>` → your **MY UID** from step 3 (appears twice in the file — replace both)
  - `<ADAM_AUTH_USER_UID>` → your **ADAM UID** from step 3
  - `'Your Name'` and `'you@example.com'` → your real name and email
  - Optionally change `'Adam'` / `'adam@example.com'` if his actual name/email differs
- [ ] Save the file, select all, copy it.
- [ ] Back in Supabase → **SQL Editor** → click **"+ New query"** for a fresh blank pane.
- [ ] Paste the edited script in, click **"Run"**.
- [ ] You should get a success message (this one may say "Success. No rows returned" or show a small result — either is fine, since the final `insert` doesn't return rows by default).
- [ ] **Verify it worked:** in the editor, delete everything, then paste in just this and click Run:
  ```sql
  select p.name, p.role, p.status, p.email, c.name as client_name
  from profiles p
  left join clients c on c.id = p.client_id
  order by p.role;
  ```
  You should see exactly 2 rows: one with role `Admin` (you), one with role `Client` (Adam) showing `client_name = Adam`. If you see this, step 4 is done correctly.

---

## Step 5 — Turn off "Confirm email"

This is required for the app's Request Access flow (self-serve signup) to work — without it, a new signup would be stuck waiting on a confirmation email that isn't set up yet.

- [ ] Left sidebar → **Authentication** → click **"Sign In / Providers"** or **"Settings"** in the sub-navigation (exact label varies slightly by Supabase version — look for a gear icon or "Auth Settings").
- [ ] Find the toggle labeled **"Confirm email"** (sometimes under an "Email" section). **Turn it off.**
- [ ] Save if there's an explicit save button (some versions save automatically on toggle).

---

## Step 6 — Get your Anthropic API key

- [ ] Go to **console.anthropic.com** and sign in (or create an account)
- [ ] Left sidebar → **"API Keys"**
- [ ] Click **"Create Key"**, give it a name (e.g. "creator-launchpad-prod"), click **Create**
- [ ] Copy the key immediately (it starts with `sk-ant-...`) — Anthropic only shows it once, so paste it into your notes file now
- [ ] Optional but recommended: **Settings → Limits** → set a monthly spending cap (a few dollars is plenty at your volume)

---

## Step 7 — Collect your 4 values

Before moving on, confirm you have all of these saved somewhere:

| Value | Where you got it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings (gear icon, bottom of left sidebar) → API → "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → API → "Project API keys" → the `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → API → "Project API keys" → the `service_role` `secret` key (click "Reveal" if hidden) |
| `ANTHROPIC_API_KEY` | From step 6 |

**Send me these 4 values** (or paste them straight into a local `.env.local` yourself, see step 8) and I'll take it from there — set up the local environment, run the app for real, sign in as both roles, and test every page and all 4 AI features against your real project.

---

## Step 8 — Local install (I can drive this once I have the 4 values)

- [ ] `cd` into `cl-production/`
- [ ] `npm install`
- [ ] Copy `.env.example` to a new file named `.env.local` in the same folder, and fill in the 4 values from step 7 (leave `FATHOM_WEBHOOK_SECRET` blank)
- [ ] `npm run dev` → open `localhost:3000` → sign in with your own email/password from step 3

---

## Step 9 — Deploy to Vercel

- [ ] Push this code to a GitHub repo (new, private is fine)
- [ ] Go to **vercel.com** → sign in (GitHub sign-in is easiest, it'll see your repos automatically)
- [ ] **"Add New..." → "Project"** → find and **Import** your repo
- [ ] Before deploying, expand **"Environment Variables"** and add all 4 values from step 7, one at a time (Name + Value, click Add for each)
- [ ] Click **"Deploy"** — takes 1-2 minutes
- [ ] Once done, Vercel gives you a live URL (`your-project.vercel.app`) — that's the real, deployed app

---

## Step 10 — Test before Adam ever sees it

- [ ] Log in as yourself (Admin) — confirm you see Adam in the client list and Community Overview shows his numbers
- [ ] Log in as Adam — confirm he does NOT see anything Admin-only
- [ ] Run one real "Plan with Claude", one real "Get feedback", one real "Adapt a script", and one real "Generate recap" — confirm the Anthropic key works and responses look right
- [ ] Confirm refreshing the page doesn't lose data
- [ ] Try Request Access from the login screen with a throwaway email — confirm it shows up in Admin → Accounts as pending, approve it, confirm that account can log in
- [ ] From Admin Panel → Accounts, invite a test VA/Editor — confirm the invite email arrives and the account works once they set a password

## Step 11 — Point Adam at it

- [ ] Give him his login
- [ ] Remind him: join every Google Meet call using the exact email on his account (this is how call recap matching works)

---

## What's explicitly deferred (per "keep it like that" for now)

- No Stripe / billing UI — you're covering costs directly
- No public sign-up flow for new organizations — that's the future-SaaS trigger, not needed for you + Adam
- No Fathom/Discord automation yet — the SOP is written and ready whenever you want to build it, but the manual "New Recap" flow works fine until then
- No MCP / real Google Drive-Calendar integration — still a toggle, same as the prototype, until you actually need folders to auto-create
- No UI for Admin/VA-Editor to switch between multiple clients (only Creative Director has the "Working in" picker) — fine for one real client today; flagged in `components/useDefaultClient.ts` as the seam to extend when you add a second client

None of these are mistakes to fix later — they're the correct scope for "one coach, one client, low overhead" as it stands today.
