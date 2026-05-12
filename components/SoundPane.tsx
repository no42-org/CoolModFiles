import React from "react";
import styles from "./SoundPane.module.scss";

type AmigaModel = "off" | "a500" | "a1200";

type SoundPaneProps = {
  amigaModel: AmigaModel;
  setAmigaModel: (m: AmigaModel) => void;
  trackType?: string;
};

const OPTIONS: { value: AmigaModel; label: string; sub: string }[] = [
  { value: "off", label: "Off", sub: "Modern clean resampler" },
  { value: "a500", label: "A500", sub: "Warm, ~4.9 kHz filter" },
  { value: "a1200", label: "A1200", sub: "Bright, ~28 kHz filter" },
];

function SoundPane({ amigaModel, setAmigaModel, trackType }: SoundPaneProps) {
  const isMod = (trackType || "").toLowerCase() === "mod";

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.sectionHeading}>Amiga emulation</h2>

      {!isMod && trackType ? (
        <p className={styles.note}>
          Amiga emulation only affects classic MOD files. Current track is
          type &quot;{trackType}&quot; — your choice will apply on the next
          MOD track.
        </p>
      ) : null}

      <div className={styles.options} role="radiogroup" aria-label="Amiga emulation">
        {OPTIONS.map((opt) => (
          <label key={opt.value} className={styles.option}>
            <input
              type="radio"
              name="amigaModel"
              value={opt.value}
              checked={amigaModel === opt.value}
              onChange={() => setAmigaModel(opt.value)}
            />
            <span className={styles.optionLabel}>
              <span className={styles.optionTitle}>{opt.label}</span>
              <span className={styles.optionSub}>{opt.sub}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Seed area for future audio controls (stereo separation,
          interpolation, etc.) — keeps the panel layout stable as more
          sections are added later. */}
      <div className={styles.futureSlot} aria-hidden="true" />
    </div>
  );
}

export default SoundPane;
