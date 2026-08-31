// Packages extension/ into public/auto-doomscroller.zip.
//
// Committed as a built artifact rather than zipped on request: it's a
// handful of static files that change only when the extension does, and
// zipping on a serverless route would mean shipping a zip library to
// production to rebuild identical bytes on every download.
//
// Run after touching anything in extension/:
//   node scripts/package-extension.mjs

import { execFileSync } from "child_process";
import { mkdirSync, rmSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "extension");
const out = resolve(root, "public", "auto-doomscroller.zip");

if (!existsSync(src)) {
  console.error("No extension/ directory to package.");
  process.exit(1);
}
mkdirSync(resolve(root, "public"), { recursive: true });
rmSync(out, { force: true });

// PowerShell's Compress-Archive rather than a dependency: it's already on
// every Windows box this repo is developed on, and adding a zip package to
// node_modules to build one static file would ship it to production for
// nothing.
execFileSync(
  "powershell",
  ["-NoProfile", "-Command", `Compress-Archive -Path '${src}\*' -DestinationPath '${out}' -Force`],
  { stdio: "inherit" }
);

console.log(`Packaged → ${out}`);
