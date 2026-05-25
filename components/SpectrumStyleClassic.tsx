/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import React from "react";
import { logGroupBins, type SpectrumDimensions } from "../lib/spectrum-binning";

const NUM_BARS = 20;
const BAR_GAP_PX = 2;
const PEAK_DECAY_PX_PER_FRAME = 0.4;
const BG = "#000000";
const PEAK_COLOR = "#ffffff";

type Props = {
  analyser: AnalyserNode | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dimensionsRef: React.MutableRefObject<SpectrumDimensions>;
};

export default function SpectrumStyleClassic({
  analyser,
  canvasRef,
  dimensionsRef,
}: Props) {
  const peaksRef = React.useRef<number[]>(new Array(NUM_BARS).fill(0));
  const gradientRef = React.useRef<{
    height: number;
    gradient: CanvasGradient;
  } | null>(null);

  React.useEffect(() => {
    if (!analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;
    const draw = () => {
      rafId = requestAnimationFrame(draw);
      const { width: w, height: h } = dimensionsRef.current;
      if (w === 0 || h === 0) return;

      analyser.getByteFrequencyData(buf);
      const bars = logGroupBins(buf, NUM_BARS);
      const peaks = peaksRef.current;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      if (!gradientRef.current || gradientRef.current.height !== h) {
        const g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0.0, "#ddd");
        g.addColorStop(0.55, "#00b8ff");
        g.addColorStop(1.0, "#bd00ff");
        gradientRef.current = { height: h, gradient: g };
      }

      const totalGap = BAR_GAP_PX * (NUM_BARS - 1);
      const barWidth = Math.max(1, (w - totalGap) / NUM_BARS);

      ctx.fillStyle = gradientRef.current.gradient;
      for (let i = 0; i < NUM_BARS; i++) {
        const amp = bars[i] / 255;
        const barH = amp * h;
        const x = i * (barWidth + BAR_GAP_PX);
        if (barH > 0) ctx.fillRect(x, h - barH, barWidth, barH);

        if (barH >= peaks[i]) {
          peaks[i] = barH;
        } else {
          peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY_PX_PER_FRAME);
        }
      }

      ctx.fillStyle = PEAK_COLOR;
      for (let i = 0; i < NUM_BARS; i++) {
        if (peaks[i] > 0) {
          const x = i * (barWidth + BAR_GAP_PX);
          const y = h - peaks[i];
          ctx.fillRect(x, y, barWidth, 1);
        }
      }
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [analyser, canvasRef, dimensionsRef]);

  return null;
}
