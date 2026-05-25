/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import React from "react";
import { logGroupBins, type SpectrumDimensions } from "../lib/spectrum-binning";

// Visual identity: replica of the Technics SH-8055 Stereo Graphic
// Equalizer / 12-channel real-time spectrum analyzer screen.

const NUM_BANDS = 12;
const HZ_LABELS = [
  "25", "40", "63", "100", "160", "250",
  "500", "1k", "2k", "4k", "8k", "16k",
];
// Compile-time-ish guard: HZ_LABELS length must match NUM_BANDS. Module-scope
// throw on mismatch fails fast in dev — typos in either array surface
// immediately instead of rendering `undefined` glyphs on the canvas.
if (HZ_LABELS.length !== NUM_BANDS) {
  throw new Error(
    `SpectrumStyleLed: HZ_LABELS.length (${HZ_LABELS.length}) must equal NUM_BANDS (${NUM_BANDS})`,
  );
}

const DB_LABELS_DESKTOP = [30, 25, 20, 15, 10, 5];
const DB_LABELS_MOBILE = [30, 5];
const DB_MAX = 30;

const BG = "#000000";
const TILE_FILL = "#00b8ff";
const CHROME_TEXT = "#00b8ff";
const GRID_LINE = "rgba(143, 196, 224, 0.10)";

const TILE_HEIGHT_PX = 3;
const TILE_GAP_PX = 2;
const BAND_GAP_PX = 4;
const PEAK_DECAY_TILES_PER_FRAME = 0.08;
const TILE_GLOW_BLUR_PX = 14;
// Tighter blur for legend glyphs only — small radius concentrates alpha
// per pixel, so the halo reads brighter even though it doesn't bloom as
// wide as the tile glow.
const LEGEND_GLOW_BLUR_PX = 6;
// Multi-pass glow: each pass re-emits the same shape-shaped shadow at the
// same radius. Two passes ≈ doubled halo brightness without expanding the
// glow's radius — more intense, not just larger.
const GLOW_PASSES = 2;

const CHROME_TOP_DESKTOP_PX = 38;
const CHROME_BOTTOM_PX = 14;
const CHROME_SIDE_PX = 28;
const HZ_PREFIX_PX = 22;
const TOP_HZ_OFFSET_PX = 14; // Hz/dB-caption baseline this far above bar area top
const MOBILE_BREAKPOINT_PX = 600;

const FONT_LEGEND_PRIMARY =
  "italic bold 12px ui-sans-serif, system-ui, sans-serif";
const FONT_LEGEND_SECONDARY = "italic 11px ui-sans-serif, system-ui, sans-serif";
const FONT_HZ = "italic 9px ui-sans-serif, system-ui, sans-serif";
const FONT_DB = "9px ui-sans-serif, system-ui, sans-serif";

type Props = {
  analyser: AnalyserNode | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dimensionsRef: React.MutableRefObject<SpectrumDimensions>;
};

