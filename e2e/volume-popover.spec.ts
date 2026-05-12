/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-only
 */
import { test, expect } from "@playwright/test";

test.setTimeout(60_000);

// The previous volume column was opacity:0 / hover-reveal on a blank
// 4%-wide strip on the far-left of the player. Desktop users reported
// they couldn't find it; touch users couldn't hover. This test pins
// the replacement behavior: a visible speaker button in the footer
// opens a dialog containing a slider.
test("volume popover opens from the footer speaker button", async ({
  page,
}) => {
  await page.goto("/");

  // Splash gate — same dance as clock-advances.spec.ts.
  await page.locator(".randombtn").click();

  // The Player.tsx -> PlayerBig.tsx footer mounts after the splash.
  const volumeButton = page.getByRole("button", { name: "Volume" });
  await expect(volumeButton).toBeVisible({ timeout: 15_000 });

  // No hover required — clicking opens the popover.
  await volumeButton.click();

  const dialog = page.getByRole("dialog", { name: "Volume control" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("slider")).toBeVisible();

  // ESC closes the popover.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
