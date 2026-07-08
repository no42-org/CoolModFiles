/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { detectPairsInDir, detectSinglesInDir } from "./pairs";

type Entry = { name: string; isFile: boolean };
const files = (...names: string[]): Entry[] =>
  names.map((name) => ({ name, isFile: true }));

describe("detectSinglesInDir", () => {
  it("surfaces single-file libtfmx modules with base + ext", () => {
    const singles = detectSinglesInDir(files("Enigma.fc", "wings.hipc"));
    expect(singles).toEqual([
      { base: "Enigma", name: "Enigma.fc", ext: ".fc" },
      { base: "wings", name: "wings.hipc", ext: ".hipc" },
    ]);
  });

  it("preserves case in base but lower-cases the ext", () => {
    const [s] = detectSinglesInDir(files("Apidya.FC14"));
    expect(s.base).toBe("Apidya");
    expect(s.ext).toBe(".fc14");
  });

  it("ignores pair halves, MODs, and ambiguous .mdat", () => {
    expect(
      detectSinglesInDir(
        files("song.tfx", "song.sam", "song.mdat", "title.mod")
      )
    ).toEqual([]);
  });

  it("does not pair a single with a stray sample half", () => {
    // A .fc next to an unrelated .sam is a standalone single, never paired.
    const singles = detectSinglesInDir(files("song.fc", "song.sam"));
    expect(singles).toEqual([{ base: "song", name: "song.fc", ext: ".fc" }]);
  });
});

describe("detectPairsInDir regression (singles must not contaminate)", () => {
  it("still pairs Huelsbeck halves and ignores single-file formats", () => {
    const pairs = detectPairsInDir(files("Apidya.tfx", "Apidya.sam", "x.fc"));
    expect(pairs).toEqual([{ base: "Apidya", tfx: "Apidya.tfx", sam: "Apidya.sam" }]);
    // The .fc single is not a pair and is not emitted here — it comes only
    // from detectSinglesInDir. This is what keeps single files out of the
    // pair-only /api/library/tfmx-random walk (design Decision 5).
  });

  it("drops an orphan .mdat half (no single-file promotion)", () => {
    expect(detectPairsInDir(files("orphan.mdat"))).toEqual([]);
    expect(detectSinglesInDir(files("orphan.mdat"))).toEqual([]);
  });
});