export default function SpectrumStyleLed({
  analyser,
  canvasRef,
  dimensionsRef,
}: Props) {
  const peaksRef = React.useRef<number[]>(new Array(NUM_BANDS).fill(0));
  const isMobileRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    isMobileRef.current = mql.matches;
    const onChange = (e: MediaQueryListEvent) => {
      isMobileRef.current = e.matches;
    };
    // Safari < 14 lacks addEventListener on MediaQueryList; fall back to
    // the deprecated addListener which is still defined on those engines.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  React.useEffect(() => {
    if (!analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let buf = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      const { width: w, height: h } = dimensionsRef.current;
      if (w === 0 || h === 0) return;

      const isMobile = isMobileRef.current;

      // Recreate the buffer if the analyser's bin count drifts (fftSize
      // was reconfigured elsewhere). Otherwise getByteFrequencyData would
      // overwrite only a prefix and leave stale tail data.
      if (buf.length !== analyser.frequencyBinCount) {
        buf = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(buf);
      const bars = logGroupBins(buf, NUM_BANDS);
      const peaks = peaksRef.current;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      const chromeTop = isMobile ? 0 : CHROME_TOP_DESKTOP_PX;
      const barAreaTop = chromeTop;
      const barAreaBottom = h - CHROME_BOTTOM_PX;
      const barAreaLeft = CHROME_SIDE_PX;
      const barAreaRight = w - CHROME_SIDE_PX;
      const barAreaH = barAreaBottom - barAreaTop;
      const barAreaW = barAreaRight - barAreaLeft;

      if (barAreaW <= 0 || barAreaH <= 0) return;

      const tileSlot = TILE_HEIGHT_PX + TILE_GAP_PX;
      const tileRows = Math.max(
        1,
        Math.floor((barAreaH + TILE_GAP_PX) / tileSlot),
      );

      const dbLabels = isMobile ? DB_LABELS_MOBILE : DB_LABELS_DESKTOP;

      const bandSlot = (barAreaW - BAND_GAP_PX * (NUM_BANDS - 1)) / NUM_BANDS;
      const bandWidth = Math.max(1, bandSlot);

      // Faint horizontal grid at each dB tick
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const db of dbLabels) {
        const t = 1 - db / DB_MAX;
        const y = Math.round(barAreaTop + t * barAreaH) + 0.5;
        ctx.moveTo(barAreaLeft, y);
        ctx.lineTo(barAreaRight, y);
      }
      ctx.stroke();

      // Compute per-band lit-rows and update peak state ONCE per frame
      // (before the multi-pass glow loop) so the peak decay rate doesn't
      // scale with GLOW_PASSES.
      const litRowsByBand = new Array<number>(NUM_BANDS);
      for (let i = 0; i < NUM_BANDS; i++) {
        const amp = (bars[i] ?? 0) / 255;
        const litRows = Math.round(amp * tileRows);
        litRowsByBand[i] = litRows;
        if (litRows >= peaks[i]) {
          peaks[i] = litRows;
        } else {
          peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY_TILES_PER_FRAME);
        }
      }

      // Chrome text + tiles share the same cyan glow. Set shadow here,
      // before any text fills, and reset to 0 after the tile loop. Grid
      // lines above were stroked with shadowBlur=0 so they stay faint.
      // The whole block runs GLOW_PASSES times — successive passes stack
      // the shape-shaped shadow alpha, intensifying without widening.
      ctx.shadowColor = CHROME_TEXT;
      ctx.shadowBlur = TILE_GLOW_BLUR_PX;

      const drawGlowingChromeAndTiles = () => {
        ctx.fillStyle = CHROME_TEXT;

        if (!isMobile) {
          // Top legend: mixed weight — "12 channel" italic bold,
          // "real time spectrum analyzer" italic regular. Draws with the
          // tighter LEGEND_GLOW_BLUR_PX for a brighter, more concentrated
          // halo; restored to TILE_GLOW_BLUR_PX afterwards for the rest
          // of the chrome.
          ctx.shadowBlur = LEGEND_GLOW_BLUR_PX;
          ctx.textBaseline = "alphabetic";
          ctx.textAlign = "left";
          ctx.font = FONT_LEGEND_PRIMARY;
          ctx.fillText("12 channel", barAreaLeft, 13);
          ctx.textAlign = "right";
          ctx.font = FONT_LEGEND_SECONDARY;
          ctx.fillText("real time spectrum analyzer", barAreaRight, 13);
          ctx.shadowBlur = TILE_GLOW_BLUR_PX;

          // Top Hz row (no "(Hz)" prefix — the bottom row carries it; here
          // the left margin belongs to the "dB" caption).
          ctx.font = FONT_HZ;
          ctx.textAlign = "center";
          for (let i = 0; i < NUM_BANDS; i++) {
            const x =
              barAreaLeft + i * (bandWidth + BAND_GAP_PX) + bandWidth / 2;
            ctx.fillText(HZ_LABELS[i], x, chromeTop - TOP_HZ_OFFSET_PX);
          }

          // "dB" caption — sits in the top-left margin, inline with the
          // top Hz row, right-aligned to the dB column.
          ctx.font = FONT_DB;
          ctx.textAlign = "right";
          ctx.fillText("dB", barAreaLeft - 4, chromeTop - TOP_HZ_OFFSET_PX);
        }

        // dB labels on both sides, aligned to grid tick y
        ctx.font = FONT_DB;
        ctx.textBaseline = "middle";
        for (const db of dbLabels) {
          const t = 1 - db / DB_MAX;
          const y = barAreaTop + t * barAreaH;
          ctx.textAlign = "right";
          ctx.fillText(String(db), barAreaLeft - 4, y);
          ctx.textAlign = "left";
          ctx.fillText(String(db), barAreaRight + 4, y);
        }

        // Bottom Hz row
        ctx.font = FONT_HZ;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.fillText("(Hz)", barAreaLeft - HZ_PREFIX_PX, h - 3);
        ctx.textAlign = "center";
        for (let i = 0; i < NUM_BANDS; i++) {
          const x =
            barAreaLeft + i * (bandWidth + BAND_GAP_PX) + bandWidth / 2;
          ctx.fillText(HZ_LABELS[i], x, h - 3);
        }

        // Tiles — lit only; no off-state. Glow still active.
        ctx.fillStyle = TILE_FILL;
        for (let i = 0; i < NUM_BANDS; i++) {
          const litRows = litRowsByBand[i];
          const xLeft = barAreaLeft + i * (bandWidth + BAND_GAP_PX);

          for (let r = 0; r < litRows; r++) {
            const y = barAreaBottom - (r + 1) * tileSlot + TILE_GAP_PX;
            ctx.fillRect(xLeft, y, bandWidth, TILE_HEIGHT_PX);
          }

          if (peaks[i] > litRows + 0.5) {
            const peakRow = Math.floor(peaks[i]);
            if (peakRow >= 0 && peakRow < tileRows) {
              const y = barAreaBottom - (peakRow + 1) * tileSlot + TILE_GAP_PX;
              ctx.fillRect(xLeft, y, bandWidth, TILE_HEIGHT_PX);
            }
          }
        }
      };

      // try/finally ensures shadowBlur is always reset, even if a draw
      // call throws — otherwise the leak would glow next frame's grid.
      try {
        for (let pass = 0; pass < GLOW_PASSES; pass++) {
          drawGlowingChromeAndTiles();
        }
      } finally {
        ctx.shadowBlur = 0;
      }
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [analyser, canvasRef, dimensionsRef]);

  return null;
}
