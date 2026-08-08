/* Renders tools/og-image.html to og-image.png (2400x1260) and syncs the
 * matching "N books and counting" copy in index.html's social meta tags.
 *
 * Run this whenever the book count changes, so shares don't advertise a
 * stale number:
 *
 *   node tools/make-og-image.mjs
 *
 * The count is read straight out of data.js, so there is nothing to
 * hand-edit — add the book, rerun this, commit the PNG and index.html.
 * Needs Playwright's chromium available on the machine (a local
 * `npm i -D playwright` or a global install both work).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/* Prefer a local install; fall back to the global one (ESM ignores
   NODE_PATH, so the global root has to be resolved explicitly). */
async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    const url = pathToFileURL(join(root, "playwright", "index.js")).href;
    const mod = await import(url);
    /* Importing the CJS entry by URL surfaces it under `default`. */
    return (mod.chromium || mod.default.chromium);
  }
}

/* data.js is a plain script (no exports), so evaluate it in a sandbox
   and read BOOKS back out — the same shape app.js sees. It lives at
   the true repo root (shared with the main site), one level up from
   this archived/ copy. */
function readBookCount() {
  const sandbox = {};
  createContext(sandbox);
  runInContext(readFileSync(join(ROOT, "..", "data.js"), "utf8") +
    "\nthis.__BOOKS = BOOKS;", sandbox);
  return sandbox.__BOOKS.filter((b) => (b.status || "read") === "read").length;
}

const count = readBookCount();
const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 2400, height: 1260 },
  deviceScaleFactor: 1,
});

await page.goto(pathToFileURL(join(HERE, "og-image.html")).href,
  { waitUntil: "networkidle" });
await page.evaluate((n) => {
  document.getElementById("now-showing").textContent =
    "NOW SHOWING — " + n + " BOOKS AND COUNTING";
  return document.fonts.ready;
}, count);

await page.screenshot({ path: join(ROOT, "og-image.png") });
await browser.close();

/* The og:/twitter: descriptions quote the same number. Crawlers don't run
   JS, so it has to live in the markup — rewrite it rather than trust
   anyone to remember. */
const indexPath = join(ROOT, "index.html");
const html = readFileSync(indexPath, "utf8");
const synced = html.replace(/\b\d+ books and counting\b/g, count + " books and counting");
if (synced !== html) writeFileSync(indexPath, synced);

console.log("og-image.png written — " + count + " books" +
  (synced !== html ? " (index.html meta tags updated)" : ""));
