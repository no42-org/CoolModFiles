import React from "react";
import Slider from "rc-slider";
import moment from "moment";

import styles from "./PlayerMin.module.scss";
import {
  ArrowIcon,
  DownloadButton,
  PauseButton,
  PlayButton,
  VolumeIcon,
} from "../icons";
import type { AudioPlayer, EngineKind } from "../lib/audio-player";
import type { MetaData } from "./Player";
import { formatSubsongName } from "./subsong-format";

type PlayerMinProps = {
  title: string;
  loading: boolean;
  metaData: MetaData;
  trackId: number | null;
  progress: number;
  max: number;
  isPlay: boolean;
  player: AudioPlayer | null;
  volume: number;
  setVolume: (v: number) => void;
  togglePlay: () => void;
  setProgress: (n: number) => void;
  changeSize: () => void;
  downloadTrack: () => void | Promise<void>;
  selectedSubsong: number;
  onSubsongChange: (idx: number) => void;
  /**
   * Currently-active audio engine. Used to render the "recording" badge
   * next to the title when the engine is `pcm`.
   */
  activeEngine?: EngineKind;
};

function PlayerMin({
  title,
  loading,
  metaData,
  trackId,
  progress,
  max,
  isPlay,
  player,
  volume,
  setVolume,
  togglePlay,
  setProgress,
  changeSize,
  downloadTrack,
  selectedSubsong,
  onSubsongChange,
  activeEngine,
}: PlayerMinProps) {
  const isPcm = activeEngine === "pcm";
  const [volumePopoverOpen, setVolumePopoverOpen] = React.useState(false);
  const volumePopoverRef = React.useRef<HTMLDivElement | null>(null);
  const volumeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!volumePopoverOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (volumePopoverRef.current?.contains(target)) return;
      if (volumeButtonRef.current?.contains(target)) return;
      setVolumePopoverOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVolumePopoverOpen(false);
        volumeButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [volumePopoverOpen]);

  React.useEffect(() => {
    if (volumePopoverOpen) {
      volumePopoverRef.current?.focus();
    }
  }, [volumePopoverOpen]);

  return (
    <React.Fragment>
      <div className={styles.header}>
        <img
          className={styles.banner}
          src={`/images/disc_${isPlay ? "anim" : "idle"}.gif`}
          alt="anim"
        />
        <div className={styles.titleWrap}>
          <h3>
            {title ? title : "[No Title]"}
            {isPcm ? (
              <span className={styles.recordingBadge}>recording</span>
            ) : null}
          </h3>
          <ul className={styles.metadata}>
            <li>Track Id: #{trackId}</li>
          </ul>
          {!loading &&
          !isPcm &&
          (metaData.numSubsongs ?? 0) > 1 &&
          metaData.songs &&
          metaData.songs.length > 0 ? (
            <div className={styles.subsongRow}>
              <label
                htmlFor="subsongPickerMin"
                className={styles.subsongLabel}
              >
                Tune:
              </label>
              <select
                id="subsongPickerMin"
                className={styles.subsongPicker}
                value={selectedSubsong}
                onChange={(e) => {
                  onSubsongChange(Number(e.target.value));
                  // Return focus to body so global hotkeys (space, n, p, …)
                  // resume working immediately after a pick.
                  e.currentTarget.blur();
                }}
              >
                {(() => {
                  const total = metaData.songs.length;
                  return metaData.songs.map((name, idx) => {
                    const display = formatSubsongName(name, idx, total);
                    return (
                      <option key={idx} value={idx} title={display}>
                        {display}
                      </option>
                    );
                  });
                })()}
              </select>
            </div>
          ) : null}
        </div>
        <div className={styles.headerRight}>
          <DownloadButton
            className={styles.downloadButton}
            height="20"
            width="50"
            onClick={() => downloadTrack()}
          />
          <button
            ref={volumeButtonRef}
            type="button"
            className={styles.volumeButton}
            aria-label="Volume"
            aria-haspopup="dialog"
            aria-expanded={volumePopoverOpen}
            aria-controls="volume-popover-min"
            onClick={() => setVolumePopoverOpen((v) => !v)}
          >
            <VolumeIcon height="20" width="20" volume={volume} />
          </button>
          {volumePopoverOpen && (
            <div
              ref={volumePopoverRef}
              id="volume-popover-min"
              role="dialog"
              aria-label="Volume control"
              tabIndex={-1}
              className={styles.volumePopover}
            >
              <Slider
                railStyle={{ backgroundColor: "white", height: 6 }}
                trackStyle={{ backgroundColor: "#bd00ff", height: 6 }}
                handleStyle={{
                  borderColor: "#bd00ff",
                  backgroundColor: "#bd00ff",
                }}
                className={styles.volumePopoverSlider}
                value={volume}
                min={0}
                max={100}
                step={1}
                onChange={(val) => {
                  if (typeof val !== "number" || !player) return;
                  setVolume(val);
                  player.setVol(val / 100);
                }}
              />
              <span className={styles.volumePopoverPercent}>{volume}%</span>
            </div>
          )}
        </div>
      </div>
      <div className={styles.seekbarWrapper}>
        <div style={{ flex: 1 }}>
          <Slider
            railStyle={{ backgroundColor: "white", height: 6 }}
            trackStyle={{ backgroundColor: "#bd00ff", height: 6 }}
            handleStyle={{
              borderColor: "#bd00ff",
              backgroundColor: "#bd00ff",
            }}
            className={styles.seekbar}
            value={progress}
            max={max}
            onChange={(val) => {
              if (typeof val !== "number" || !player) return;
              setProgress(val);
              player.seek(val);
            }}
          />
          <div className={styles.seekNumbers}>
            <span>
              {moment().startOf("day").seconds(progress).format("mm:ss")}
            </span>
            <span>{moment().startOf("day").seconds(max).format("mm:ss")}</span>
          </div>
        </div>
        {!isPlay ? (
          <PlayButton
            className={styles.actionbtn}
            height="50"
            width="50"
            onClick={!loading ? () => togglePlay() : undefined}
          />
        ) : (
          <PauseButton
            className={styles.actionbtn}
            height="50"
            width="50"
            onClick={() => togglePlay()}
          />
        )}
      </div>
      <ArrowIcon
        className={styles.arrow}
        height="20"
        width="50"
        onClick={() => changeSize()}
      />
    </React.Fragment>
  );
}

export default PlayerMin;
