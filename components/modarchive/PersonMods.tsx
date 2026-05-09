/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import styles from "./lists.module.scss";
import type { ModItem, PersonModsResponse } from "../../lib/modarchive/types";

type PersonModsProps = {
  kind: "artist";
  id: number;
  onPick: (item: ModItem, fullList: ModItem[]) => void;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; items: ModItem[] };

function PersonMods({ kind, id, onPick }: PersonModsProps) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [reloadCounter, setReloadCounter] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/modarchive/${kind}/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PersonModsResponse) => {
        if (cancelled) return;
        setState({ status: "ok", items: data.items });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = typeof err === "number" ? `HTTP ${err}` : "fetch failed";
        setState({ status: "error", message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id, reloadCounter]);

  if (state.status === "loading") {
    return <div className={styles.loading}>Loading…</div>;
  }
  if (state.status === "error") {
    return (
      <div className={styles.error}>
        Couldn&apos;t load mods ({state.message}).
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
  if (state.items.length === 0) {
    return <div className={styles.empty}>No mods listed.</div>;
  }
  return (
    <ul className={styles.list}>
      {state.items.map((item) => (
        <li
          key={item.id}
          className={styles.row}
          onClick={() => onPick(item, state.items)}
          title={item.title}
        >
          <span className={styles.title}>{item.title}</span>
          {item.filename && (
            <span className={styles.subtitle}>{item.filename}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default PersonMods;
