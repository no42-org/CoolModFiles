/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { test, expect } from "@playwright/test";

test.setTimeout(60_000);

// Regression for https://github.com/no42-org/CoolModFiles/issues/11
//
// On Firefox/Linux new AudioContexts start in 'suspended' state per the
// autoplay policy and only transition to 'running' on an explicit
// resume() from a user-gesture context. If that resume() call regresses,
// onaudioprocess never fires, libopenmpt's cursor never advances, and
// the clock display stays at 00:00.
test("file position clock advances after user starts playback", async ({
  page,
}) => {
  // Force every new AudioContext into 'suspended' state — this is what
  // Firefox/Linux does by default, but other engines/OS combinations are
  // more lenient. Wrapping the constructor here makes the regression
  // check deterministic across all three browser projects rather than
  // relying on host-specific autoplay heuristics.
  await page.addInitScript(() => {
    const Orig = window.AudioContext;
    const Wrapped = new Proxy(Orig, {
      construct(target, args, newTarget) {
        const inst = Reflect.construct(target, args, newTarget);
        void inst.suspend();
        return inst;
      },
    });
    window.AudioContext = Wrapped;
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext = Wrapped;
  });

  await page.goto("/");

  // Splash screen gate: the Player isn't mounted until the user clicks
  // the random-message button. The click also provides the gesture
  // activation that the synchronous load() → unlock() chain needs in
  // order for context.resume() to actually transition the state.
  await page.locator(".randombtn").click();

  // The document title gets the 🎶 prefix once the player has fetched
  // and decoded a module — a stable signal that auto-play attempted.
  await page.waitForFunction(() => document.title.startsWith("🎶"), null, {
    timeout: 30_000,
  });

  // The current-position span renders as mm:ss and is the first such
  // element on the page (the second one is the track duration).
  const clock = page.locator("text=/^\\d{2}:\\d{2}$/").first();
  await expect(clock).not.toHaveText("00:00", { timeout: 15_000 });
});
