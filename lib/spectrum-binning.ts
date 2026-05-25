/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type SpectrumDimensions = { width: number; height: number };

/**
 * Group `data` (linear-frequency byte FFT bins) into `numBars`
 * log-spaced buckets using max-aggregation per slice. The slice ranges
 * advance monotonically (each bar's `start` = the previous bar's `end`)
 * so adjacent bars never share bins.
 */
export function logGroupBins(data: Uint8Array, numBars: number): number[] {
  const numBins = data.length;
  if (numBars <= 0) return [];
  const bars = new Array<number>(numBars).fill(0);
  let prevEnd = 0;
  for (let i = 0; i < numBars; i++) {
    const start = prevEnd;
    let end = Math.floor(Math.pow(numBins, (i + 1) / numBars));
    if (end <= start) end = start + 1;
    if (end > numBins) end = numBins;
    let max = 0;
    for (let j = start; j < end; j++) {
      if (data[j] > max) max = data[j];
    }
    bars[i] = max;
    prevEnd = end;
  }
  return bars;
}
