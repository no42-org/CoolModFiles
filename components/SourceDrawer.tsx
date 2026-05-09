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
import { DownloadButton } from "../icons";
import { useKeyPress } from "../hooks";
import type { LibrarySource, LocalSource } from "./sources";
import type { FavoriteTrack } from "./LikedMod";

export type DrawerTabId =
  | "random"
  | "library"
  | "local"
  | "favorites"
  | "help";

type LibraryProps = {
  currentPath: string;
  setCurrentPath: React.Dispatch<React.SetStateAction<string>>;
  onPlay: (source: LibrarySource) => void;
};

type LocalProps = {
  pickedFiles: File[];
  setPickedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onPlay: (source: LocalSource) => void;
};

type FavoritesProps = {
  content: FavoriteTrack[];
  onPlay: (track: FavoriteTrack) => void;
  removeFavoriteModRuntime: (id: number, index?: number) => void;
  downloadFavoriteMods: () => void;
  downloadFavoriteModsJson: () => void;
};

type SourceDrawerProps = {
  open: boolean;
  activeTab: DrawerTabId;
  setActiveTab: (tab: DrawerTabId) => void;
  onClose: () => void;
  showLibrary: boolean;
  helpContent?: string;
  onPlayRandom: () => void;
  libraryProps: LibraryProps;
  localProps: LocalProps;
  favoritesProps: FavoritesProps;
};

type TabDef = { id: DrawerTabId; label: string };

function SourceDrawer({
  open,
  activeTab,
  setActiveTab,
  onClose,
  showLibrary,
  helpContent,
  onPlayRandom,
  libraryProps,
  localProps,
  favoritesProps,
}: SourceDrawerProps) {
  const escKey = useKeyPress("Escape");
  React.useEffect(() => {
    if (escKey && open) onClose();
  }, [escKey, open]);

  // Animation classes are only applied after the first open. Before
  // that, the drawer sits at its base position (left:0, behind the
  // player) — visible to the DOM but masked by the player's higher
  // z-index — so the user never sees a phantom closing animation
  // on initial page load.
  const [hasOpened, setHasOpened] = React.useState(false);
  React.useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);
  const drawerClass = [
    player.playerBack,
    hasOpened ? (open ? player.slideRight : player.slideLeft) : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tabs: TabDef[] = (
    [
      { id: "random", label: "Random" },
      showLibrary && { id: "library", label: "Library" },
      { id: "local", label: "Local" },
      { id: "favorites", label: "♥" },
      { id: "help", label: "?" },
    ] as Array<TabDef | false>
  ).filter((t): t is TabDef => Boolean(t));

  return (
    <div className={drawerClass}>
      <div className={drawer.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`${drawer.tab} ${
              activeTab === t.id ? drawer.tabActive : ""
            }`}
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
        {activeTab === "random" && (
          <div className={drawer.randomPane}>
            <button
              className={drawer.randomButton}
              onClick={onPlayRandom}
              type="button"
            >
              🎲 Play random
            </button>
            <div className={drawer.randomAttribution}>
              from{" "}
              <a
                href="https://modarchive.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                modarchive.org
              </a>
            </div>
          </div>
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
      </div>
    </div>
  );
}

export default SourceDrawer;
