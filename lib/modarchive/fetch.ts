/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Polite HTTP fetcher for modarchive.org. Identifies the app via a
// distinct User-Agent. Throws on non-2xx so callers can surface errors
// without poisoning the cache. No retries — failures are surfaced
// immediately so the chart pane can offer a Retry button.

const USER_AGENT =
  "CoolModFiles (+https://github.com/no42-org/CoolModFiles)";

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} returned ${res.status}`);
  }
  return res.text();
}
