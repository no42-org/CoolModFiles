/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import styles from "./ModArchivePane.module.scss";
import ChartList from "./ChartList";
import PeopleList from "./PeopleList";
import PersonMods from "./PersonMods";
import type { ModItem, PersonItem } from "../../lib/modarchive/types";

export type ChartId =
  | "random"
  | "featured"
  | "tophits"
  | "topfavourites"
  | "topscore"
  | `artist:${number}`;

type ModChartKind = "featured" | "tophits" | "topfavourites" | "topscore";

type View =
  | { kind: "menu" }
  | { kind: "random" }
  | { kind: "chart"; chart: ModChartKind }
  | { kind: "topartists" }
  | { kind: "artist"; id: number; name: string };

type ModArchivePaneProps = {
  onPlayRandom: () => void;
  onPlayChart: (item: ModItem, fullList: ModItem[], chartId: ChartId) => void;
};

const MENU_ITEMS: Array<{ icon: string; label: string; view: View }> = [
  {
    icon: "🌟",
    label: "All Featured Modules",
    view: { kind: "chart", chart: "featured" },
  },
  { icon: "🎲", label: "Random", view: { kind: "random" } },
  {
    icon: "⭐",
    label: "Top Favorites",
    view: { kind: "chart", chart: "topfavourites" },
  },
  {
    icon: "⬇",
    label: "Most Downloads",
    view: { kind: "chart", chart: "tophits" },
  },
  {
    icon: "🏆",
    label: "Most Revered",
    view: { kind: "chart", chart: "topscore" },
  },
  { icon: "🎤", label: "Artist Charts", view: { kind: "topartists" } },
];

function ModArchivePane({ onPlayRandom, onPlayChart }: ModArchivePaneProps) {
  const [view, setView] = React.useState<View>({ kind: "menu" });

  const goBack = () => {
    if (view.kind === "artist") {
      setView({ kind: "topartists" });
    } else {
      setView({ kind: "menu" });
    }
  };

  if (view.kind === "menu") {
    return (
      <div className={styles.wrapper}>
        <div className={styles.menu}>
          {MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              className={styles.menuButton}
              onClick={() => setView(item.view)}
              type="button"
            >
              <span className={styles.menuIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  let title = "";
  let body: React.ReactNode = null;

  if (view.kind === "random") {
    title = "Random";
    body = (
      <div className={styles.randomPane}>
        <button
          className={styles.randomButton}
          onClick={onPlayRandom}
          type="button"
        >
          🎲 Play random
        </button>
        <div className={styles.randomAttribution}>
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
    );
  } else if (view.kind === "chart") {
    title =
      view.chart === "featured"
        ? "All Featured Modules"
        : view.chart === "tophits"
          ? "Most Downloads"
          : view.chart === "topfavourites"
            ? "Top Favorites"
            : "Most Revered";
    body = (
      <ChartList
        kind={view.chart}
        onPick={(item, fullList) => onPlayChart(item, fullList, view.chart)}
      />
    );
  } else if (view.kind === "topartists") {
    title = "Artist Charts";
    body = (
      <PeopleList
        kind="topartists"
        onPick={(person: PersonItem) =>
          setView({ kind: "artist", id: person.id, name: person.name })
        }
      />
    );
  } else if (view.kind === "artist") {
    title = `Artist: ${view.name}`;
    body = (
      <PersonMods
        kind="artist"
        id={view.id}
        onPick={(item, fullList) =>
          onPlayChart(item, fullList, `artist:${view.id}`)
        }
      />
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.subHeader}>
        <button
          className={styles.backButton}
          onClick={goBack}
          title="Back"
          aria-label="Back"
          type="button"
        >
          ‹
        </button>
        <span className={styles.subTitle}>{title}</span>
      </div>
      <div className={styles.body}>{body}</div>
    </div>
  );
}

export default ModArchivePane;
