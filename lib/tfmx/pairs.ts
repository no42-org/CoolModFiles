/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Pure-string TFMX-half parser shared by the client pair detector
// (components/local/tfmx-pairs.ts) and the server library walker
// (lib/library/pairs.ts). Lives here because the client module imports
// browser-only `File` types — the server cannot import from it directly.

export type HalfKind = "tfx" | "sam";

export type ParsedHalfName = {
  kind: HalfKind;
  base: string; // case-preserved from the input filename
};

export function parseHalfName(name: string): ParsedHalfName | null {
  const lower = name.toLowerCase();

  // Reject empty-base matches (e.g. literal `.tfx`, `mdat.`) — they
  // would otherwise collide on the empty-base key in detectPairsInDir,
  // producing a phantom pair labelled `(TFMX)` with no displayable name.
  const result = (kind: HalfKind, base: string): ParsedHalfName | null =>
    base ? { kind, base } : null;

  // suffix-Pro
  if (lower.endsWith(".tfx")) return result("tfx", name.slice(0, -4));
  if (lower.endsWith(".sam")) return result("sam", name.slice(0, -4));

  // suffix-mdat
  if (lower.endsWith(".mdat")) return result("tfx", name.slice(0, -5));
  if (lower.endsWith(".smpl")) return result("sam", name.slice(0, -5));

  // prefix-Amiga
  if (lower.startsWith("mdat.")) return result("tfx", name.slice(5));
  if (lower.startsWith("smpl.")) return result("sam", name.slice(5));

  return null;
}
