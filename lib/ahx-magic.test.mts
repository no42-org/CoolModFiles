/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { looksLikeAhx } from "./ahx-magic.js";

// Build an ArrayBuffer whose first `bytes.length` bytes are the given
// values and the rest is zero. Saves a lot of repetition in the cases
// below.
function buf(bytes: number[], totalSize?: number): ArrayBuffer {
  const size = totalSize ?? bytes.length;
  const ab = new ArrayBuffer(size);
  new Uint8Array(ab).set(bytes);
  return ab;
}

// ASCII byte codes for the magic prefixes.
const A = 0x41; // 'A'
const H = 0x48; // 'H'
const X = 0x58; // 'X'
const T = 0x54; // 'T'

describe("looksLikeAhx", () => {
  describe("accepts canonical AHX magic", () => {
    it("AHX v1 (AHX\\0)", () => {
      expect(looksLikeAhx(buf([A, H, X, 0x00], 64))).toBe(true);
    });

    it("AHX v2 (AHX\\1)", () => {
      expect(looksLikeAhx(buf([A, H, X, 0x01], 64))).toBe(true);
    });
  });

  describe("accepts legacy THX magic (the modarchive corpus is mostly THX)", () => {
    it("THX v1 (THX\\0)", () => {
      // Mirrors the spike-pinned reference id 163460 (1,000 B, THX v1).
      expect(looksLikeAhx(buf([T, H, X, 0x00], 64))).toBe(true);
    });

    it("THX v2 (THX\\1)", () => {
      // Mirrors the spike-pinned reference id 163890 (2,811 B, THX v2).
      expect(looksLikeAhx(buf([T, H, X, 0x01], 64))).toBe(true);
    });
  });

  describe("rejects mismatched version bytes (D4 false-positive gate)", () => {
    it("AHX prefix with version 0x02", () => {
      expect(looksLikeAhx(buf([A, H, X, 0x02], 64))).toBe(false);
    });

    it("AHX prefix with version 0xFF", () => {
      expect(looksLikeAhx(buf([A, H, X, 0xff], 64))).toBe(false);
    });

    it("THX prefix with version 0x10", () => {
      expect(looksLikeAhx(buf([T, H, X, 0x10], 64))).toBe(false);
    });

    it("THX prefix with a printable-but-disallowed byte", () => {
      // 0x20 = ' ' (space). A MOD/S3M/STM titled "THX " would land here
      // and MUST fall through to libopenmpt rather than be misrouted
      // to AHX.
      expect(looksLikeAhx(buf([T, H, X, 0x20], 64))).toBe(false);
    });
  });

  describe("rejects unrelated prefixes", () => {
    it("libopenmpt IT magic (IMPM)", () => {
      expect(looksLikeAhx(buf([0x49, 0x4d, 0x50, 0x4d], 64))).toBe(false);
    });

    it("XM header (\"Exte\" — the start of \"Extended Module: \")", () => {
      expect(looksLikeAhx(buf([0x45, 0x78, 0x74, 0x65], 64))).toBe(false);
    });

    it("MED magic (MMD0)", () => {
      expect(looksLikeAhx(buf([0x4d, 0x4d, 0x44, 0x30], 64))).toBe(false);
    });

    it("HTML interstitial (\"<!DO\") — the WAF/error-page false-positive scenario", () => {
      expect(looksLikeAhx(buf([0x3c, 0x21, 0x44, 0x4f], 64))).toBe(false);
    });

    it("two correct bytes but wrong third (AH but not AHX)", () => {
      expect(looksLikeAhx(buf([A, H, 0x59, 0x00], 64))).toBe(false);
    });

    it("two correct bytes but wrong third (TH but not THX)", () => {
      expect(looksLikeAhx(buf([T, H, 0x59, 0x00], 64))).toBe(false);
    });
  });

  describe("rejects undersized buffers", () => {
    it("empty buffer", () => {
      expect(looksLikeAhx(new ArrayBuffer(0))).toBe(false);
    });

    it("3 bytes (the magic prefix without the version byte)", () => {
      expect(looksLikeAhx(buf([A, H, X]))).toBe(false);
    });

    it("exactly 4 bytes matching AHX v1 (boundary)", () => {
      // Exactly the magic + version byte, nothing else. Real AHX files
      // are always larger but the gate should pass — engine load is the
      // second gate, not this function.
      expect(looksLikeAhx(buf([A, H, X, 0x00]))).toBe(true);
    });
  });

  describe("rejects non-ArrayBuffer inputs", () => {
    it("plain object (TfmxPair-shaped)", () => {
      const tfmxPair = {
        tfx: new ArrayBuffer(64),
        sam: new ArrayBuffer(64),
        base: "song",
      };
      expect(looksLikeAhx(tfmxPair)).toBe(false);
    });

    it("Uint8Array (not ArrayBuffer)", () => {
      // Uint8Array is a typed-array VIEW, not an ArrayBuffer itself.
      // The instanceof check correctly rejects it.
      const u8 = new Uint8Array([A, H, X, 0x00]);
      expect(looksLikeAhx(u8)).toBe(false);
    });

    it("null", () => {
      expect(looksLikeAhx(null)).toBe(false);
    });

    it("undefined", () => {
      expect(looksLikeAhx(undefined)).toBe(false);
    });

    it("string", () => {
      expect(looksLikeAhx("AHX\0")).toBe(false);
    });

    it("number", () => {
      expect(looksLikeAhx(42)).toBe(false);
    });
  });
});
