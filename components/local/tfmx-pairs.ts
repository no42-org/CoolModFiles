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
 * unplayable on their own — but they ARE surfaced via `unpaired` so the
 * caller can toast "drop the matching .sam (or .tfx) to play". Same for
 * `collisions` (multiple halves with the same base in one drop).
 */

import { tfmxLocal, type TfmxLocalSource } from "../sources";
import { parseHalfName, type HalfKind } from "../../lib/tfmx/pairs";

type ParsedHalf = {
  kind: HalfKind;
  base: string; // case-preserved (lower-case key used internally)
  file: File;
};

function parseHalf(file: File): ParsedHalf | null {
  const parsed = parseHalfName(file.name);
  return parsed ? { ...parsed, file } : null;
}

export type DetectResult = {
  pairs: TfmxLocalSource[];
  remainingFiles: File[];
  /** Base-name keys where two halves of the same kind collided (last-write-wins). */
  collisions: string[];
  /** File names whose partner half was not in the same drop. */
  unpaired: string[];
};

export function detectTfmxPairs(files: File[]): DetectResult {
  const tfxByBase = new Map<string, ParsedHalf>();
  const samByBase = new Map<string, ParsedHalf>();
  const remainingFiles: File[] = [];
  const collisions: string[] = [];

  for (const file of files) {
    const half = parseHalf(file);
    if (!half) {
      // Not a TFMX-half filename at all; passes through to the module
      // pipeline (where isModuleFile decides whether to keep it).
      remainingFiles.push(file);
      continue;
    }
    const key = half.base.toLowerCase();
    const target = half.kind === "tfx" ? tfxByBase : samByBase;
    if (target.has(key)) {
      // Two halves of the same kind sharing a base — folder drop with
      // `arkanoid/mdat.title + apidya/mdat.title` is the realistic case.
      // Keep last-write-wins (consistent with previous behaviour) but
      // record the displaced half so the caller can surface a toast.
      collisions.push(half.base);
    }
    target.set(key, half);
  }

  const pairs: TfmxLocalSource[] = [];
  const unpaired: string[] = [];
  for (const [key, tfx] of tfxByBase) {
    const sam = samByBase.get(key);
    if (sam) {
      // Use the music-data half's case-preserved base for display.
      pairs.push(tfmxLocal(tfx.file, sam.file, tfx.base));
    } else {
      unpaired.push(tfx.file.name);
    }
  }
  for (const [key, sam] of samByBase) {
    if (!tfxByBase.has(key)) {
      unpaired.push(sam.file.name);
    }
  }

  return { pairs, remainingFiles, collisions, unpaired };
}
