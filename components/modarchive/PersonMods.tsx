/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from "react";
import styles from "./lists.module.scss";
import type {
  ModItem,
  Pagination,
  PersonModsResponse,
} from "../../lib/modarchive/types";
import { useFilenameStyle } from "../../lib/filename/context";

type PersonModsProps = {
  kind: "artist";
  id: number;
  onPick: (item: ModItem, fullList: ModItem[]) => void;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; items: ModItem[]; pagination: Pagination };

function PersonMods({ kind, id, onPick }: PersonModsProps) {
  const { render } = useFilenameStyle();
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [reloadCounter, setReloadCounter] = React.useState(0);
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const url =
      page === 1
        ? `/api/modarchive/${kind}/${id}`
        : `/api/modarchive/${kind}/${id}?page=${page}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PersonModsResponse) => {
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
  }, [kind, id, page, reloadCounter]);

  React.useEffect(() => {
    setPage(1);
  }, [kind, id]);

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
  const { pagination } = state;
  const hasPrev = pagination.page > 1;
  const hasNext = pagination.page < pagination.totalPages;
  return (
    <>
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
              <span className={styles.subtitle} title={item.filename}>
                {render(item.filename)}
              </span>
            )}
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

export default PersonMods;
