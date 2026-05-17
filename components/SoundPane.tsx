import React from "react";
import Slider from "rc-slider";
import styles from "./SoundPane.module.scss";

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
   * Used for per-control gating per design.md D9 (in
   * openspec/changes/add-ahx-playback/):
   *   - Amiga emulation toggle: enabled only for libopenmpt.
   *   - Stereo-separation slider: enabled for libopenmpt AND ahx
   *     (ahx2play accepts stereo separation at the same 0..100 scale);
   *     disabled only for tfmx (libtfmx uses a different scale).
   * Undefined means "no track loaded yet" — keep controls live so the
   * user can pre-configure their default before the first track lands.
   */
  activeEngine?: EngineKind;
  stereoSeparation: number;
  setStereoSeparation: (v: number) => void;
};

const OPTIONS: { value: AmigaModel; label: string; sub: string }[] = [
  { value: "off", label: "Off", sub: "Modern clean resampler" },
  { value: "a500", label: "A500", sub: "Warm, ~4.9 kHz filter" },
  { value: "a1200", label: "A1200", sub: "Bright, ~28 kHz filter" },
];

function SoundPane({
  amigaModel,
  setAmigaModel,
  activeEngine,
  stereoSeparation,
  setStereoSeparation,
}: SoundPaneProps) {
  // Per-control disabled predicates per D9. activeEngine === undefined
  // means "no track yet" — both controls stay live so users can
  // pre-configure their defaults.
  const amigaDisabled = activeEngine !== undefined && activeEngine !== "libopenmpt";
  const stereoDisabled = activeEngine === "tfmx";
  // The "Sound settings only affect MOD" note only makes sense when
  // BOTH controls are disabled — i.e. TFMX is active. For AHX the
  // stereo slider is live, so showing the all-disabled banner would
  // be misleading.
  const allDisabled = amigaDisabled && stereoDisabled;

  return (
    <div className={`${styles.wrapper} ${allDisabled ? styles.inactive : ""}`}>
      {allDisabled ? (
        <p className={styles.note} role="status">
          Sound settings only affect classic MOD files. These controls
          are disabled because the current engine is TFMX.
        </p>
      ) : null}

      <h2 className={styles.sectionHeading}>Amiga emulation</h2>

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
                // Defence in depth: rc-slider's `disabled` prop blocks
                // pointer drags but a handle that was already focused
                // before disable kicked in (e.g. mid-track-switch) can
                // still emit onChange via keyboard arrows.
                if (stereoDisabled) return;
                if (typeof val !== "number") return;
                setStereoSeparation(val);
              }}
              disabled={stereoDisabled}
              ariaLabelForHandle="Stereo separation"
              ariaValueTextFormatterForHandle={(val) => `${val} percent`}
            />
            <span className={styles.stereoCaption}>mono</span>
          </div>
          <span className={styles.stereoPercent}>{stereoSeparation}%</span>
        </div>
      </section>

      {/* Future Sound-panel sections (interpolation filter length,
          channel-mute view, ...) drop in below as sibling <section>s. */}
    </div>
  );
}

export default SoundPane;
