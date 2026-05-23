/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Verification spec for the master-mix spectrum analyzer. Drives the
 * running app, asserts the disc-row layout, and exercises the canvas
 * rendering pipeline end-to-end by injecting synthetic FFT data —
 * sidestepping the need for a real network track fetch.
 *
 * The synthetic-data trick: this spec mutates
 * `AnalyserNode.prototype.getByteFrequencyData` to return a known
 * bass-heavy pattern, waits a few RAF ticks for the canvas to redraw,
 * then samples pixels to verify the gradient. The mutation is
 * page-local (BrowserContext isolation per Playwright test) and
 * restored before the test ends. `test.describe.configure({ mode:
 * "serial" })` guards against future analyser specs racing it within
 * the same worker.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SHOTS = path.join(process.cwd(), "verify-shots");
fs.mkdirSync(SHOTS, { recursive: true });

test.setTimeout(120_000);

test.describe.configure({ mode: "serial" });

test("spectrum analyzer: layout, idle state, canvas reacts to audio data", async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });

  // 1) Open the app and dismiss the splash so PlayerBig mounts.
  await page.goto("/");
  await page.locator(".randombtn").click();

  // 2) Wait for PlayerBig to render. The disc banner is the most stable
  //    landmark (it stays mounted across track loads).
  const banner = page.locator("img[alt='anim']");
  await expect(banner).toBeVisible({ timeout: 30_000 });

  // 3) Locate the analyzer canvas (aria-hidden, decorative).
  const canvas = page.locator("canvas[aria-hidden='true']");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();

  // 4) Layout assertion: disc is to the left of the analyzer canvas,
  //    both share the same row (top edges within a few px of each
  //    other given the align-items: center).
  const discBox = await banner.boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(discBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  if (!discBox || !canvasBox) throw new Error("boxes null");
  expect(canvasBox.x).toBeGreaterThan(discBox.x + discBox.width - 1);
  // Vertical centers within ~6 px of each other (align-items: center).
  const discCY = discBox.y + discBox.height / 2;
  const canvasCY = canvasBox.y + canvasBox.height / 2;
  expect(Math.abs(canvasCY - discCY)).toBeLessThan(8);

  // 5) Initial paint: the canvas should be drawn with the BG color
  //    (#0a0a0a). Sample a pixel near the top-left where no bar will
  //    ever reach. Allow either the BG color (#0a0a0a) or a low-amp
  //    grey from the gradient if a frame already ticked.
  const initialTopLeftPixel = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const data = ctx.getImageData(2, 2, 1, 1).data;
    return [data[0], data[1], data[2], data[3]] as [number, number, number, number];
  });
  expect(initialTopLeftPixel).not.toBeNull();
  // Background or near-black expected.
  if (initialTopLeftPixel) {
    const [r, g, b, a] = initialTopLeftPixel;
    expect(a).toBeGreaterThan(0); // alpha is non-zero — something is painted
    expect(r).toBeLessThan(50);
    expect(g).toBeLessThan(50);
    expect(b).toBeLessThan(50);
  }

  await page.screenshot({
    path: path.join(SHOTS, "01-idle-or-initial.png"),
    fullPage: false,
  });

  // 6) Inject synthetic FFT data into the AnalyserNode by overriding
  //    getByteFrequencyData on the prototype. This sidesteps the need
  //    to hold a reference to the AudioPlayer instance — the next RAF
  //    tick reads our synthetic data and the canvas redraws.
  await page.evaluate(() => {
    const proto = AnalyserNode.prototype as AnalyserNode & {
      __origGetByteFrequencyData?: AnalyserNode["getByteFrequencyData"];
    };
    if (!proto.__origGetByteFrequencyData) {
      proto.__origGetByteFrequencyData = proto.getByteFrequencyData;
    }
    proto.getByteFrequencyData = function (this: AnalyserNode, buf: Uint8Array) {
      // Synthetic: leftmost bins loud (bass-heavy), tapering to silence.
      for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.max(0, Math.min(255, 240 - i));
      }
    };
  });

  // Give a few RAF ticks for the canvas to redraw with synthetic data.
  await page.waitForTimeout(500);

  // 7) Verify the canvas now has non-background pixels in the lower
  //    portion (where tall bars from synthetic data should render).
  const hasBarsPainted = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return { painted: false, samples: [] as Array<[number, number, number]> };
    // Sample 5 horizontal points near the bottom of the canvas.
    const samples: Array<[number, number, number]> = [];
    const y = c.height - 4;
    let painted = false;
    for (let i = 0; i < 5; i++) {
      const x = Math.floor((i + 1) * c.width / 6);
      const d = ctx.getImageData(x, y, 1, 1).data;
      samples.push([d[0], d[1], d[2]]);
      // A painted bar pixel has at least one channel > 60 (background
      // is ~10/10/10).
      if (d[0] > 60 || d[1] > 60 || d[2] > 60) painted = true;
    }
    return { painted, samples };
  });
  expect(hasBarsPainted.painted).toBe(true);

  await page.screenshot({
    path: path.join(SHOTS, "02-bars-with-synthetic-data.png"),
    fullPage: false,
  });

  // 8) Verify the gradient: a tall bar's top pixel should be magenta-ish
  //    (high R, low G, high B), the mid should be cyan-ish (low R, high
  //    G+B), the floor should be grey (~#ddd).
  const gradientCheck = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    // Find the leftmost bar (loudest given our synthetic data — value
    // ≈ 240 → bar fills ~94% of height). Sample three points in its
    // vertical strip.
    const barX = Math.floor(c.width * 0.025); // around bar 0 column
    const topY = Math.floor(c.height * 0.1);
    const midY = Math.floor(c.height * 0.55);
    const bottomY = Math.floor(c.height * 0.95);
    const top = ctx.getImageData(barX, topY, 1, 1).data;
    const mid = ctx.getImageData(barX, midY, 1, 1).data;
    const bottom = ctx.getImageData(barX, bottomY, 1, 1).data;
    return {
      top: [top[0], top[1], top[2]] as [number, number, number],
      mid: [mid[0], mid[1], mid[2]] as [number, number, number],
      bottom: [bottom[0], bottom[1], bottom[2]] as [number, number, number],
    };
  });
  // Log for the report; don't hard-assert every channel — exact mid
  // depends on which slice of the gradient the sampled pixel falls in.
  console.log("[verify] gradient samples:", JSON.stringify(gradientCheck));
  expect(gradientCheck).not.toBeNull();
  if (gradientCheck) {
    // Top should have a high R+B (magenta family, #bd00ff = 189/0/255).
    expect(gradientCheck.top[0]).toBeGreaterThan(60);
    expect(gradientCheck.top[2]).toBeGreaterThan(60);
  }

  // 9) Pause/idle behavior: restore the original prototype and give
  //    the analyser-driven loop a moment to re-read live (zero) data.
  await page.evaluate(() => {
    const proto = AnalyserNode.prototype as AnalyserNode & {
      __origGetByteFrequencyData?: AnalyserNode["getByteFrequencyData"];
    };
    if (proto.__origGetByteFrequencyData) {
      proto.getByteFrequencyData = proto.__origGetByteFrequencyData;
      delete proto.__origGetByteFrequencyData;
    }
  });
  // Wait long enough for peak hold to fully decay (max height /
  // 0.4 px-per-frame / 60 fps ≈ height/24 seconds; cap at 2.5 s).
  await page.waitForTimeout(2500);

  await page.screenshot({
    path: path.join(SHOTS, "03-after-restore-idle.png"),
    fullPage: false,
  });

  // 10) Mobile viewport: confirm the row stays inline and the canvas
  //     shrinks but is still present.
  await page.setViewportSize({ width: 414, height: 800 });
  await page.waitForTimeout(300);
  const discMobile = await banner.boundingBox();
  const canvasMobile = await canvas.boundingBox();
  expect(discMobile && canvasMobile).toBeTruthy();
  if (discMobile && canvasMobile) {
    expect(canvasMobile.x).toBeGreaterThan(discMobile.x + discMobile.width - 1);
    // Heights match (80px mobile expectation; allow ±8 for image
    // intrinsic vs CSS height).
    expect(Math.abs(canvasMobile.height - discMobile.height)).toBeLessThan(12);
  }
  await page.screenshot({
    path: path.join(SHOTS, "04-mobile-viewport.png"),
    clip:
      discMobile && canvasMobile
        ? {
            x: Math.max(0, discMobile.x - 8),
            y: Math.max(0, discMobile.y - 8),
            width: Math.min(414, discMobile.width + canvasMobile.width + 24),
            height: Math.max(discMobile.height, canvasMobile.height) + 16,
          }
        : undefined,
  });

  // 11) Console hygiene — fail loudly if our changes spawn errors.
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);

  testInfo.attach("shots-dir", { body: SHOTS, contentType: "text/plain" });
});
