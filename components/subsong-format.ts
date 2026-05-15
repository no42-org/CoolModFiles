/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Display formatter for subsong picker options.
 *
 * Both audio worklets — chiptune3 (libopenmpt) and tfmx (libtfmxaudiodecoder)
 * — emit a generic "Subsong N" string when the engine has no real per-song
 * name (always for libtfmx, most of the time for libopenmpt). This helper
 * rewrites that engine fallback to a self-locating "Tune N of M" form so
 * the picker entry tells the user where they are in the set. Real
 * engine-provided names (e.g. "Title Theme", "Boss") pass through unchanged.
 *
 * Tolerant matching: whitespace and case are normalised so a worklet-side
 * cosmetic tweak (zero-padding, casing) can't silently regress the UX.
 */

const SUBSONG_FALLBACK_RE = /^\s*subsong\s+\d+\s*$/i;

export function formatSubsongName(
  name: string,
  idx: number,
  total: number
): string {
  if (SUBSONG_FALLBACK_RE.test(name)) {
    return `Tune ${idx + 1} of ${total}`;
  }
  return name;
}
