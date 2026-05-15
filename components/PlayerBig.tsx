import React from "react";
import Slider from "rc-slider";
import moment from "moment";

import styles from "./PlayerBig.module.scss";
import {
  ArrowIcon,
  DownloadButton,
  LeftButton,
  RightButton,
  PauseButton,
  PlayButton,
  ShareIcon,
  CodeIcon,
  RepeatIcon,
  LikeButton,
  PlayListButton,
  VolumeIcon,
} from "../icons";
import LoadingState from "./LoadingState";
import { showToast } from "../utils";
import type { FavoriteTrack } from "./LikedMod";
import type { AudioPlayer } from "../lib/audio-player";
import type { MetaData } from "./Player";

const dropDownOpen = [styles.dropdownContent, styles.dropdownOpen].join(" ");
const dropDownClose = styles.dropdownContent;

type PlayerBigProps = {
  title: string;
  loading: boolean;
  metaData: MetaData;
  trackId: number | null;
  canFavorite: boolean;
  progress: number;
  max: number;
  player: AudioPlayer | null;
  volume: number;
  setVolume: (v: number) => void;
  isPlay: boolean;
  togglePlay: () => void;
  setProgress: (n: number) => void;
  changeSize: () => void;
  playPrevious: () => void;
  playNext: () => void | Promise<void>;
  currentId: number;
  onToggleDrawer: () => void;
  downloadTrack: () => void | Promise<void>;
  repeat: boolean;
  setRepeat: (v: boolean) => void;
  copyEmbed: () => void;
  favoriteModsRuntime: FavoriteTrack[];
  updateFavoriteModsRuntime: (next: FavoriteTrack[]) => void;
  selectedSubsong: number;
  onSubsongChange: (idx: number) => void;
};

