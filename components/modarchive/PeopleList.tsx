/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import styles from "./lists.module.scss";
import type {
  Pagination,
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
  | { status: "ok"; items: PersonItem[]; pagination: Pagination };

function PeopleList({ kind, onPick }: PeopleListProps) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [reloadCounter, setReloadCounter] = React.useState(0);
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const url =
      page === 1
        ? `/api/modarchive/charts/${kind}`
        : `/api/modarchive/charts/${kind}?page=${page}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PeopleChartResponse) => {
        if (cancelled) return;
        setState({
          status: "ok",
          items: data.items,
          pagination: data.pagination,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = typeof err === "number" ? `HTTP ${err}` : "fetch failed";
        setState({ status: "error", message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, page, reloadCounter]);

  React.useEffect(() => {
    setPage(1);
  }, [kind]);

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
  const { pagination } = state;
  const hasPrev = pagination.page > 1;
  const hasNext = pagination.page < pagination.totalPages;
  return (
    <>
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
      {pagination.totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!hasPrev}
            type="button"
          >
            ‹ Prev
          </button>
          <span className={styles.pageStatus}>
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            className={styles.pageButton}
            onClick={() =>
              setPage((p) => Math.min(pagination.totalPages, p + 1))
            }
            disabled={!hasNext}
            type="button"
          >
            Next ›
          </button>
        </div>
      )}
    </>
  );
}

export default PeopleList;
