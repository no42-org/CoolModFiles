/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { detectPairsInDir, detectSinglesInDir } from "./pairs";
import { parseHalfName } from "../tfmx/pairs";

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

  it("excludes prefix-Amiga pair halves that end in a single-file token", () => {
    // `mdat.fc` + `smpl.fc` is a Huelsbeck pair (base "fc"), NOT two FC
    // singles. Pair detection takes precedence, so detectSinglesInDir must
    // emit nothing here — otherwise the same files would be double-listed
    // (once as the pair, once as phantom singles).
    expect(detectSinglesInDir(files("mdat.fc", "smpl.fc"))).toEqual([]);
    expect(detectPairsInDir(files("mdat.fc", "smpl.fc"))).toEqual([
      { base: "fc", tfx: "mdat.fc", sam: "smpl.fc" },
    ]);
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

describe("detectPairsInDir — prefix-dns (Dynamic Synthesizer)", () => {
  it("pairs a dns./smp. Dynamic Synthesizer pair with a space-bearing base", () => {
    const pairs = detectPairsInDir(
      files("dns.starball title", "smp.starball title")
    );
    expect(pairs).toEqual([
      { base: "starball title", tfx: "dns.starball title", sam: "smp.starball title" },
    ]);
  });

  it("drops an orphan dns. half (allowlist/orphan-rejection intent)", () => {
    // Mirrors pages/api/library/file.ts: isTfmxHalf(dns.foo) is true but
    // hasTfmxPartner is false, so the byte-server 404s it — same as any
    // other orphan half. detectSinglesInDir must not promote it either.
    expect(detectPairsInDir(files("dns.ptc"))).toEqual([]);
    expect(detectSinglesInDir(files("dns.ptc"))).toEqual([]);
  });

  it("does not treat a smpl. half as a smp. Dynamic Synthesizer half", () => {
    // A lone smpl.Turrican2 is an orphan prefix-Amiga sample half, not a
    // dns/smp pair — confirms the smp. check does not shadow smpl.
    expect(detectPairsInDir(files("smpl.Turrican2"))).toEqual([]);
    expect(
      detectPairsInDir(files("mdat.Turrican2", "smpl.Turrican2"))
    ).toEqual([{ base: "Turrican2", tfx: "mdat.Turrican2", sam: "smpl.Turrican2" }]);
  });
});

// Mirrors the two gates the byte-server (pages/api/library/file.ts) applies
// to a requested path, without mounting the Next handler (the repo tests the
// underlying predicates, not HTTP handlers — cf. random.test.ts):
//   gate 1 — allowlist:  isTfmxHalf = parseHalfName(basename) !== null   (:90)
//   gate 2 — orphan:     hasTfmxPartner via detectPairsInDir(dir)        (:53,:104)
// A dns./smp. half is served (200) only when BOTH gates pass; otherwise 404.
describe("byte-server contract for dns./smp. (allowlist + orphan gates)", () => {
  const served = (target: string, ...dir: string[]): boolean => {
    // gate 1: extension allowlist
    if (parseHalfName(target) === null) return false;
    // gate 2: partner must exist in the same directory
    const pairs = detectPairsInDir(files(...dir));
    return pairs.some((p) => p.tfx === target || p.sam === target);
  };

  it("serves a dns. half when its smp. partner exists (200)", () => {
    expect(served("dns.ptc", "dns.ptc", "smp.ptc")).toBe(true);
    expect(served("smp.ptc", "dns.ptc", "smp.ptc")).toBe(true);
  });

  it("404s an orphan dns. half (allowlisted but unpaired)", () => {
    // parseHalfName("dns.orphan") !== null (passes gate 1) but no smp.orphan
    // partner exists → gate 2 fails → the byte-server returns 404.
    expect(parseHalfName("dns.orphan")).not.toBeNull();
    expect(served("dns.orphan", "dns.orphan")).toBe(false);
  });

  it("404s a non-allowlisted path regardless of neighbours", () => {
    expect(served("secret.txt", "secret.txt", "smp.ptc")).toBe(false);
  });
});
