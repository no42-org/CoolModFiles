/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import React from "react";
import Slider from "rc-slider";
import styles from "./SoundPane.module.scss";
import { type FilenameStyle } from "../lib/filename/amiga-style";

type AmigaModel = "off" | "a500" | "a1200";

// Mirror of EngineKind in lib/audio-player.ts. Duplicated here as a
// type-only union (not an import) to keep SoundPane decoupled from the
// audio-player module.
type EngineKind = "libopenmpt" | "tfmx" | "ahx";

type SoundPaneProps = {
  amigaModel: AmigaModel;
  setAmigaModel: (m: AmigaModel) => void;
  /**
   * Currently-active audio engine, read from AudioPlayer.activeEngine.
   * Used as a fallback for per-control gating when `trackType` hasn't
   * propagated yet — engine swaps in synchronously after `play()`, but
   * libopenmpt's metadata callback (the source of trackType) arrives a
   * tick later. Engine gating catches AHX/TFMX during that tick.
   *
   * `undefined` means "no track loaded yet" — controls stay live so the
   * user can pre-configure their defaults.
   */
  activeEngine?: EngineKind;
  /**
   * libopenmpt-reported track type (lower-cased, trimmed). The Amiga
   * emulation control is gated to `type === "mod"` only — Paula
   * emulation makes no sense for the PC-tracker formats libopenmpt
   * plays (XM/IT/S3M/etc.).
   *
   * `undefined` is treated the same as the engine fallback above:
   * keep controls live until we know.
   */
  trackType?: string;
  stereoSeparation: number;
  setStereoSeparation: (v: number) => void;
  filenameStyle: FilenameStyle;
  setFilenameStyle: (s: FilenameStyle) => void;
};

const FILENAME_STYLE_OPTIONS: {
  value: FilenameStyle;
  label: string;
  sub: string;
}[] = [
  { value: "auto", label: "Auto", sub: "Render filenames as on disk" },
  { value: "amiga", label: "Amiga", sub: "Prefix form for Amiga-native formats" },
  {
    value: "amiga-all",
    label: "Amiga everywhere",
    sub: "Prefix form for all module formats",
  },
];

const OPTIONS: { value: AmigaModel; label: string; sub: string }[] = [
  { value: "off", label: "Off", sub: "Modern clean resampler" },
  { value: "a500", label: "A500", sub: "Warm, ~4.9 kHz filter" },
  { value: "a1200", label: "A1200", sub: "Bright, ~28 kHz filter" },
];

/**
 * The Amiga emulation control is disabled when EITHER:
 *   - the engine is known and isn't libopenmpt (catches AHX/TFMX even
 *     if the previous track's type is still in flight), OR
 *   - the type is known and isn't "mod" (catches libopenmpt non-MOD
 *     formats like XM/IT/S3M that engine alone would miss).
 *
 * Both undefined → no track yet → keep controls live.
 */
export function computeAmigaDisabled(
  engine: EngineKind | undefined,
  type: string | undefined,
): boolean {
  const engineGate = engine !== undefined && engine !== "libopenmpt";
  const typeGate = type !== undefined && type.toLowerCase() !== "mod";
  return engineGate || typeGate;
}

export type AmigaHint = { copy: React.ReactNode } | null;

/**
 * Hint shown above the Amiga emulation radio group when the control is
 * disabled. Three variants in priority order:
 *   1. AHX engine    — engine-specific copy.
 *   2. TFMX engine   — engine-specific copy.
 *   3. libopenmpt non-MOD — format-specific copy, echoes the actual type.
 * No hint for libopenmpt + MOD (or "no track yet").
 */
export function computeAmigaHint(
  engine: EngineKind | undefined,
  type: string | undefined,
): AmigaHint {
  if (engine === "ahx") {
    return {
      copy: (
        <>
          Amiga emulation has no effect for AHX tracks — they render
          through ahx2play&apos;s built-in Paula model.
        </>
      ),
    };
  }
  if (engine === "tfmx") {
    return {
      copy: (
        <>
          Amiga emulation has no effect for TFMX tracks — they render
          through libtfmx&apos;s own playback engine.
        </>
      ),
    };
  }
  if (
    engine === "libopenmpt" &&
    type !== undefined &&
    type.toLowerCase() !== "mod"
  ) {
    return {
      copy: (
        <>
          Amiga emulation only applies to classic MOD files. The current
          track type is <code>{type.toLowerCase()}</code>.
        </>
      ),
    };
  }
  return null;
}

function SoundPane({
  amigaModel,
  setAmigaModel,
  activeEngine,
  trackType,
  stereoSeparation,
  setStereoSeparation,
  filenameStyle,
  setFilenameStyle,
}: SoundPaneProps) {
  const amigaDisabled = computeAmigaDisabled(activeEngine, trackType);
  const amigaHint = computeAmigaHint(activeEngine, trackType);

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.sectionHeading}>Amiga emulation</h2>
      {amigaHint ? (
        <p className={styles.note} role="status">
          {amigaHint.copy}
        </p>
      ) : null}

      <div className={styles.options} role="radiogroup" aria-label="Amiga emulation">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`${styles.option} ${amigaDisabled ? styles.optionDisabled : ""}`}
          >
            <input
              type="radio"
              name="amigaModel"
              value={opt.value}
              checked={amigaModel === opt.value}
              onChange={() => setAmigaModel(opt.value)}
              disabled={amigaDisabled}
            />
            <span className={styles.optionLabel}>
              <span className={styles.optionTitle}>{opt.label}</span>
              <span className={styles.optionSub}>{opt.sub}</span>
            </span>
          </label>
        ))}
      </div>

      <section className={styles.stereoSection}>
        <h2 className={styles.sectionHeading}>Stereo separation</h2>
        <div className={styles.stereoRow}>
          <div className={styles.stereoSliderWrap}>
            <Slider
              railStyle={{ backgroundColor: "white", height: 6 }}
              trackStyle={{ backgroundColor: "#bd00ff", height: 6 }}
              handleStyle={{
                borderColor: "#bd00ff",
                backgroundColor: "#bd00ff",
              }}
              min={0}
              max={100}
              step={1}
              value={stereoSeparation}
              onChange={(val) => {
                if (typeof val !== "number") return;
                setStereoSeparation(val);
              }}
              ariaLabelForHandle="Stereo separation"
              ariaValueTextFormatterForHandle={(val) => `${val} percent`}
            />
            <span className={styles.stereoCaption}>mono</span>
          </div>
          <span className={styles.stereoPercent}>{stereoSeparation}%</span>
        </div>
      </section>

      <section
        className={`${styles.stereoSection} ${styles.filenameStyleSection}`}
      >
        <h2 className={styles.sectionHeading}>Filename style</h2>
        <div
          className={styles.options}
          role="radiogroup"
          aria-label="Filename style"
        >
          {FILENAME_STYLE_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.option}>
              <input
                type="radio"
                name="filenameStyle"
                value={opt.value}
                checked={filenameStyle === opt.value}
                onChange={() => setFilenameStyle(opt.value)}
              />
              <span className={styles.optionLabel}>
                <span className={styles.optionTitle}>{opt.label}</span>
                <span className={styles.optionSub}>{opt.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Future Sound-panel sections (interpolation filter length,
          channel-mute view, ...) drop in below as sibling <section>s. */}
    </div>
  );
}

export default SoundPane;
