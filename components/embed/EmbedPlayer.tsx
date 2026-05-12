import React from "react";
import Slider from "rc-slider";
import moment from "moment";

import { useInterval } from "../../hooks";
import styles from "./EmbedPlayer.module.scss";
import { DownloadButton, PauseButton, PlayButton } from "../../icons";
import { getRandomInt, RANDOM_MAX } from "../../utils";
import {
  modArchive,
  getBuffer,
  type Source,
  type ModArchiveSource,
} from "../sources";

type EmbedPlayerProps = {
  initialSource: Source | null;
  sharedTitle?: string;
};

function EmbedPlayer({ initialSource, sharedTitle }: EmbedPlayerProps) {
  const [isPlay, setIsPlay] = React.useState(false);
  const [start, setStart] = React.useState(false);
  const [player, setPlayer] = React.useState<ChiptuneJsPlayer | null>(null);
  const [playerReady, setPlayerReady] = React.useState(false);
  const [playingSource, setPlayingSource] = React.useState<Source>(
    () => initialSource || (modArchive(42) as ModArchiveSource)
  );
  const trackId =
    playingSource.type === "modarchive" ? playingSource.id : null;
  const [loading, setLoading] = React.useState(true);
  const [title, setTitle] = React.useState<string | undefined>(sharedTitle);
  const [progress, setProgress] = React.useState(0);
  const [max, setMax] = React.useState(100);

  const playingSourceRef = React.useRef<Source>(playingSource);
  const playFromSourceRef = React.useRef<(s: Source) => void>(() => {});

  useInterval(
    () => {
      if (!player) return;
      const dur = player.duration || 0;
      const cur = player.currentTime || 0;
      if (dur > 0) setProgress(cur);
    },
    isPlay ? 500 : null
  );
  React.useEffect(() => {
    setTitle(sharedTitle);
  }, [sharedTitle]);
  React.useEffect(() => {
    if (player && playerReady && initialSource) playFromSource(initialSource);
  }, [player, playerReady]);

  const initPlayer = () => {
    const ctx =
      (typeof window !== "undefined" &&
        window.__chiptunePrewarmedAudioContext) ||
      undefined;
    const p = new ChiptuneJsPlayer({ context: ctx, repeatCount: 0 });
    if (ctx) p.gain.connect(p.context.destination);
    p.onInitialized(() => setPlayerReady(true));
    p.onMetadata((meta) => {
      setTitle(meta.title);
      setMax(meta.dur || 0);
      document.title = meta.title
        ? `🎶 ${meta.title} - CoolModFiles`
        : "🎶 CoolModFiles";
    });
    p.onEnded(() => {
      setIsPlay(false);
      playFromSourceRef.current(initialSource || playingSourceRef.current);
    });
    p.onError(() => {
      setIsPlay(false);
      playFromSourceRef.current(modArchive(getRandomInt(0, RANDOM_MAX)));
    });
    setPlayer(p);
  };

  function playFromSource(source: Source) {
    if (!player) return;
    setTitle("Loading");
    setPlayingSource(source);
    getBuffer(source)
      .then((buffer) => {
        player.play(buffer);
        setIsPlay(true);
        player.seek(0);
      })
      .catch(() => {
        playFromSource(modArchive(getRandomInt(0, RANDOM_MAX)));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  React.useEffect(() => {
    playingSourceRef.current = playingSource;
  }, [playingSource]);
  React.useEffect(() => {
    playFromSourceRef.current = playFromSource;
  });

  const togglePlay = () => {
    if (!player) return;
    setIsPlay(!isPlay);
    player.togglePause();
  };

  return (
    <div className={styles.player}>
      <div className={styles.header}>
        <div className={styles.imgWrapper}>
          <img
            className={styles.banner}
            src={`/images/disc_${isPlay ? "anim" : "idle"}.gif`}
            alt="anim"
          />
          <div className={styles.titleWrap}>
            <h3>{title ? title : "[No Title]"}</h3>
            <ul className={styles.metadata}>
              <li>Track Id: #{trackId}</li>
            </ul>
          </div>
        </div>
        <DownloadButton
          className={styles.downloadButton}
          height="20"
          width="50"
          onClick={() => {
            window.location.href = `https://api.modarchive.org/downloads.php?moduleid=${trackId}`;
          }}
        />
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
            onClick={() => {
              if (!start) {
                initPlayer();
                setStart(true);
              } else {
                togglePlay();
              }
            }}
          />
        ) : (
          <PauseButton
            className={styles.actionbtn}
            height="50"
            width="50"
            onClick={!loading ? () => togglePlay() : undefined}
          />
        )}
      </div>
    </div>
  );
}
export default EmbedPlayer;
