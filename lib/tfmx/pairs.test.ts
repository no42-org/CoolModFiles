/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { parseHalfName } from "./pairs";

describe("parseHalfName — prefix-dns convention (Dynamic Synthesizer)", () => {
  it("maps dns.<base> to the music-data (tfx) half", () => {
    expect(parseHalfName("dns.ptc")).toEqual({ kind: "tfx", base: "ptc" });
  });

  it("maps smp.<base> to the sample (sam) half", () => {
    expect(parseHalfName("smp.ptc")).toEqual({ kind: "sam", base: "ptc" });
  });

  it("is case-insensitive on the prefix and preserves base case", () => {
    expect(parseHalfName("DNS.Starball")).toEqual({
      kind: "tfx",
      base: "Starball",
    });
  });

  it("preserves a space-bearing base (Modland naming)", () => {
    expect(parseHalfName("dns.starball title")).toEqual({
      kind: "tfx",
      base: "starball title",
    });
    expect(parseHalfName("smp.starball title")).toEqual({
      kind: "sam",
      base: "starball title",
    });
  });

  it("rejects a literal dns./smp. with no base (empty-base guard)", () => {
    expect(parseHalfName("dns.")).toBeNull();
    expect(parseHalfName("smp.")).toBeNull();
  });

  it("does not mis-match a smpl. half as a smp. half", () => {
    // `smpl.Turrican2` is the prefix-Amiga sample half (base "Turrican2"),
    // NOT a Dynamic Synthesizer `smp.` half of base "l.Turrican2".
    expect(parseHalfName("smpl.Turrican2")).toEqual({
      kind: "sam",
      base: "Turrican2",
    });
  });
});

describe("parseHalfName — existing conventions still parse", () => {
  it("covers the three pre-existing pair conventions", () => {
    expect(parseHalfName("Apidya.tfx")).toEqual({ kind: "tfx", base: "Apidya" });
    expect(parseHalfName("Apidya.sam")).toEqual({ kind: "sam", base: "Apidya" });
    expect(parseHalfName("song.mdat")).toEqual({ kind: "tfx", base: "song" });
    expect(parseHalfName("song.smpl")).toEqual({ kind: "sam", base: "song" });
    expect(parseHalfName("mdat.Turrican2")).toEqual({
      kind: "tfx",
      base: "Turrican2",
    });
    expect(parseHalfName("smpl.Turrican2")).toEqual({
      kind: "sam",
      base: "Turrican2",
    });
  });

  it("returns null for non-half names", () => {
    expect(parseHalfName("title.mod")).toBeNull();
    expect(parseHalfName("readme.txt")).toBeNull();
  });
});
