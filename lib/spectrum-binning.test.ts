/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { logGroupBins } from "./spectrum-binning";

describe("logGroupBins", () => {
  it("returns an array of length numBars", () => {
    const data = new Uint8Array(256);
    expect(logGroupBins(data, 20)).toHaveLength(20);
    expect(logGroupBins(data, 4)).toHaveLength(4);
  });

  it("lowest bar reads from the low end of the input range", () => {
    // numBins=8, numBars=4 → bar 0 covers bin 0 only (per the
    // monotonic log-binning math). Put a peak at bin 0 and zeros
    // elsewhere; bar 0 should hold the peak, the rest zero.
    const data = Uint8Array.from([200, 0, 0, 0, 0, 0, 0, 0]);
    const bars = logGroupBins(data, 4);
    expect(bars[0]).toBe(200);
    expect(bars[1]).toBe(0);
    expect(bars[2]).toBe(0);
    expect(bars[3]).toBe(0);
  });

  it("highest bar reads from the top of the input range", () => {
    // numBins=8, numBars=4 → bar 3 covers bins 4..7. Peak at bin 7.
    const data = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 200]);
    const bars = logGroupBins(data, 4);
    expect(bars[0]).toBe(0);
    expect(bars[1]).toBe(0);
    expect(bars[2]).toBe(0);
    expect(bars[3]).toBe(200);
  });

  it("uses max-aggregation across the slice, not mean", () => {
    // numBins=8, numBars=4 → bar 3 covers bins 4..7. Single spike at bin
    // 4 of 200, three zeros after. Mean would be 50; max should be 200.
    const data = Uint8Array.from([0, 0, 0, 0, 200, 0, 0, 0]);
    const bars = logGroupBins(data, 4);
    expect(bars[3]).toBe(200);
  });

  it("slice ranges advance monotonically so adjacent bars don't share bins", () => {
    // With 256 bins and 20 bars, no two adjacent bars should report the
    // same value if there is a unique non-zero value per bin.
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i; // monotonically increasing
    const bars = logGroupBins(data, 20);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]).toBeGreaterThan(bars[i - 1]);
    }
  });

  it("handles numBars > numBins without throwing", () => {
    // With more bars than bins, some trailing bars necessarily report 0
    // (their slice falls outside the data). No throw expected.
    const data = Uint8Array.from([10, 20, 30, 40]);
    const bars = logGroupBins(data, 10);
    expect(bars).toHaveLength(10);
    expect(bars.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("returns [] for numBars <= 0", () => {
    expect(logGroupBins(new Uint8Array(256), 0)).toEqual([]);
    expect(logGroupBins(new Uint8Array(256), -1)).toEqual([]);
  });
});
