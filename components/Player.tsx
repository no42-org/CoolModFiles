import React from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import copy from "copy-to-clipboard";
import styles from "./Player.module.scss";
import PlayerBig from "./PlayerBig";
import PlayerMin from "./PlayerMin";
import SourceDrawer, { type DrawerTabId } from "./SourceDrawer";
import { type ChartId } from "./modarchive/ModArchivePane";

import { ToastContainer } from "react-toastify";
import { useInterval, useKeyPress } from "../hooks";
import { getRandomInt, showToast } from "../utils";
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
import type { ModItem } from "../lib/modarchive/types";

const DEFAULT_VOLUME = 80;

type AmigaModel = "off" | "a500" | "a1200";
const AMIGA_MODELS: AmigaModel[] = ["off", "a500", "a1200"];
const DEFAULT_AMIGA_MODEL: AmigaModel = "a1200";

function readAmigaModel(): AmigaModel {
  const raw = localStorage.getItem("audio.amigaModel");
  return AMIGA_MODELS.includes(raw as AmigaModel)
    ? (raw as AmigaModel)
    : DEFAULT_AMIGA_MODEL;
}

function applyAmigaSetting(player: ChiptuneJsPlayer, model: AmigaModel) {
  if (model === "off") {
    player.setCtl("render.resampler.emulate_amiga", "0");
    return;
  }
  player.setCtl("render.resampler.emulate_amiga", "1");
  player.setCtl("render.resampler.emulate_amiga_type", model);
}

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

type PlaySourceOptions = { resetHistory?: boolean; confirmToast?: boolean };

type PlayerProps = {
  initialSource: Source | null;
  backSideContent?: string;
  latestId: number;
};

