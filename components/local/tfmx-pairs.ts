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
 * Single-file libtfmx formats (Hippel TFMX / Future Composer — see
 * TFMX_SINGLE_EXTENSIONS) are detected too and returned as `singles`.
 * They are self-contained (no partner half), so a single dropped file is
 * immediately playable.
 *
 * Unpaired halves are NOT returned as remainingFiles — TFMX halves are
 * unplayable on their own — but they ARE surfaced via `unpaired` so the
 * caller can toast "drop the matching .sam (or .tfx) to play". Same for
 * `collisions` (multiple halves with the same base in one drop).
 */

import {
  tfmxLocal,
  tfmxSingleLocal,
  type TfmxLocalSource,
  type TfmxSingleLocalSource,
} from "../sources";
import {
  parseHalfName,
  parseSingleName,
  type HalfKind,
} from "../../lib/tfmx/pairs";

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
  /** Self-contained single-file libtfmx modules (Hippel / Future Composer). */
  singles: TfmxSingleLocalSource[];
  remainingFiles: File[];
  /** Base-name keys where two halves of the same kind collided (last-write-wins). */
  collisions: string[];
  /** File names whose partner half was not in the same drop. */
  unpaired: string[];
};

export function detectTfmxPairs(files: File[]): DetectResult {
  const tfxByBase = new Map<string, ParsedHalf>();
  const samByBase = new Map<string, ParsedHalf>();
  const singles: TfmxSingleLocalSource[] = [];
  const remainingFiles: File[] = [];
  const collisions: string[] = [];

  for (const file of files) {
    // Single-file libtfmx formats are claimed before the remainingFiles
    // push, so they never fall through to the isModuleFile pipeline (which
    // excludes them by design) and get silently dropped. A single file is
    // immediately playable, never `unpaired`. Classification (including
    // pair-half precedence — `mdat.fc` is a half, not a single) is
    // canonical in parseSingleName, shared with the library endpoints.
    const single = parseSingleName(file.name);
    if (single) {
      singles.push(tfmxSingleLocal(file, single.base, single.ext));
      continue;
    }
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

  return { pairs, singles, remainingFiles, collisions, unpaired };
}
