/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import drawer from "./SourceDrawer.module.scss";
import player from "./Player.module.scss";
import LibraryCatalog from "./library/LibraryCatalog";
import LocalCatalog from "./local/LocalCatalog";
import LikedMods from "./LikedMods";
import BackSide from "./BackSide";
import SoundPane from "./SoundPane";
import ModArchivePane, { type ChartId } from "./modarchive/ModArchivePane";
import { DownloadButton } from "../icons";
import { useKeyPress } from "../hooks";
import type {
  LibrarySource,
  LocalSource,
  TfmxLocalSource,
} from "./sources";
import type { FavoriteTrack } from "./LikedMod";
import type { ModItem } from "../lib/modarchive/types";

export type DrawerTabId =
  | "modarchive"
  | "library"
  | "local"
  | "favorites"
  | "help"
  | "sound";

type AmigaModel = "off" | "a500" | "a1200";

type LibraryProps = {
  currentPath: string;
  setCurrentPath: React.Dispatch<React.SetStateAction<string>>;
  onPlay: (source: LibrarySource) => void;
};

type LocalProps = {
  pickedFiles: File[];
  setPickedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  pickedTfmxPairs: TfmxLocalSource[];
  setPickedTfmxPairs: React.Dispatch<React.SetStateAction<TfmxLocalSource[]>>;
  onPlay: (source: LocalSource | TfmxLocalSource) => void;
};

type FavoritesProps = {
  content: FavoriteTrack[];
  onPlay: (track: FavoriteTrack) => void;
  removeFavoriteModRuntime: (id: number, index?: number) => void;
  downloadFavoriteMods: () => void;
  downloadFavoriteModsJson: () => void;
};

type SoundProps = {
  amigaModel: AmigaModel;
  setAmigaModel: (m: AmigaModel) => void;
  trackType?: string;
  stereoSeparation: number;
  setStereoSeparation: (v: number) => void;
};

type SourceDrawerProps = {
  open: boolean;
  activeTab: DrawerTabId;
  setActiveTab: (tab: DrawerTabId) => void;
  onClose: () => void;
  showLibrary: boolean;
  helpContent?: string;
  onPlayRandom: () => void;
  onPlayChart: (item: ModItem, fullList: ModItem[], chartId: ChartId) => void;
  libraryProps: LibraryProps;
  localProps: LocalProps;
  favoritesProps: FavoritesProps;
  soundProps: SoundProps;
};

type TabDef = { id: DrawerTabId; label: string; iconOnly?: boolean };

function SourceDrawer({
  open,
  activeTab,
  setActiveTab,
  onClose,
  showLibrary,
  helpContent,
  onPlayRandom,
  onPlayChart,
  libraryProps,
  localProps,
  favoritesProps,
  soundProps,
}: SourceDrawerProps) {
  const escKey = useKeyPress("Escape");
  React.useEffect(() => {
    if (escKey && open) onClose();
  }, [escKey, open]);

  const drawerClass = [
    player.playerBack,
    open ? player.playerBackOpen : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tabs: TabDef[] = (
    [
      { id: "modarchive", label: "Mod Archive" },
      showLibrary && { id: "library", label: "Library" },
      { id: "local", label: "Local" },
      { id: "favorites", label: "♥", iconOnly: true },
      { id: "help", label: "?", iconOnly: true },
      { id: "sound", label: "🎛", iconOnly: true },
    ] as Array<TabDef | false>
  ).filter((t): t is TabDef => Boolean(t));

  return (
    <div className={drawerClass}>
      <div className={drawer.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`${drawer.tab} ${
              t.iconOnly ? drawer.tabIcon : ""
            } ${activeTab === t.id ? drawer.tabActive : ""}`}
            onClick={() => setActiveTab(t.id)}
            title={t.label}
          >
            {t.label}
          </button>
        ))}
        <button
          className={drawer.closeButton}
          onClick={onClose}
          title="Close drawer"
          aria-label="Close drawer"
        >
          ×
        </button>
      </div>
      <hr className={player.fancyHr} />
      <div className={drawer.body}>
        {activeTab === "modarchive" && (
          <ModArchivePane
            onPlayRandom={onPlayRandom}
            onPlayChart={onPlayChart}
          />
        )}
        {activeTab === "library" && showLibrary && (
          <LibraryCatalog {...libraryProps} />
        )}
        {activeTab === "local" && <LocalCatalog {...localProps} />}
        {activeTab === "favorites" && (
          <>
            <header className={drawer.favoritesHeader}>
              <h2 onClick={favoritesProps.downloadFavoriteModsJson}>
                <a href="#">Favorite Mods</a>
              </h2>
              <DownloadButton
                onClick={favoritesProps.downloadFavoriteMods}
                height="25"
                width="25"
              />
            </header>
            <hr className={player.fancyHr} />
            <LikedMods
              content={favoritesProps.content}
              onPlay={favoritesProps.onPlay}
              removeFavoriteModRuntime={favoritesProps.removeFavoriteModRuntime}
            />
          </>
        )}
        {activeTab === "help" && <BackSide content={helpContent} />}
        {activeTab === "sound" && <SoundPane {...soundProps} />}
      </div>
    </div>
  );
}

export default SourceDrawer;
