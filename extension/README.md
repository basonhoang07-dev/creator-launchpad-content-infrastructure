# Creator Launchpad — browser extension

Flags creators you already track while you scroll Instagram or TikTok, and
saves any Reel or TikTok into Creator Launchpad on one click.

## What it does

- **Tracked** — a badge when the video in front of you is from a creator on
  your Viral Alerts list, showing which brand board they're tracked for.
- **Already went viral** — a badge when that exact video has crossed its
  threshold, so a proven format is distinguishable from one you merely like.
- **Save to Launchpad** — sends the video to your account. A creator you
  already track gets it filed against them; anyone else becomes an
  unscripted concept on your first brand board with the link attached, ready
  for the Breakdown tab.

## What it does not do

It does not like, follow, repost, comment, or scroll. It reads the page you
are already looking at and posts to our own API when you click Save. Nothing
happens on Instagram or TikTok that you did not do yourself.

## Install

1. Open Creator Launchpad → **Integrations** → **Browser extension**, and
   copy your connection key.
2. In Chrome, go to `chrome://extensions`, turn on **Developer mode**, and
   choose **Load unpacked**.
3. Select this `extension` folder.
4. Click the extension's icon, paste the key, hit **Connect**. It should
   read "Connected as <your name>".

## Notes

- The key is per-client and reaches only your saved references. Treat it
  like a password; replacing it in Integrations cuts off any copy you no
  longer control.
- Instagram and TikTok are single-page apps, so the overlay re-checks the
  address every 700ms rather than waiting for a page load that never comes.
- No icons are bundled — Chrome will use a default placeholder, which is
  fine for an unpacked internal extension.
