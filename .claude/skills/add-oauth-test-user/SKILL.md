---
name: add-oauth-test-user
description: Add a Google account as a test user on the Creator Launchpad Google Cloud project so that account can connect Google Drive or Google Calendar. Use this whenever the user asks to "add test user <email>", "add <email> as a test user", "give <email> access to Google Drive/Calendar", or mentions someone new needing to connect Drive or Calendar and hitting a Google sign-in block. Also use it proactively if the user reports that connecting Drive/Calendar failed with a message like "Google hasn't verified this app" going nowhere, or "access blocked" — that's the exact symptom of a missing test user.
---

## Why this exists

Creator Launchpad's Google OAuth app (Drive + Calendar integrations) is registered as "External" and unverified by Google. Google will only let an account through the consent screen if that account is on the project's test-user allowlist — otherwise the sign-in is blocked outright, not just shown a warning. There's no public API for managing this list; it's a Google Cloud Console UI-only setting. So the fix is always the same manual page, and this skill automates driving the browser through it instead of walking the user through it by hand each time.

## Before you start

You need an already-open Chrome tab (via the `mcp__claude-in-chrome__*` tools) that's signed into the Google account that owns the `cl-content-infrastructure` Google Cloud project (that's the Creator Launchpad app owner's own Google login — same account used for Drive/Calendar OAuth setup). If you don't have a Chrome tab, get one with `tabs_create_mcp` and `navigate` — the user's existing Google session in that browser profile should carry over.

If the user's request doesn't include an email address, ask for it before doing anything — don't guess or reuse a previously-added address.

## Steps

1. Navigate to `https://console.cloud.google.com/auth/audience`. This is Google's stable URL for the OAuth consent screen's Audience page — it opens on whichever Cloud project was last active in that browser session.
2. Take a screenshot and confirm the top-left project switcher reads **"CL Content Infrastructure"**. If it's showing a different project, use the project switcher to pick the right one before going further — adding a test user to the wrong project silently does nothing useful and wastes a permission action.
3. Find the **Test users** section (it's below "OAuth user cap" — you may need to scroll down or click "Show more" if the page is collapsed). Click **"+ Add users"**.
4. Type the email address into the field that appears, then save/confirm (the exact control has varied — read the page rather than assuming a fixed coordinate; use `find` or `read_page` to locate the input and save action rather than guessing pixel positions).
5. Screenshot the result and confirm the email now appears in the test users list.
6. Report back to the user in one or two sentences: confirm the email was added, and remind them the person can now go through Drive/Calendar "Connect" and will still see Google's "unverified app" warning — that's expected, they click **Advanced → Go to Creator Launchpad (unsafe)** to continue.

## If something's off

- **100-user cap reached**: the page shows a running count (e.g. "2 users / 100 user cap"). If it's maxed out, tell the user directly — there's no workaround short of Google verification, don't try to hack around it.
- **Page layout looks different from what's described here**: Google redesigns this Console UI periodically (it already changed once, from a "Testing" publish-status + explicit allowlist model to this cap-based "External" model). Don't force clicks at guessed coordinates — use `find`/`read_page` to locate the real controls, and if you genuinely can't find an equivalent action, stop and describe what you're seeing to the user rather than guessing.
