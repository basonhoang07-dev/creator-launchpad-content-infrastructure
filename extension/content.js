/**
 * Creator Launchpad — content script.
 *
 * Runs on Instagram and TikTok and does two things while you scroll: tells
 * you when the video in front of you is from a creator you already track,
 * and saves it into Creator Launchpad on one click.
 *
 * It reads the page and it posts to our own API. It does not click, like,
 * follow, or scroll anything — the only thing that moves is you.
 */

(function () {
  "use strict";

  const API = "https://creator-launchpad-content-infrastru.vercel.app";
  // Both platforms are single-page apps: the URL changes without a
  // navigation, so there's no load event to hang this off.
  const POLL_MS = 700;

  let context = null; // { creators, alertedUrls } — fetched once per page load
  let lastUrl = "";
  let node = null;

  // ---- reading the page ---------------------------------------------------

  /**
   * The canonical permalink for whatever is on screen. On Instagram the
   * address bar already holds it once you're in the reels player. On TikTok
   * it does too, but only after the first swipe — before that the URL is
   * /foryou, so the video's own link is dug out of the article instead.
   */
  function currentVideo() {
    const href = location.href;

    const ig = href.match(/instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/);
    if (ig) {
      return {
        url: `https://www.instagram.com/reel/${ig[1]}/`,
        handle: readHandle(),
        caption: readCaption(),
      };
    }

    const tt = href.match(/tiktok\.com\/@([\w.-]+)\/video\/(\d+)/);
    if (tt) {
      return {
        url: `https://www.tiktok.com/@${tt[1]}/video/${tt[2]}`,
        handle: tt[1],
        caption: readCaption(),
      };
    }

    return null;
  }

  /** Whose video this is. Falls back through the shapes each app uses. */
  function readHandle() {
    const fromUrl = location.pathname.match(/^\/@([\w.-]+)/);
    if (fromUrl) return fromUrl[1];

    // Instagram puts the author in a link to their profile near the video.
    const links = document.querySelectorAll('a[href^="/"][role="link"]');
    for (const a of links) {
      const m = a.getAttribute("href").match(/^\/([A-Za-z0-9._]+)\/?$/);
      // Skip its own nav routes, which match the same shape.
      if (m && !["explore", "reels", "direct", "accounts", "p"].includes(m[1])) return m[1];
    }
    return "";
  }

  function readCaption() {
    const el =
      document.querySelector('[data-e2e="browse-video-desc"]') ||
      document.querySelector('[data-e2e="video-desc"]') ||
      document.querySelector("article h1");
    return el ? el.textContent.trim().slice(0, 300) : "";
  }

  // ---- the control --------------------------------------------------------

  function ensureNode() {
    if (node && document.body.contains(node)) return node;
    node = document.createElement("div");
    node.className = "clp-badge";
    document.body.appendChild(node);
    return node;
  }

  function render(parts) {
    const host = ensureNode();
    host.textContent = "";
    parts.forEach((p) => host.appendChild(p));
  }

  function pill(label, className, onClick) {
    const b = document.createElement("button");
    b.className = `clp-pill${className ? " " + className : ""}`;
    b.textContent = label;
    if (onClick) b.addEventListener("click", onClick);
    else b.disabled = true;
    return b;
  }

  // ---- saving -------------------------------------------------------------

  async function save(video, button) {
    const { token } = await chrome.storage.local.get("token");
    if (!token) {
      button.className = "clp-pill clp-pill--error";
      button.textContent = "Add your key first";
      return;
    }

    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const res = await fetch(`${API}/api/extension/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Extension-Token": token },
        body: JSON.stringify(video),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save");

      button.className = "clp-pill clp-pill--done";
      button.textContent =
        json.saved === "creator" ? `Saved to @${json.creator}` : `Saved to ${json.board}`;
    } catch (err) {
      button.className = "clp-pill clp-pill--error";
      button.textContent = err.message.slice(0, 40);
      button.disabled = false;
    }
  }

  // ---- the loop -----------------------------------------------------------

  function paint() {
    const video = currentVideo();
    if (!video) {
      if (node) node.textContent = "";
      return;
    }

    const parts = [];
    const handle = (video.handle || "").toLowerCase();

    const tracked = context && context.creators.find((c) => c.handle === handle);
    if (tracked) {
      parts.push(pill(tracked.brand ? `Tracked · ${tracked.brand}` : "You track this creator", "clp-pill--tracked"));
    }

    // Already crossed its threshold, so it's a proven format rather than
    // something you merely like the look of.
    if (context && context.alertedUrls.includes(video.url)) {
      parts.push(pill("Already went viral", "clp-pill--hot"));
    }

    const saveBtn = pill("Save to Launchpad", "", () => save(video, saveBtn));
    parts.push(saveBtn);
    render(parts);
  }

  async function loadContext() {
    const { token } = await chrome.storage.local.get("token");
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/extension/context`, { headers: { "X-Extension-Token": token } });
      if (res.ok) context = await res.json();
    } catch {
      // Offline or signed out — the save button still works and reports its
      // own failure, which is better than the whole overlay vanishing.
    }
  }

  loadContext().then(paint);

  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    paint();
  }, POLL_MS);
})();
