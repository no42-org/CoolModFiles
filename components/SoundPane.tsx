import React from "react";
import Slider from "rc-slider";
import styles from "./SoundPane.module.scss";

type AmigaModel = "off" | "a500" | "a1200";

type SoundPaneProps = {
  amigaModel: AmigaModel;
  setAmigaModel: (m: AmigaModel) => void;
  trackType?: string;
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
  trackType,
  stereoSeparation,
  setStereoSeparation,
}: SoundPaneProps) {
  const isMod = (trackType || "").toLowerCase() === "mod";
  // Both controls are MOD-only ctl forwarders. Falsy trackType means
  // "no track loaded yet" — keep controls live so the user can
  // pre-configure their default before the first track lands.
  const inactive = !!trackType && !isMod;

  return (
    <div className={`${styles.wrapper} ${inactive ? styles.inactive : ""}`}>
      {inactive ? (
        <p className={styles.note} role="status">
          Sound settings only affect classic MOD files. These controls
          are disabled because the current track is type &quot;
          {trackType}&quot;.
        </p>
      ) : null}

      <h2 className={styles.sectionHeading}>Amiga emulation</h2>

      <div className={styles.options} role="radiogroup" aria-label="Amiga emulation">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`${styles.option} ${inactive ? styles.optionDisabled : ""}`}
          >
            <input
              type="radio"
              name="amigaModel"
              value={opt.value}
              checked={amigaModel === opt.value}
              onChange={() => setAmigaModel(opt.value)}
              disabled={inactive}
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
                if (inactive) return;
                if (typeof val !== "number") return;
                setStereoSeparation(val);
              }}
              disabled={inactive}
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
