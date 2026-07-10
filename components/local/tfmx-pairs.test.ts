/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { detectTfmxPairs } from "./tfmx-pairs";

// detectTfmxPairs only reads `.name` off each File, so a minimal stub
// avoids depending on a DOM File implementation in the test environment.
const f = (name: string): File => ({ name }) as unknown as File;

describe("detectTfmxPairs — single-file handling", () => {
  it("emits single-file formats as `singles`, not remainingFiles or unpaired", () => {
    const r = detectTfmxPairs([f("Enigma.fc"), f("wings.hipc")]);
    expect(r.singles.map((s) => s.base)).toEqual(["Enigma", "wings"]);
    expect(r.singles[0].ext).toBe(".fc");
    expect(r.singles[0].type).toBe("tfmx-single-local");
    expect(r.remainingFiles).toEqual([]);
    expect(r.unpaired).toEqual([]);
  });

  it("claims single files BEFORE the module pipeline (never dropped)", () => {
    // A .fc must not fall through to remainingFiles, where isModuleFile —
    // which excludes single-file TFMX by design — would discard it.
    const r = detectTfmxPairs([f("tune.fc")]);
    expect(r.remainingFiles.some((x) => x.name === "tune.fc")).toBe(false);
    expect(r.singles).toHaveLength(1);
  });

  it("still detects Huelsbeck pairs alongside singles", () => {
    const r = detectTfmxPairs([f("Apidya.tfx"), f("Apidya.sam"), f("x.smod")]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].base).toBe("Apidya");
    expect(r.singles).toHaveLength(1);
    expect(r.singles[0].ext).toBe(".smod");
  });

  it("leaves an orphan .mdat as unpaired (not promoted to a single)", () => {
    const r = detectTfmxPairs([f("orphan.mdat")]);
    expect(r.singles).toEqual([]);
    expect(r.unpaired).toEqual(["orphan.mdat"]);
  });

  it("passes non-TFMX modules through to remainingFiles", () => {
    const r = detectTfmxPairs([f("song.mod")]);
    expect(r.remainingFiles.map((x) => x.name)).toEqual(["song.mod"]);
    expect(r.singles).toEqual([]);
  });

  it("treats a prefix-Amiga pair ending in a single-file token as a pair, not singles", () => {
    // `mdat.fc` + `smpl.fc` (base "fc") must be detected as ONE pair, not
    // split into two bogus FC singles — pair detection takes precedence.
    const r = detectTfmxPairs([f("mdat.fc"), f("smpl.fc")]);
    expect(r.singles).toEqual([]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].base).toBe("fc");
  });

  it("pairs a dns./smp. Dynamic Synthesizer drop as one pair", () => {
    // Space-bearing Modland base; the music-data (dns) half drives display.
    const r = detectTfmxPairs([f("dns.starball title"), f("smp.starball title")]);
    expect(r.singles).toEqual([]);
    expect(r.unpaired).toEqual([]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].base).toBe("starball title");
  });
});
