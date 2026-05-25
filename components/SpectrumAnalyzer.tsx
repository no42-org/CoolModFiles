/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import React from "react";
import styles from "./SpectrumAnalyzer.module.scss";
import SpectrumStyleClassic from "./SpectrumStyleClassic";
import SpectrumStyleLed from "./SpectrumStyleLed";
import type { SpectrumDimensions } from "../lib/spectrum-binning";

export const STYLES = ["classic", "led"] as const;
export type AnalyzerStyle = (typeof STYLES)[number];
export const DEFAULT_STYLE: AnalyzerStyle = "classic";
const STORAGE_KEY = "display.analyzerStyle";

export function nextStyle(current: AnalyzerStyle): AnalyzerStyle {
  const idx = STYLES.indexOf(current);
  return STYLES[(idx + 1) % STYLES.length];
}

export function readAnalyzerStyle(): AnalyzerStyle {
  if (typeof window === "undefined") return DEFAULT_STYLE;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_STYLE;
  }
  return STYLES.includes(raw as AnalyzerStyle)
    ? (raw as AnalyzerStyle)
    : DEFAULT_STYLE;
}

type SpectrumAnalyzerProps = {
  analyser: AnalyserNode | null;
};

export default function SpectrumAnalyzer({ analyser }: SpectrumAnalyzerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const dimensionsRef = React.useRef<SpectrumDimensions>({
    width: 0,
    height: 0,
  });
  const [style, setStyle] = React.useState<AnalyzerStyle>(readAnalyzerStyle);

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
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const cycle = React.useCallback(() => {
    setStyle((prev) => {
      const next = nextStyle(prev);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage may be disabled (private mode, blocked) — session-only change
      }
      return next;
    });
  }, []);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (e.key === "Enter") {
        cycle();
      } else if (e.key === " ") {
        e.preventDefault();
        cycle();
      }
    },
    [cycle],
  );

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="button"
        aria-label="Switch spectrum analyzer style"
        tabIndex={0}
        title="Click to switch analyzer style"
        onClick={cycle}
        onKeyDown={onKeyDown}
      />
      {style === "classic" ? (
        <SpectrumStyleClassic
          analyser={analyser}
          canvasRef={canvasRef}
          dimensionsRef={dimensionsRef}
        />
      ) : (
        <SpectrumStyleLed
          analyser={analyser}
          canvasRef={canvasRef}
          dimensionsRef={dimensionsRef}
        />
      )}
    </>
  );
}
