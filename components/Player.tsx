import React from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import copy from "copy-to-clipboard";
import styles from "./Player.module.scss";
import PlayerBig from "./PlayerBig";
import PlayerMin from "./PlayerMin";
import BackSide from "./BackSide";
import LikedMods from "./LikedMods";

import { ToastContainer } from "react-toastify";
import { useInterval, useKeyPress } from "../hooks";
import { getRandomInt, showToast } from "../utils";
import { DownloadButton } from "../icons";
import {
  modArchive,
  library,
  local,
  getBuffer,
  getPermalink,
  sourceKey,
  isFavoritable,
  getEmbedHtml,
  type Source,
  type SourceHistoryBuckets,
} from "./sources";
import type { FavoriteTrack } from "./LikedMod";

const DEFAULT_VOLUME = 80;

type PickRandomNextCtx = {
  latestId: number;
  pickedFiles: File[];
};

async function pickRandomNext(
  source: Source,
  { latestId, pickedFiles }: PickRandomNextCtx
): Promise<Source | null> {
  switch (source.type) {
    case "modarchive":
      return modArchive(getRandomInt(0, latestId));
    case "local":
      if (!pickedFiles || pickedFiles.length === 0) return null;
      return local(pickedFiles[getRandomInt(0, pickedFiles.length - 1)]);
    case "library": {
      try {
        const r = await fetch("/api/library/random");
        if (!r.ok) return null;
        const data = (await r.json()) as { path?: string };
        return data.path ? library(data.path) : null;
      } catch {
        return null;
      }
    }
  }
}

type MetaData = {
  artist?: string;
  title?: string;
  date?: string;
  type?: string;
  message?: string;
};

type PlaySourceOptions = { resetHistory?: boolean };

export type PlayerHandle = {
  playSource: (source: Source, options?: PlaySourceOptions) => void;
};

type PlayerProps = {
  initialSource: Source | null;
  backSideContent?: string;
  latestId: number;
  pickedFiles?: File[];
};

