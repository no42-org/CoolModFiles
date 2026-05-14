/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Pair detection for TFMX file drops. Returns matched pairs as
 * TfmxLocalSource entries plus the un-paired-and-non-TFMX residue for
 * the existing isModuleFile pipeline to filter.
 *
 * Three naming conventions covered (case-insensitive on the extension /
 * prefix; case preserved in the returned `base` from the music-data half):
 *
 *   suffix-Pro     X.tfx       + X.sam           (Apidya rips)
 *   prefix-Amiga   mdat.X      + smpl.X          (Modland)
 *   suffix-mdat    X.mdat      + X.smpl          (rare; some collections)
 *
 * Unpaired halves are NOT returned as remainingFiles — TFMX halves are
 * unplayable on their own and the spec says to silently drop them.
 */

import { tfmxLocal, type TfmxLocalSource } from "../sources";

type HalfKind = "tfx" | "sam";

type ParsedHalf = {
  kind: HalfKind;
  base: string; // case-preserved (lower-case key used internally)
  file: File;
};

function parseHalf(file: File): ParsedHalf | null {
  const name = file.name;
  const lower = name.toLowerCase();

  // suffix-Pro
  if (lower.endsWith(".tfx")) {
    return { kind: "tfx", base: name.slice(0, -4), file };
  }
  if (lower.endsWith(".sam")) {
    return { kind: "sam", base: name.slice(0, -4), file };
  }

  // suffix-mdat
  if (lower.endsWith(".mdat")) {
    return { kind: "tfx", base: name.slice(0, -5), file };
  }
  if (lower.endsWith(".smpl")) {
    return { kind: "sam", base: name.slice(0, -5), file };
  }

  // prefix-Amiga
  if (lower.startsWith("mdat.")) {
    return { kind: "tfx", base: name.slice(5), file };
  }
  if (lower.startsWith("smpl.")) {
    return { kind: "sam", base: name.slice(5), file };
  }

  return null;
}

export type DetectResult = {
  pairs: TfmxLocalSource[];
  remainingFiles: File[];
};

export function detectTfmxPairs(files: File[]): DetectResult {
  const tfxByBase = new Map<string, ParsedHalf>();
  const samByBase = new Map<string, ParsedHalf>();
  const remainingFiles: File[] = [];

  for (const file of files) {
    const half = parseHalf(file);
    if (!half) {
      // Not a TFMX-half filename at all; passes through to the module
      // pipeline (where isModuleFile decides whether to keep it).
      remainingFiles.push(file);
      continue;
    }
    const key = half.base.toLowerCase();
    if (half.kind === "tfx") {
      // Last write wins for duplicates with same base — same as the
      // module-pipeline's behaviour, which deduplicates via sourceKey.
      tfxByBase.set(key, half);
    } else {
      samByBase.set(key, half);
    }
  }

  const pairs: TfmxLocalSource[] = [];
  for (const [key, tfx] of tfxByBase) {
    const sam = samByBase.get(key);
    if (sam) {
      // Use the music-data half's case-preserved base for display.
      pairs.push(tfmxLocal(tfx.file, sam.file, tfx.base));
    }
    // Unpaired tfx: silently dropped. The spec says unpaired TFMX
    // halves do not appear in the catalog.
  }
  // Unpaired sam halves are also silently dropped — no separate
  // handling needed, they simply weren't matched into `pairs`.

  return { pairs, remainingFiles };
}