function PlayerBig({
  title,
  loading,
  metaData,
  trackId,
  canFavorite,
  progress,
  max,
  player,
  volume,
  setVolume,
  isPlay,
  togglePlay,
  setProgress,
  changeSize,
  playPrevious,
  playNext,
  currentId,
  onToggleDrawer,
  downloadTrack,
  repeat,
  setRepeat,
  copyEmbed,
  favoriteModsRuntime,
  updateFavoriteModsRuntime,
  selectedSubsong,
  onSubsongChange,
}: PlayerBigProps) {
  const [dropDownClass, setDropDownClass] = React.useState(dropDownClose);
  const [volumePopoverOpen, setVolumePopoverOpen] = React.useState(false);
  const volumePopoverRef = React.useRef<HTMLDivElement | null>(null);
  const volumeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    document
      .getElementById("repeat")
      ?.classList.toggle(styles.deactive, !repeat);
  }, [repeat]);

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

  const likeCurrentTrack = (
    runtime: FavoriteTrack[],
    update: (next: FavoriteTrack[]) => void
  ) => {
    if (trackId === null) return;
    const trackIdInt = trackId;
    const filtered = runtime.length
      ? runtime.filter((track) => track.id !== trackIdInt)
      : [];
    const newFavoriteModsRuntime: FavoriteTrack[] = [
      ...filtered,
      {
        id: trackIdInt,
        ...(metaData.artist && { artist: metaData.artist }),
        ...(metaData.title && { title: metaData.title }),
      },
    ];
    update(newFavoriteModsRuntime);
  };

  return (
    <React.Fragment>
      <div className={styles.container}>
        <div className={styles.contentPlayer}>
          <div className={styles.wheader}>
            <div className={styles.downloadWrap}>
              <DownloadButton
                height="30"
                width="60"
                onClick={() => downloadTrack()}
              />
              {canFavorite && (
                <LikeButton
                  className={styles.likeButton}
                  height="30"
                  width="60"
                  onClick={() =>
                    likeCurrentTrack(
                      favoriteModsRuntime,
                      updateFavoriteModsRuntime
                    )
                  }
                />
              )}
            </div>
            <img
              className={styles.banner}
              src={`/images/disc_${isPlay ? "anim" : "idle"}.gif`}
              alt="anim"
            />
            <div className={styles.shareWrap}>
              <ShareIcon
                height="30"
                width="60"
                onClick={() => {
                  setDropDownClass(
                    dropDownClass === dropDownClose
                      ? dropDownOpen
                      : dropDownClose
                  );
                }}
              />
              <div className={dropDownClass}>
                <CodeIcon height="30" width="30" onClick={() => copyEmbed()} />
              </div>
            </div>
          </div>
          <h2 className={styles.title}>{title ? title : "[No Title]"}</h2>
          {!loading ? (
            <ul className={styles.metadata}>
              {metaData.artist ? <li>Artist: {metaData.artist}</li> : null}
              {metaData.date ? <li>Date: {metaData.date}</li> : null}
              <li>Type: {metaData.type}</li>
              <li>
                <a
                  href={`https://modarchive.org/index.php?request=view_by_moduleid&query=${trackId}`}
                  target="_blank"
                  className={styles.modlink}
                >
                  Track Id: #{trackId}
                </a>
              </li>
              {metaData.message ? (
                <li>Message: {metaData.message.replace(/\n{2,}/g, "\n")}</li>
              ) : null}
            </ul>
          ) : (
            <LoadingState />
          )}
          {!loading &&
          (metaData.numSubsongs ?? 0) > 1 &&
          metaData.songs &&
          metaData.songs.length > 0 ? (
            <div className={styles.subsongRow} aria-live="polite">
              <label htmlFor="subsongPicker" className={styles.subsongLabel}>
                Subsong:
              </label>
              <select
                id="subsongPicker"
                className={styles.subsongPicker}
                value={selectedSubsong}
                onChange={(e) => onSubsongChange(Number(e.target.value))}
              >
                {metaData.songs.map((name, idx) => (
                  <option key={idx} value={idx} title={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
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
          <div className={styles.actionButtonsWrapper}>
            <LeftButton
              height="70"
              width="70"
              onClick={!loading ? () => playPrevious() : undefined}
              disable={currentId === 0 || loading ? "true" : "false"}
            />
            {!isPlay ? (
              <PlayButton
                className={styles.actionbtn}
                height="130"
                width="130"
                onClick={!loading ? () => togglePlay() : undefined}
              />
            ) : (
              <PauseButton
                className={styles.actionbtn}
                height="130"
                width="130"
                onClick={() => togglePlay()}
              />
            )}
            <RightButton
              height="70"
              width="70"
              onClick={!loading ? () => playNext() : undefined}
              disable={loading ? "true" : "false"}
            />
          </div>
          <div className={styles.footer}>
            <div className={styles.footerLeft}>
              <button
                ref={volumeButtonRef}
                type="button"
                className={styles.volumeButton}
                aria-label="Volume"
                aria-haspopup="dialog"
                aria-expanded={volumePopoverOpen}
                aria-controls="volume-popover"
                onClick={() => setVolumePopoverOpen((v) => !v)}
              >
                <VolumeIcon height="30" width="30" volume={volume} />
              </button>
              {volumePopoverOpen && (
                <div
                  ref={volumePopoverRef}
                  id="volume-popover"
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
            <div className={styles.footerCenter}>
              <ArrowIcon
                className={styles.arrow}
                height="20"
                width="50"
                onClick={() => changeSize()}
              />
            </div>

            <div className={styles.footerRight}>
              <PlayListButton
                id="playlistButton"
                className={styles.playlistButton}
                height="30"
                width="30"
                onClick={() => onToggleDrawer()}
              />
              <RepeatIcon
                id="repeat"
                className={styles.repeat}
                height="30"
                width="30"
                onClick={() => {
                  if (!player) return;
                  showToast(`repeat ${!repeat ? "on" : "off"}`);
                  player.setRepeatCount(!repeat ? -1 : 0);
                  setRepeat(!repeat);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

export default PlayerBig;