const Player = React.forwardRef<PlayerHandle, PlayerProps>(function Player(
  { initialSource, backSideContent, latestId, pickedFiles = [] },
  ref
) {
  const [isPlay, setIsPlay] = React.useState(false);
  const [player, setPlayer] = React.useState<ChiptuneJsPlayer | null>(null);
  const [volume, setVolume] = React.useState<number>(() => {
    const rememberedVolume = parseInt(localStorage.getItem("volume") || "");
    if (rememberedVolume > -1) return rememberedVolume;
    return DEFAULT_VOLUME;
  });
  const [unmuteVolume, setUnmuteVolume] = React.useState(DEFAULT_VOLUME);
  const [maxId] = React.useState(latestId);
  const [playingSource, setPlayingSource] = React.useState<Source>(
    () => initialSource || modArchive(getRandomInt(0, latestId))
  );
  const trackId = playingSource.type === "modarchive" ? playingSource.id : null;
  const [metaData, setMetaData] = React.useState<MetaData>({});
  const [loading, setLoading] = React.useState(true);
  const [title, setTitle] = React.useState("Loading...");
  const [progress, setProgress] = React.useState(0);
  const [max, setMax] = React.useState(0);
  const [size, setSize] = React.useState<"big" | "small">("big");
  // Per-source play history. prev/next navigate within the bucket of
  // the currently playing source — pressing prev while a Library track
  // is playing walks Library history only, and switching to Random
  // resets the modarchive bucket without disturbing the others.
  const [history, setHistory] = React.useState<SourceHistoryBuckets>({
    modarchive: { items: [], current: -1 },
    library: { items: [], current: -1 },
    local: { items: [], current: -1 },
  });
  const playGenerationRef = React.useRef(0);
  const [repeat, setRepeat] = React.useState(false);
  const [helpDrawerOpen, setHelpDrawerOpen] = React.useState(false);
  const [likedModsDrawerOpen, setLikedModsDrawerOpen] = React.useState(false);
  const [backClass, setBackClass] = React.useState<string[]>([
    styles.playerBack,
  ]);
  const [likedModsClass, setLikedModsClass] = React.useState<string[]>([
    styles.playerBack,
  ]);

  const [favoriteModsRuntime, setFavoriteModsRuntime] = React.useState<
    FavoriteTrack[]
  >(() => {
    const json = localStorage.getItem("favoriteMods");
    if (!json) return [];
    let init = JSON.parse(json);
    if (
      init.length &&
      (typeof init[0] === "string" || init[0] instanceof String)
    ) {
      init = init.map((oldTrackId: string) => ({
        id: parseInt(oldTrackId.replace("#", "")),
      }));
    }
    return init;
  });
  const [counter, setCounter] = React.useState(0);

  const [spaceKey, enterKey] = [useKeyPress(" "), useKeyPress("Enter")];
  const shiftKey = useKeyPress("Shift");
  const [helpKey, quitKey] = [useKeyPress("/"), useKeyPress("q")];
  const repeatKey = useKeyPress("1");
  const downloadKey = useKeyPress("d");
  const embedKey = useKeyPress("e");
  const [upKey, nextKey, nextKeyVim] = [
    useKeyPress("ArrowUp"),
    useKeyPress("n"),
    useKeyPress("k"),
  ];
  const [downKey, backKey, backKeyVim] = [
    useKeyPress("ArrowDown"),
    useKeyPress("p"),
    useKeyPress("j"),
  ];
  const [rightKey, rightKeyVim] = [useKeyPress("ArrowRight"), useKeyPress("l")];
  const [leftKey, leftKeyVim] = [useKeyPress("ArrowLeft"), useKeyPress("h")];
  const volumeUpKey = useKeyPress("a");
  const volumeDownKey = useKeyPress("z");
  const volumeMuteKey = useKeyPress("x");

  React.useEffect(() => {
    if (spaceKey || enterKey) togglePlay();
    if (shiftKey) changeSize();
    if (helpKey || quitKey) toggleHelpDrawer();
    if (repeatKey && player) {
      showToast(`repeat ${!repeat ? "on" : "off"}`);
      player.setRepeatCount(!repeat ? -1 : 0);
      setRepeat(!repeat);
    }
    if (downloadKey) downloadTrack();
    if (embedKey) copyEmbed();
    if (upKey || nextKey || nextKeyVim) playNext();
    if (downKey || backKey || backKeyVim) playPrevious();
    if ((rightKey || rightKeyVim) && isPlay && player)
      player.seek(player.getPosition() + 5);
    if ((leftKey || leftKeyVim) && isPlay && player)
      player.seek(player.getPosition() - 5);
    if (volumeUpKey && player) {
      setVolume(Math.min(100, volume + 5));
      player.setVolume(Math.min(100, volume + 5));
    }
    if (volumeDownKey && player) {
      setVolume(Math.max(0, volume - 5));
      player.setVolume(Math.max(0, volume - 5));
    }
    if (volumeMuteKey) toggleMute();
  }, [
    spaceKey,
    enterKey,
    shiftKey,
    helpKey,
    quitKey,
    repeatKey,
    downloadKey,
    embedKey,
    upKey,
    nextKey,
    nextKeyVim,
    downKey,
    backKey,
    backKeyVim,
    rightKey,
    rightKeyVim,
    leftKey,
    leftKeyVim,
    volumeUpKey,
    volumeDownKey,
    volumeMuteKey,
  ]);

  useInterval(
    () => {
      if (!player) return;
      setProgress(player.getPosition() % player.duration());
      if (player.getPosition() === 0 && player.duration() === 0) {
        setIsPlay(false);
        if (repeat) {
          playFromSource(playingSource);
        } else {
          playNext();
        }
      }
    },
    isPlay ? 500 : null
  );

  React.useEffect(() => {
    const jsPlayer = new ChiptuneJsPlayer(
      new ChiptuneJsConfig(repeat ? -1 : 0, volume)
    );
    setPlayer(jsPlayer);
    console.log("%c " + jsPlayer.getLibraryVersion(), "color: red");
    console.log("%c " + jsPlayer.getCoreVersion(), "color: red");
  }, []);

  React.useEffect(() => {
    localStorage.setItem("volume", volume.toString());
  }, [volume]);

  React.useEffect(() => {
    if (player) {
      playFromSource(playingSource);
    }
  }, [player]);

  React.useEffect(() => {
    if (helpDrawerOpen) {
      setBackClass([backClass[0], styles.slideRight]);
      if (likedModsDrawerOpen) {
        setLikedModsDrawerOpen(false);
      }
    } else {
      setBackClass([backClass[0], styles.slideLeft]);
    }
  }, [helpDrawerOpen]);

  React.useEffect(() => {
    if (likedModsDrawerOpen) {
      setLikedModsClass([likedModsClass[0], styles.slideRight]);
      if (helpDrawerOpen) {
        setHelpDrawerOpen(false);
      }
    } else {
      setLikedModsClass([likedModsClass[0], styles.slideLeft]);
    }
  }, [likedModsDrawerOpen]);

  const togglePlay = () => {
    if (!player) return;
    setIsPlay(!isPlay);
    player.togglePause();
  };

  const copyEmbed = () => {
    const html = getEmbedHtml(playingSource, title, process.env.DOMAIN);
    if (!html) {
      showToast("can't embed local files");
      return;
    }
    copy(html);
    showToast("copied to clipboard!");
  };

  const playNext = async () => {
    const bucket = history[playingSource.type] || { items: [], current: -1 };
    if (bucket.current < bucket.items.length - 1) {
      const cid = bucket.current + 1;
      playFromSource(bucket.items[cid]);
      setHistory((h) => ({
        ...h,
        [playingSource.type]: { ...h[playingSource.type], current: cid },
      }));
    } else {
      const next = await pickRandomNext(playingSource, {
        latestId: maxId,
        pickedFiles,
      });
      if (next) playFromSource(next);
    }
  };

  const playPrevious = () => {
    const bucket = history[playingSource.type] || { items: [], current: -1 };
    if (bucket.current > 0) {
      const cid = bucket.current - 1;
      playFromSource(bucket.items[cid]);
      setHistory((h) => ({
        ...h,
        [playingSource.type]: { ...h[playingSource.type], current: cid },
      }));
    }
  };

  const playFromSource = (source: Source, options: PlaySourceOptions = {}) => {
    if (!player) return;
    const { resetHistory = false } = options;
    // Generation counter — protects against stale .then handlers from
    // earlier playFromSource calls overwriting fresh state when the
    // user switches tracks/sources before the previous fetch resolves.
    const myGeneration = ++playGenerationRef.current;
    setLoading(true);
    setIsPlay(false);
    setTitle("Loading...");
    player.pause();
    setPlayingSource(source);
    if (resetHistory) {
      // Synchronous so the catalog tab switch lands on a fresh bucket
      // for THIS source's type. Other-source histories are preserved.
      // The .then below skips its own bookkeeping in this branch.
      setHistory((h) => ({
        ...h,
        [source.type]: { items: [source], current: 0 },
      }));
    }
    getBuffer(source, player)
      .then((buffer) => {
        if (myGeneration !== playGenerationRef.current) return;
        setLoading(false);
        player.play(buffer);
        setMetaData(player.metadata());
        setTitle(player.metadata().title || "");
        setMax(player.duration());
        setIsPlay(true);
        player.seek(0);
        const permalink = getPermalink(source);
        if (permalink) {
          window.history.pushState({ source }, "", permalink);
        }
        if (!resetHistory) {
          // Functional update reads latest bucket; if source is already
          // in the bucket (replay or back-walk), this is a no-op.
          setHistory((h) => {
            const bucket = h[source.type] || { items: [], current: -1 };
            const key = sourceKey(source);
            if (bucket.items.some((s) => sourceKey(s) === key)) return h;
            return {
              ...h,
              [source.type]: {
                items: [...bucket.items, source],
                current: bucket.items.length,
              },
            };
          });
        }
        document.title = `🎶 ${player.metadata().title} - CoolModFiles.com 🎶`;
      })
      .catch(() => {
        if (myGeneration !== playGenerationRef.current) return;
        playFromSource(modArchive(getRandomInt(0, maxId)));
      });
  };

  React.useImperativeHandle(ref, () => ({
    playSource: (source, options) => playFromSource(source, options),
  }));

  const toggleMute = () => {
    if (!player) return;
    if (volume > 0) {
      setUnmuteVolume(volume);
      setVolume(0);
      player.setVolume(0);
    } else {
      setVolume(unmuteVolume);
      player.setVolume(unmuteVolume);
    }
  };

  const toggleHelpDrawer = () => {
    setHelpDrawerOpen(!helpDrawerOpen);
  };
  const toggleLikedModsDrawer = () => {
    setLikedModsDrawerOpen(!likedModsDrawerOpen);
  };

  const downloadTrack = async () => {
    try {
      const res = await fetch(
        `https://api.modarchive.org/downloads.php?moduleid=${trackId}`
      );
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${metaData.title}.mod`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.log(error);
    }
  };

  const changeSize = () => {
    setSize(size === "big" ? "small" : "big");
  };

  const updateFavoriteModsRuntime = (newFavoriteModsArray: FavoriteTrack[]) => {
    setFavoriteModsRuntime(newFavoriteModsArray);
    localStorage.setItem("favoriteMods", JSON.stringify(newFavoriteModsArray));
    if (counter >= 10 && counter < 15) {
      showToast("WE'RE HIRING WEB DEVELOPERS");
    } else if (counter == 15) {
      showToast("CONTACT US");
    } else if (counter < 10 || counter > 15) {
      showToast("added to favorites!");
    }
    setCounter(counter + 1);
  };

  const removeFavoriteModRuntime = (modToRemoveFromRuntimeList: number) => {
    const newFavoriteModsArray = favoriteModsRuntime.filter(
      (mod) => mod.id !== modToRemoveFromRuntimeList
    );
    setFavoriteModsRuntime(newFavoriteModsArray);
    localStorage.setItem("favoriteMods", JSON.stringify(newFavoriteModsArray));
  };

  const downloadFavoriteMods = async () => {
    if (favoriteModsRuntime.length === 0) return;
    showToast("Preparing...");
    const zip = new JSZip();
    const mods = zip.folder("mods");
    if (!mods) return;
    for (const mod of favoriteModsRuntime) {
      const res = await fetch(
        `https://api.modarchive.org/downloads.php?moduleid=${mod.id}`
      );
      const blob = await res.blob();
      await mods.file(`${mod.title || mod.id}.mod`, blob, { binary: true });
    }
    const zipContent = await zip.generateAsync({ type: "blob" });
    const url = window.URL.createObjectURL(zipContent);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "FavoriteMods.zip");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadFavoriteModsJson = () => {
    const jsonContent = favoriteModsRuntime.map((mod) => ({
      ...mod,
      downloadUrl: `https://api.modarchive.org/downloads.php?moduleid=${mod.id}`,
    }));
    const blob = new Blob([JSON.stringify(jsonContent, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    saveAs(blob, "coolmods.json");
  };

  return (
    <div>
      <ToastContainer />
      {playingSource.type !== "modarchive" && (
        <div
          style={{
            textAlign: "center",
            fontSize: "0.65rem",
            fontFamily: '"Press Start 2P", cursive',
            color: "white",
            opacity: 0.8,
            margin: "8px 0",
          }}
        >
          Playing from: {playingSource.type}
        </div>
      )}
      {size === "big" ? (
        <div className={styles.playerWrapper}>
          <div className={styles.player}>
            <PlayerBig
              title={title}
              loading={loading}
              metaData={metaData}
              trackId={trackId}
              canFavorite={isFavoritable(playingSource)}
              progress={progress}
              max={max}
              player={player}
              volume={volume}
              setVolume={setVolume}
              toggleMute={toggleMute}
              isPlay={isPlay}
              togglePlay={togglePlay}
              setProgress={setProgress}
              changeSize={changeSize}
              playPrevious={playPrevious}
              playNext={playNext}
              currentId={
                (history[playingSource.type] || { current: -1 }).current
              }
              toggleLikedModsDrawer={toggleLikedModsDrawer}
              toggleHelpDrawer={toggleHelpDrawer}
              downloadTrack={downloadTrack}
              repeat={repeat}
              setRepeat={setRepeat}
              copyEmbed={copyEmbed}
              updateFavoriteModsRuntime={updateFavoriteModsRuntime}
              favoriteModsRuntime={favoriteModsRuntime}
            />
          </div>
          <div id="backside" className={backClass.join(" ")}>
            <h2>Help</h2>
            <hr className={styles.fancyHr} />
            <div className={styles.backSideContent}>
              <BackSide content={backSideContent} />
            </div>
          </div>
          <div id="liked-mods" className={likedModsClass.join(" ")}>
            <header className={styles.favoriteHeader}>
              <h2 onClick={downloadFavoriteModsJson}>
                <a href="#">Favorite Mods</a>
              </h2>
              <div className={styles.downloadAll}>
                <DownloadButton
                  onClick={downloadFavoriteMods}
                  height="25"
                  width="25"
                />
              </div>
            </header>
            <hr className={styles.fancyHr} />
            <div className={styles.likedModsContent}>
              <LikedMods
                content={favoriteModsRuntime}
                onPlay={(track) => playFromSource(modArchive(track.id))}
                removeFavoriteModRuntime={removeFavoriteModRuntime}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.player}>
          <PlayerMin
            title={title}
            loading={loading}
            trackId={trackId}
            progress={progress}
            max={max}
            isPlay={isPlay}
            player={player}
            togglePlay={togglePlay}
            setProgress={setProgress}
            changeSize={changeSize}
            downloadTrack={downloadTrack}
          />
        </div>
      )}
    </div>
  );
});

export default Player;
