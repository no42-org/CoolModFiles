/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Newest modarchive.org module id, used as the upper bound for random
// picks. The RSS feed takes several seconds to answer, so the page never
// awaits it: callers get the cached value (or the fallback before the
// first fetch lands) and a stale value triggers a background refresh.

const RSS_URL = "https://modarchive.org/rss.php?request=uploads";
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

let cached: number | undefined;
let checkedAt = 0;
let refreshing: Promise<void> | undefined;

async function refresh(): Promise<void> {
  try {
    const res = await fetch(RSS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const rss = await res.text();
    const id = Number(rss.split("downloads.php?moduleid=")[1].split("#")[0]);
    if (Number.isInteger(id) && id > 0) cached = id;
  } catch {
    // Keep the previous value; retry after the next TTL window.
  } finally {
    checkedAt = Date.now();
    refreshing = undefined;
  }
}

export function getLatestId(fallback: number): number {
  if (!refreshing && Date.now() - checkedAt > TTL_MS) {
    refreshing = refresh();
  }
  return cached ?? fallback;
}
