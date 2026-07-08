/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Server-side TFMX pair detection for the library API. Two helpers:
//
//   detectPairsInDir — pure function over a directory's already-read
//     entries. Used by the listing endpoint.
//   walkPairs — recursive walker producing every pair reachable from
//     LIBRARY_ROOT. Used by the random and search endpoints.
//
// Both group halves by (directory, base) per design D2 — pairs from
// different directories with the same base do not collide. parseHalfName
// is reused from lib/tfmx/pairs.ts so the three naming conventions stay
// in one place.

import fs from "fs/promises";
import path from "path";
import { parseHalfName, parseSingleName } from "../tfmx/pairs";
// Explicit `./index` rather than `.` — keeps intent unambiguous and
// guards against a future barrel re-export from `lib/library/index.ts`
// reaching back into this module and forming a cycle.
import { MAX_DEPTH } from "./index";

export type TfmxPairEntry = {
  base: string; // case-preserved from the music-data half
  tfx: string; // half-filename within the listed directory (not a full path)
  sam: string;
};

// A single-file libtfmx module (Hippel / Future Composer) — no sample half.
export type TfmxSingleEntry = {
  base: string; // filename minus the recognised extension, case-preserved
  name: string; // filename within the listed directory
  ext: string; // matched extension, lower-case incl. dot
};

export type TfmxPairLocation = {
  base: string;
  tfxPath: string; // LIBRARY_ROOT-relative POSIX-style path
  samPath: string;
};

type DirEntry = { name: string; isFile: boolean };

/**
 * Group TFMX halves found in a single directory's entry list into pairs.
 * Returns one TfmxPairEntry per matched pair, sorted alphabetically by base.
 * Unpaired halves are silently dropped — they are unplayable on their own
 * AND broadening the file allowlist without requiring a partner would
 * undo the orphan-half rejection at the file endpoint (design D4).
 */
export function detectPairsInDir(entries: DirEntry[]): TfmxPairEntry[] {
  const tfxByBase = new Map<string, string>(); // key: lower-case base → filename
  const samByBase = new Map<string, string>();
  // Preserve the case-preserved base so collisions don't silently overwrite.
  const displayBaseByKey = new Map<string, string>();

  for (const e of entries) {
    if (!e.isFile) continue;
    const parsed = parseHalfName(e.name);
    if (!parsed) continue;
    const key = parsed.base.toLowerCase();
    const target = parsed.kind === "tfx" ? tfxByBase : samByBase;
    target.set(key, e.name);
    // Prefer the tfx half's case for display (matches the local-drop
    // behaviour in components/local/tfmx-pairs.ts where the music-data
    // half's `base` is what surfaces in the catalog).
    if (parsed.kind === "tfx" || !displayBaseByKey.has(key)) {
      displayBaseByKey.set(key, parsed.base);
    }
  }

  const pairs: TfmxPairEntry[] = [];
  for (const [key, tfx] of tfxByBase) {
    const sam = samByBase.get(key);
    if (!sam) continue;
    pairs.push({ base: displayBaseByKey.get(key) ?? key, tfx, sam });
  }
  pairs.sort((a, b) => a.base.localeCompare(b.base));
  return pairs;
}

/**
 * Single-file libtfmx modules in a directory's entry list. These are
 * self-contained (no sample half) and NOT run through pair-matching —
 * which would drop them as orphans. Classification (including the
 * pair-half precedence rule that keeps a `mdat.fc` out of the singles)
 * is canonical in `parseSingleName` — shared with the search endpoint
 * and the Local-drop detector. Sorted by base.
 */
export function detectSinglesInDir(entries: DirEntry[]): TfmxSingleEntry[] {
  const out: TfmxSingleEntry[] = [];
  for (const e of entries) {
    if (!e.isFile) continue;
    const parsed = parseSingleName(e.name);
    if (!parsed) continue;
    out.push({ base: parsed.base, name: e.name, ext: parsed.ext });
  }
  out.sort((a, b) => a.base.localeCompare(b.base));
  return out;
}

/**
 * Walk the library tree from `root` and return every TFMX pair found,
 * with paths relative to `root` in POSIX format (forward slashes).
 *
 * Depth-limited per the project's existing `MAX_DEPTH` plus a
 * realpath-keyed seen-set to short-circuit symlink cycles before they
 * burn the depth budget pumping duplicates. `cap` bounds the total pair
 * count returned; undefined means no cap.
 */
export async function walkPairs(
  root: string,
  cap?: number
): Promise<TfmxPairLocation[]> {
  const out: TfmxPairLocation[] = [];
  await walkInto(root, root, out, cap, 0, new Set());
  return out;
}

async function walkInto(
  dir: string,
  root: string,
  out: TfmxPairLocation[],
  cap: number | undefined,
  depth: number,
  seen: Set<string>
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (cap !== undefined && out.length >= cap) return;
  // Resolve symlinks before recording so a cycle through different
  // surface paths still collapses to the same canonical realpath.
  let realDir: string;
  try {
    realDir = await fs.realpath(dir);
  } catch {
    return;
  }
  if (seen.has(realDir)) return;
  seen.add(realDir);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const files: DirEntry[] = [];
  const subdirs: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) subdirs.push(e.name);
    else if (e.isFile()) files.push({ name: e.name, isFile: true });
  }
  for (const pair of detectPairsInDir(files)) {
    if (cap !== undefined && out.length >= cap) return;
    const relDir = path.relative(root, dir).split(path.sep).join("/");
    const prefix = relDir ? `${relDir}/` : "";
    out.push({
      base: pair.base,
      tfxPath: prefix + pair.tfx,
      samPath: prefix + pair.sam,
    });
  }
  for (const name of subdirs) {
    if (cap !== undefined && out.length >= cap) return;
    await walkInto(path.join(dir, name), root, out, cap, depth + 1, seen);
  }
}
