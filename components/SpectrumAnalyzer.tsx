/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import React from "react";
import styles from "./SpectrumAnalyzer.module.scss";

const NUM_BARS = 20;
const BAR_GAP_PX = 2;
const PEAK_DECAY_PX_PER_FRAME = 0.4;
const BG = "#000000";
const PEAK_COLOR = "#ffffff";

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

type SpectrumAnalyzerProps = {
  analyser: AnalyserNode | null;
};

export default function SpectrumAnalyzer({ analyser }: SpectrumAnalyzerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const peaksRef = React.useRef<number[]>(new Array(NUM_BARS).fill(0));
  const gradientRef = React.useRef<{
    height: number;
    gradient: CanvasGradient;
  } | null>(null);
  const dimensionsRef = React.useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimensionsRef.current = { width: w, height: h };
      gradientRef.current = null;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

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
  }, [analyser]);

  return (
    <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
  );
}
