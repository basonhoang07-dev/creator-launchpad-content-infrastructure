// Stores the connection key and confirms it works, so a wrong paste is
// caught here rather than showing up as a silent failure on a reel.
const statusEl = document.getElementById("status");
const input = document.getElementById("token");

async function check(token) {
  if (!token) return null;
  try {
    const res = await fetch("https://creator-launchpad-content-infrastru.vercel.app/api/extension/context", {
      headers: { "X-Extension-Token": token },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function show(ctx) {
  if (ctx) {
    statusEl.textContent = `Connected as ${ctx.client.name} · tracking ${ctx.creators.length}`;
    statusEl.className = "sub ok";
  } else {
    statusEl.textContent = "Not connected";
    statusEl.className = "sub";
  }
}

chrome.storage.local.get("token").then(async ({ token }) => {
  if (token) input.value = token;
  show(await check(token));
});

document.getElementById("save").addEventListener("click", async () => {
  const token = input.value.trim();
  statusEl.textContent = "Checking…";
  const ctx = await check(token);
  if (ctx) await chrome.storage.local.set({ token });
  else statusEl.className = "sub";
  show(ctx);
  if (!ctx) statusEl.textContent = "That key didn't work";
});
