/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import styles from "./lists.module.scss";
import genreStyles from "./GenreList.module.scss";
import type {
  Genre,
  GenreCategory,
  GenresResponse,
} from "../../lib/modarchive/types";

type GenreListProps = {
  onPick: (genre: Genre) => void;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; categories: GenreCategory[] };

function GenreList({ onPick }: GenreListProps) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [reloadCounter, setReloadCounter] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch("/api/modarchive/genres")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: GenresResponse) => {
        if (cancelled) return;
        setState({ status: "ok", categories: data.categories });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = typeof err === "number" ? `HTTP ${err}` : "fetch failed";
        setState({ status: "error", message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCounter]);

  if (state.status === "loading") {
    return <div className={styles.loading}>Loading…</div>;
  }
  if (state.status === "error") {
    return (
      <div className={styles.error}>
        Couldn&apos;t load genres ({state.message}).
        <button
          className={styles.retryButton}
          onClick={() => setReloadCounter((c) => c + 1)}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }
  if (state.categories.length === 0) {
    return <div className={styles.empty}>No genres available.</div>;
  }

  return (
    <div className={genreStyles.scroll}>
      {state.categories.map((cat) => (
        <section key={cat.name} className={genreStyles.category}>
          <h3 className={genreStyles.categoryHeader}>{cat.name}</h3>
          <ul className={genreStyles.genreList}>
            {cat.genres.map((g) => (
              <li
                key={g.id}
                className={`${styles.row} ${genreStyles.genreRow}`}
                onClick={() => onPick(g)}
                title={g.name}
              >
                <span className={styles.title}>{g.name}</span>
                {g.count !== undefined && (
                  <span className={genreStyles.count}>({g.count})</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default GenreList;
