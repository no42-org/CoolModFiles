/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Newest modarchive.org module id, used as the upper bound for random
// picks. The RSS feed takes several seconds to answer, so the page never
// awaits it: callers get the cached value (or the fallback before the
// first fetch lands) and a stale value triggers a background refresh.
// Assumes a long-lived server process (the Docker standalone deploy);
// a serverless runtime may freeze before the refresh completes.

import { fetchHtml } from "./fetch";

const RSS_URL = "https://modarchive.org/rss.php?request=uploads";
const TTL_MS = 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const TIMEOUT_MS = 10_000;

let cached: number | undefined;
let nextCheckAt = 0;
let refreshing: Promise<void> | undefined;

async function refresh(): Promise<void> {
  try {
    const rss = await fetchHtml(RSS_URL, AbortSignal.timeout(TIMEOUT_MS));
    const id = Number(rss.split("downloads.php?moduleid=")[1].split("#")[0]);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`bad id ${id}`);
    cached = id;
    nextCheckAt = Date.now() + TTL_MS;
  } catch {
    // Keep the previous value; retry sooner than a full TTL.
    nextCheckAt = Date.now() + RETRY_MS;
  }
}

export function getLatestId(fallback: number): number {
  if (!refreshing && Date.now() >= nextCheckAt) {
    refreshing = refresh().finally(() => {
      refreshing = undefined;
    });
  }
  return cached ?? fallback;
}
