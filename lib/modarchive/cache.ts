/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Process-shared in-memory TTL cache for modarchive.org scrape results.
// Single instance lives for the lifetime of the Next.js server process;
// resets on restart. Keyed by the upstream URL string.

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();

export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function set(key: string, value: unknown, ttlSec: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export const DEFAULT_TTL_SEC = 24 * 60 * 60; // 24 hours