function Player({ initialSource, backSideContent, latestId }: PlayerProps) {
  const [isPlay, setIsPlay] = React.useState(false);
  const [player, setPlayer] = React.useState<ChiptuneJsPlayer | null>(null);
  const [volume, setVolume] = React.useState<number>(() => {
    const rememberedVolume = parseInt(localStorage.getItem("volume") || "");
    if (rememberedVolume > -1) return rememberedVolume;
    return DEFAULT_VOLUME;
  });
  const [unmuteVolume, setUnmuteVolume] = React.useState(DEFAULT_VOLUME);
  const [amigaModel, setAmigaModel] =
    React.useState<AmigaModel>(readAmigaModel);
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

  // chiptune3 is async: the AudioWorklet is loaded after construction,
  // so the first play() must wait for an onInitialized callback. Refs
  // give the onEnded handler (registered once at init) access to the
  // latest playNext/playFromSource closures and repeat/source state.
  const [playerReady, setPlayerReady] = React.useState(false);
  const repeatRef = React.useRef(repeat);
  const playingSourceRef = React.useRef<Source>(playingSource);
  const amigaModelRef = React.useRef<AmigaModel>(amigaModel);
  const playNextRef = React.useRef<() => void>(() => {});
  const playFromSourceRef = React.useRef<
    (s: Source, o?: PlaySourceOptions) => void
  >(() => {});

  // Source-drawer state — replaces the two mutually-exclusive
  // helpDrawerOpen/likedModsDrawerOpen flags from the previous design.
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerTab, setDrawerTab] = React.useState<DrawerTabId>("modarchive");

  // Chart-aware playback context. `currentChart` describes which Mod
  // Archive list the playing track came from; "random" is the default
  // (free-form random play). `chartListRef` holds the ordered list so
  // `n` can walk it sequentially with loop-at-end. Both are reset to
  // random whenever the user explicitly clicks "Play random" or arrives
  // via a permalink.
  const [currentChart, setCurrentChart] = React.useState<ChartId>("random");
  const chartListRef = React.useRef<ModItem[] | null>(null);

  // Catalog state lifted from pages/index.tsx so the drawer (which
  // hosts the catalogs) can live inside this component's render tree.
  const [pickedFiles, setPickedFiles] = React.useState<File[]>([]);
  const [libraryPath, setLibraryPath] = React.useState("");
  const [libraryAvailable, setLibraryAvailable] = React.useState(false);

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
  const amigaKey = useKeyPress("m");

  React.useEffect(() => {
    if (spaceKey || enterKey) togglePlay();
    if (shiftKey) changeSize();
    if (helpKey || quitKey) openDrawerToTab("help");
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
      player.seek((player.currentTime || 0) + 5);
    if ((leftKey || leftKeyVim) && isPlay && player)
      player.seek((player.currentTime || 0) - 5);
    if (volumeUpKey && player) {
      const next = Math.min(100, volume + 5);
      setVolume(next);
      player.setVol(next / 100);
    }
    if (volumeDownKey && player) {
      const next = Math.max(0, volume - 5);
      setVolume(next);
      player.setVol(next / 100);
    }
    if (volumeMuteKey) toggleMute();
    if (amigaKey) {
      // Cycle a1200 -> a500 -> off -> a1200. Toast confirms each press.
      const order: AmigaModel[] = ["a1200", "a500", "off"];
      const idx = order.indexOf(amigaModel);
      const next = order[(idx + 1) % order.length];
      setAmigaModel(next);
      const label =
        next === "off" ? "Off" : next === "a500" ? "A500" : "A1200";
      showToast(`Amiga: ${label}`);
    }
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
    amigaKey,
  ]);

  useInterval(
    () => {
      if (!player) return;
      const dur = player.duration || 0;
      const cur = player.currentTime || 0;
      if (dur > 0) setProgress(cur % dur);
    },
    isPlay ? 500 : null
  );

  React.useEffect(() => {
    const ctx =
      (typeof window !== "undefined" &&
        window.__chiptunePrewarmedAudioContext) ||
      undefined;
    const jsPlayer = new ChiptuneJsPlayer({
      context: ctx,
      repeatCount: repeat ? -1 : 0,
    });
    // chiptune3 only auto-connects gain -> destination when it created
    // its own context. When we hand it a prewarmed context, the caller
    // owns routing.
    if (ctx) jsPlayer.gain.connect(jsPlayer.context.destination);
    jsPlayer.setVol(volume / 100);
    jsPlayer.onInitialized(() => setPlayerReady(true));
    jsPlayer.onMetadata((meta) => {
      setMetaData(meta);
      setTitle(meta.title || "");
      setMax(meta.dur || 0);
      // Always stamp the 🎶 prefix so untitled tracks still surface a
      // "now playing" indicator in the browser tab. The page heading
      // keeps its own [No Title] fallback when meta.title is empty.
      document.title = meta.title
        ? `🎶 ${meta.title} - CoolModFiles.com 🎶`
        : "🎶 CoolModFiles.com 🎶";
    });
    jsPlayer.onEnded(() => {
      setIsPlay(false);
      if (repeatRef.current) {
        playFromSourceRef.current(playingSourceRef.current);
      } else {
        playNextRef.current();
      }
    });
    // The worklet posts 'err' when libopenmpt can't parse the bytes we
    // handed it (truncated file, HTML error body, unsupported format).
    // Without this handler the UI would freeze at "Loading...". Retry
    // by walking forward in history, same path as natural end-of-track.
    jsPlayer.onError(() => {
      setIsPlay(false);
      playNextRef.current();
    });
    setPlayer(jsPlayer);
  }, []);

  React.useEffect(() => {
    localStorage.setItem("volume", volume.toString());
  }, [volume]);

  React.useEffect(() => {
    localStorage.setItem("audio.amigaModel", amigaModel);
    if (player) applyAmigaSetting(player, amigaModel);
  }, [amigaModel, player]);

  React.useEffect(() => {
    if (player && playerReady) {
      playFromSource(playingSource);
    }
  }, [player, playerReady]);

  // Probe whether the server has LIBRARY_ROOT configured. The Library
  // tab is hidden in the drawer when the API returns 404.
  React.useEffect(() => {
    fetch("/api/library?path=")
      .then((r) => setLibraryAvailable(r.ok))
      .catch(() => setLibraryAvailable(false));
  }, []);

  // Library deep-link: open the drawer to the Library tab and scroll
  // the catalog to the file's parent directory so the breadcrumb
  // reflects context.
  React.useEffect(() => {
    if (initialSource?.type === "library" && libraryAvailable) {
      const parts = initialSource.path.split("/");
      parts.pop();
      setLibraryPath(parts.join("/"));
      setDrawerTab("library");
      setDrawerOpen(true);
    }
  }, [initialSource, libraryAvailable]);

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
    // Chart-aware fast path: when playing a Mod Archive chart track,
    // walk the chart list sequentially and loop at the end. We bypass
    // the per-source-type history bucket here — the list IS the order.
    if (
      playingSource.type === "modarchive" &&
      currentChart !== "random" &&
      chartListRef.current &&
      chartListRef.current.length > 0
    ) {
      const list = chartListRef.current;
      const playingId = playingSource.id;
      const idx = list.findIndex((item) => item.id === playingId);
      const nextIdx = idx === -1 ? 0 : (idx + 1) % list.length;
      const nextItem = list[nextIdx];
      playFromSource(modArchive(nextItem.id), { confirmToast: true });
      return;
    }

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
    const { resetHistory = false, confirmToast = false } = options;
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
    getBuffer(source)
      .then((buffer) => {
        if (myGeneration !== playGenerationRef.current) return;
        setLoading(false);
        player.play(buffer);
        // Override the worklet's hardcoded play() defaults (which stamp
        // emulate_amiga=1 / type=a1200 on every module) so the user's
        // current Sound-pane choice wins on every track load. FIFO
        // postMessage ordering guarantees these arrive before the first
        // process() cycle pulls audio.
        applyAmigaSetting(player, amigaModelRef.current);
        // chiptune3 delivers metadata / duration asynchronously via the
        // onMetadata handler installed at player-init time; setTitle,
        // setMetaData, setMax and document.title are updated there.
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
        if (confirmToast) {
          showToast(`▶ Playing`);
        }
      })
      .catch(() => {
        if (myGeneration !== playGenerationRef.current) return;
        playFromSource(modArchive(getRandomInt(0, maxId)));
      });
  };

  const toggleMute = () => {
    if (!player) return;
    if (volume > 0) {
      setUnmuteVolume(volume);
      setVolume(0);
      player.setVol(0);
    } else {
      setVolume(unmuteVolume);
      player.setVol(unmuteVolume / 100);
    }
  };

  const toggleDrawer = () => setDrawerOpen((v) => !v);
  const closeDrawer = () => setDrawerOpen(false);
  const openDrawerToTab = (tab: DrawerTabId) => {
    setDrawerTab(tab);
    setDrawerOpen(true);
  };

  const playFromDrawer = (source: Source) => {
    playFromSource(source, { confirmToast: true });
  };

  const handlePlayRandom = () => {
    setCurrentChart("random");
    chartListRef.current = null;
    const next = modArchive(getRandomInt(0, maxId));
    playFromSource(next, { resetHistory: true, confirmToast: true });
  };

  const handlePlayChart = (
    item: ModItem,
    fullList: ModItem[],
    chartId: ChartId
  ) => {
    chartListRef.current = fullList;
    setCurrentChart(chartId);
    playFromSource(modArchive(item.id), { confirmToast: true });
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

  // Keep refs current for the onEnded handler — which is registered
  // once at player init and would otherwise close over stale state.
  React.useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);
  React.useEffect(() => {
    playingSourceRef.current = playingSource;
  }, [playingSource]);
  React.useEffect(() => {
    amigaModelRef.current = amigaModel;
  }, [amigaModel]);
  React.useEffect(() => {
    playNextRef.current = playNext;
  });
  React.useEffect(() => {
    playFromSourceRef.current = playFromSource;
  });

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
        <div
          className={`${styles.playerWrapper} ${
            drawerOpen ? styles.playerWrapperDrawerOpen : ""
          }`}
        >
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
              onToggleDrawer={toggleDrawer}
              downloadTrack={downloadTrack}
              repeat={repeat}
              setRepeat={setRepeat}
              copyEmbed={copyEmbed}
              updateFavoriteModsRuntime={updateFavoriteModsRuntime}
              favoriteModsRuntime={favoriteModsRuntime}
            />
          </div>
          <SourceDrawer
            open={drawerOpen}
            activeTab={drawerTab}
            setActiveTab={setDrawerTab}
            onClose={closeDrawer}
            showLibrary={libraryAvailable}
            helpContent={backSideContent}
            onPlayRandom={handlePlayRandom}
            onPlayChart={handlePlayChart}
            libraryProps={{
              currentPath: libraryPath,
              setCurrentPath: setLibraryPath,
              onPlay: playFromDrawer,
            }}
            localProps={{
              pickedFiles,
              setPickedFiles,
              onPlay: playFromDrawer,
            }}
            favoritesProps={{
              content: favoriteModsRuntime,
              onPlay: (track) =>
                playFromSource(modArchive(track.id), { confirmToast: true }),
              removeFavoriteModRuntime,
              downloadFavoriteMods,
              downloadFavoriteModsJson,
            }}
            soundProps={{
              amigaModel,
              setAmigaModel,
              trackType: metaData.type,
            }}
          />
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
}

export default Player;
