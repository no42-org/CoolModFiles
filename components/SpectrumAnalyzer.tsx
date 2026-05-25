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
const MAX_DPR = 2;

const STYLE_LABELS: Record<AnalyzerStyle, string> = {
  classic: "Switch to LED graphic equalizer",
  led: "Switch to gradient bars",
};

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

function writeAnalyzerStyle(value: AnalyzerStyle) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage may be disabled (private mode, blocked) — session-only change
  }
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
  // Start at DEFAULT_STYLE so SSR markup is deterministic; hydrate the
  // stored value in a useEffect to avoid a server/client mismatch.
  const [style, setStyle] = React.useState<AnalyzerStyle>(DEFAULT_STYLE);

  // setState-in-effect is intentional here: localStorage is unavailable
  // during SSR, so the stored style is hydrated after mount. Same pattern
  // as pages/index.tsx and components/modarchive/PersonMods.tsx — the
  // lint warning is accepted in this category.
  React.useEffect(() => {
    const stored = readAnalyzerStyle();
    if (stored !== DEFAULT_STYLE) setStyle(stored);
  }, []);

  // Sync the canvas backing store to its rendered size at DPR (capped to
  // avoid the browser's per-canvas pixel-area limit at high zoom). If
  // ResizeObserver is unavailable, fall back to a one-shot dimension
  // read on mount so the child renderers still see non-zero dims.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimensionsRef.current = { width: w, height: h };
    };
    if (typeof ResizeObserver === "undefined") {
      sync();
      return;
    }
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Clear the canvas when style changes so the outgoing renderer's last
  // frame doesn't linger for 1-2 frames before the incoming renderer's
  // first RAF tick.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = dimensionsRef.current;
    if (width === 0 || height === 0) return;
    ctx.clearRect(0, 0, width, height);
  }, [style]);

  const cycle = React.useCallback(() => {
    setStyle((prev) => nextStyle(prev));
  }, []);

  // setStyle returning the next value runs the updater in StrictMode
  // possibly twice; persistence happens in this effect (post-commit, once
  // per actual state change) so we never double-write to localStorage.
  React.useEffect(() => {
    writeAnalyzerStyle(style);
  }, [style]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cycle();
      }
    },
    [cycle],
  );

  // Touch double-fire guard: a tap on mobile may fire both a synthetic
  // click and a real click. Use a short suppression window after
  // pointerdown of touch type to swallow the duplicate.
  const lastTouchAtRef = React.useRef<number>(0);
  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "touch") {
        lastTouchAtRef.current = Date.now();
      }
    },
    [],
  );
  const onClick = React.useCallback(() => {
    // Within 500ms of a touch pointerdown we treat the click as the
    // already-handled synthetic; the touchend path on mobile will fire
    // click only once and this guard is a no-op there. The guard only
    // suppresses a *second* click within the window.
    if (Date.now() - lastTouchAtRef.current < 50) return;
    lastTouchAtRef.current = Date.now();
    cycle();
  }, [cycle]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="button"
        aria-label={STYLE_LABELS[style]}
        aria-live="off"
        tabIndex={0}
        title={STYLE_LABELS[style]}
        onClick={onClick}
        onPointerDown={onPointerDown}
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
