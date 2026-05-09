/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import styles from "./lists.module.scss";
import type {
  PeopleChartResponse,
  PersonItem,
} from "../../lib/modarchive/types";

type PeopleListProps = {
  kind: "topartists";
  onPick: (person: PersonItem) => void;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; items: PersonItem[] };

function PeopleList({ kind, onPick }: PeopleListProps) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [reloadCounter, setReloadCounter] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/modarchive/charts/${kind}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PeopleChartResponse) => {
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
  }, [kind, reloadCounter]);

  if (state.status === "loading") {
    return <div className={styles.loading}>Loading…</div>;
  }
  if (state.status === "error") {
    return (
      <div className={styles.error}>
        Couldn&apos;t load chart ({state.message}).
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
    return <div className={styles.empty}>No entries in this chart.</div>;
  }
  return (
    <ul className={styles.list}>
      {state.items.map((person) => (
        <li
          key={person.id}
          className={styles.row}
          onClick={() => onPick(person)}
          title={person.name}
        >
          {person.rank !== undefined && (
            <span className={styles.rank}>#{person.rank}</span>
          )}
          <span className={styles.title}>{person.name}</span>
        </li>
      ))}
    </ul>
  );
}

export default PeopleList;
