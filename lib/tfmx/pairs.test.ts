/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { parseHalfName, isDnsDataHalf } from "./pairs";

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

describe("isDnsDataHalf — worklet `dns` flag derivation", () => {
  it("is true for a dns.-prefixed data half (any base, incl. spaces)", () => {
    expect(isDnsDataHalf("dns.ptc")).toBe(true);
    expect(isDnsDataHalf("dns.starball title")).toBe(true);
  });

  it("is case-insensitive on the prefix", () => {
    expect(isDnsDataHalf("DNS.Starball")).toBe(true);
    expect(isDnsDataHalf("Dns.foo")).toBe(true);
  });

  it("requires the literal `dns.` prefix (dot included)", () => {
    // A name that merely starts with the letters `dns` but no dot is NOT a
    // DNS half — guards against false positives like `dnsomething.mod`.
    expect(isDnsDataHalf("dnsomething.mod")).toBe(false);
    expect(isDnsDataHalf("dns")).toBe(false);
  });

  it("is false for the sample half and other pair conventions", () => {
    // The flag is derived from the DATA half only; smp.* is the sample half.
    expect(isDnsDataHalf("smp.ptc")).toBe(false);
    expect(isDnsDataHalf("Apidya.tfx")).toBe(false);
    expect(isDnsDataHalf("mdat.Turrican2")).toBe(false);
    expect(isDnsDataHalf("song.mdat")).toBe(false);
  });

  it("is false for non-TFMX and empty names", () => {
    expect(isDnsDataHalf("title.mod")).toBe(false);
    expect(isDnsDataHalf("")).toBe(false);
  });
});
