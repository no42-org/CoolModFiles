/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Pure-string TFMX name parsers shared by the client pair detector
// (components/local/tfmx-pairs.ts), the server library walker
// (lib/library/pairs.ts), and the search endpoint. Lives here because
// the client module imports browser-only `File` types — the server
// cannot import from it directly.

import { tfmxSingleExt } from "../../components/sources";

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

  // prefix-dns (Chris Huelsbeck Dynamic Synthesizer; libtfmx >= 1.0.10).
  // `smp.` does not collide with the `smpl.` check above — `smpl.<base>`
  // does not start with `smp.` (the char after `smp` is `l`, not `.`).
  if (lower.startsWith("dns.")) return result("tfx", name.slice(4));
  if (lower.startsWith("smp.")) return result("sam", name.slice(4));

  return null;
}

export type ParsedSingleName = {
  base: string; // filename minus the recognised extension, case-preserved
  ext: string; // matched extension, lower-case incl. dot
};

/**
 * Parse a single-file libtfmx module name (Hippel TFMX / Future Composer
 * — see TFMX_SINGLE_EXTENSIONS). Returns null when the name doesn't carry
 * a single-file extension, OR when it is ALSO a pair half (e.g. the
 * prefix-Amiga `mdat.fc`, whose base ends in a single-file token) — pair
 * detection takes precedence everywhere, otherwise the same file would be
 * mis-split on local drop and double-listed by the library endpoints.
 * This is the ONE definition of that invariant; the Library listing,
 * search, and Local-drop detectors all call it.
 */
export function parseSingleName(name: string): ParsedSingleName | null {
  const ext = tfmxSingleExt(name);
  if (!ext) return null;
  if (parseHalfName(name)) return null; // pair half — never a single
  return { base: name.slice(0, name.length - ext.length), ext };
}
