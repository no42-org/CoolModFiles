/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Browser driver for CoolModFiles — launches headless Chromium (via the
 * project's @playwright/test) against a running dev server, enters the
 * app, optionally opens the source drawer to a tab and plays a row, then
 * screenshots and reports any playback error. This is the agent handle
 * for driving the player UI.
 *
 * Prereq: a dev server must already be running (see run-coolmodfiles
 * SKILL.md). This script does NOT start the server — LIBRARY_ROOT must be
 * set at server-launch time, before this runs.
 *
 * Usage (from repo root):
 *   node scripts/run-driver.mjs
 *   node scripts/run-driver.mjs --tab Library
 *   node scripts/run-driver.mjs --tab Library --play chambers
 *
 * Options:
 *   --url <url>    server URL (default http://localhost:3123)
 *   --tab <name>   drawer tab: "Mod Archive" | "Library" | "Local"
 *   --play <text>  after opening the tab, click the first row containing
 *                  <text> (case-insensitive) and report playback state
 *   --shot <path>  screenshot output path (default ./run-shot.png)
 *   --wait <ms>    wait after --play for decode/render (default 6000)
 */
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const URL = opt("--url", "http://localhost:3123");
const TAB = opt("--tab", null);
const PLAY = opt("--play", null);
const SHOT = opt("--shot", "./run-shot.png");
const WAIT = parseInt(opt("--wait", "6000"), 10);

const browser = await chromium.launch({
  // Required for the AudioContext to start without a user gesture, so
  // playback actually begins under automation.
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();

const errors = [];
page.on("console", (m) => {
  const t = m.text();
  if (/\[tfmx-processor\]|\[AudioPlayer\]|\[pcm\]|Couldn't play|aborted|init failed/i.test(t))
    errors.push(`[${m.type()}] ${t.slice(0, 200)}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// The landing splash requires a click to enter the player. `.randombtn`
// ("JMP playmod") is the entry control — it also autoplays a random Mod
// Archive track, which is fine/expected.
await page.locator(".randombtn").click();
await page.waitForTimeout(1500);

if (TAB) {
  // Open the source drawer via the playlist button, then click the tab.
  // The player's download overlay intercepts pointer events, so force.
  await page.locator("#playlistButton").click({ force: true });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: TAB, exact: true }).click({ force: true });
  await page.waitForTimeout(1200);
}

let playResult = null;
if (PLAY) {
  errors.length = 0;
  const row = page.locator("li", { hasText: new RegExp(PLAY, "i") }).first();
  const count = await row.count();
  if (count === 0) {
    playResult = `NO ROW matched "${PLAY}"`;
  } else {
    await row.click({ force: true });
    await page.waitForTimeout(WAIT);
    const body = await page.locator("body").innerText();
    const fail = body.match(/Couldn't play[^\n]*/i);
    const from = body.match(/Playing from:\s*([^\n]*)/i);
    playResult = fail
      ? `FAIL: ${fail[0]}`
      : `OK (Playing from: ${from ? from[1].trim() : "?"})`;
  }
}

await page.screenshot({ path: SHOT });

console.log("=== CoolModFiles driver ===");
console.log("url:", URL, "| tab:", TAB || "-", "| play:", PLAY || "-");
if (playResult) console.log("play:", playResult);
console.log("errors:", errors.length ? JSON.stringify(errors) : "none");
console.log("screenshot:", SHOT);

await browser.close();
process.exit(playResult && playResult.startsWith("FAIL") ? 1 : 0);
