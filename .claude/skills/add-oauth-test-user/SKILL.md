---
name: add-oauth-test-user
description: Check whether a Google account needs anything done before it can connect Google Drive or Google Calendar on the Creator Launchpad Google Cloud project, and check remaining OAuth user-cap headroom. Use this whenever the user asks to "add test user <email>", "add <email> as a test user", "give <email> access to Google Drive/Calendar", or mentions someone new needing to connect Drive or Calendar and hitting a Google sign-in block. Also use it proactively if the user reports that connecting Drive/Calendar failed with a message like "Google hasn't verified this app" going nowhere, or "access blocked."
---

## Why this exists, and what actually changed

Creator Launchpad's Google OAuth app (Drive + Calendar integrations) is "External" and unverified by Google. There used to be a "Testing" publish status with an explicit test-user allowlist you had to manually add each email to — an earlier version of this skill was written for that model. **As of the current project state, the app is in "In production" publishing status**, and under that status Google doesn't use an allowlist at all: it uses a lifetime **OAuth user cap** (currently 100 users) that counts anyone who completes the consent flow. Confirmed directly on the project's own Audience page — its copy literally says the user cap "limits the number of users that can grant permission to your app," with no separate add-a-user control anywhere on that page.

Practical result: **there is nothing to manually add for a new person.** Anyone — including someone who's never touched this project before — can click "Connect" on Drive or Calendar in the app themselves right now, click through Google's "unverified app" warning (Advanced → Go to Creator Launchpad (unsafe)), and it'll work, as long as the 100-user cap isn't exhausted.

## What to actually do when this triggers

1. Get a Chrome tab (via `mcp__claude-in-chrome__*`) signed into the Google account that owns the `cl-content-infrastructure` project, and navigate to `https://console.cloud.google.com/auth/audience`.
2. Confirm the project switcher reads **"CL Content Infrastructure"** — if not, switch to it before reading anything below as authoritative.
3. Confirm **Publishing status** at the top of the page. If it still says **"In production"**, skip straight to step 4. If it's ever switched back to **"Testing"**, the old allowlist model applies instead — look for a "Test users" section with an "Add users" control, and if you find one, that's the one place an explicit add action is real; don't assume the steps above still apply blind, re-read the page.
4. Read the **OAuth user cap** line (e.g. "2 users / 100 user cap"). Report the number to the user.
5. Tell the user: no action was needed on your end — the person can just go connect themselves, unless the cap is at or near 100 (Google gives no way to raise or reset this short of full app verification; flag it plainly if it's close, don't try to work around it).

## If the page looks different from this

Google has already redesigned this Console UI once during this project's lifetime (Testing+allowlist → Production+cap). If what you see doesn't match either model described here, don't force clicks at guessed coordinates — use `find`/`read_page` to locate real controls, and if genuinely unclear, describe what's on the page to the user rather than guessing at what button does what.
