import React from "react";
import styles from "./LibraryCatalog.module.scss";
import { library } from "../sources";

function joinPath(parts) {
  return parts.filter(Boolean).join("/");
}

function LibraryCatalog({ currentPath, setCurrentPath, onPlay }) {
  const [listing, setListing] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState(null);
  const searchTimer = React.useRef(null);

  // Listing fetch — fires when currentPath changes (and search is empty)
  React.useEffect(() => {
    if (searchQuery) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/library?path=${encodeURIComponent(currentPath)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => !cancelled && setListing(data))
      .catch((status) => !cancelled && setError(status));
    return () => {
      cancelled = true;
    };
  }, [currentPath, searchQuery]);

  // Search fetch — debounced
  React.useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery) {
      setSearchResults(null);
      return;
    }
    searchTimer.current = setTimeout(() => {
      fetch(`/api/library/search?q=${encodeURIComponent(searchQuery)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => setSearchResults(data.results || []))
        .catch(() => setSearchResults([]));
    }, 250);
    return () => searchTimer.current && clearTimeout(searchTimer.current);
  }, [searchQuery]);

  const segments = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const goTo = (path) => {
    setCurrentPath(path);
    setSearchQuery("");
  };

  if (searchResults !== null) {
    return (
      <div className={styles.wrapper}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="search the library..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchResults.length === 0 ? (
          <div className={styles.empty}>No matches.</div>
        ) : (
          <ul className={styles.list}>
            {searchResults.map((p) => (
              <li
                key={p}
                className={`${styles.row} ${styles.file}`}
                onClick={() => onPlay(library(p))}
                title={p}
              >
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <input
        type="text"
        className={styles.searchInput}
        placeholder="search the library..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <div className={styles.breadcrumb}>
        <span className={styles.crumb} onClick={() => goTo("")}>
          /
        </span>
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            <span
              className={styles.crumb}
              onClick={() => goTo(joinPath(segments.slice(0, i + 1)))}
            >
              {seg}
            </span>
            <span>/</span>
          </React.Fragment>
        ))}
      </div>
      {error ? (
        <div className={styles.error}>Failed to load (HTTP {error}).</div>
      ) : !listing ? (
        <div className={styles.empty}>Loading...</div>
      ) : listing.dirs.length === 0 && listing.files.length === 0 ? (
        <div className={styles.empty}>Empty.</div>
      ) : (
        <ul className={styles.list}>
          {listing.dirs.map((d) => (
            <li
              key={`d:${d}`}
              className={`${styles.row} ${styles.dir}`}
              onClick={() => goTo(joinPath([...segments, d]))}
              title={d}
            >
              {d}
            </li>
          ))}
          {listing.files.map((f) => (
            <li
              key={`f:${f}`}
              className={`${styles.row} ${styles.file}`}
              onClick={() => onPlay(library(joinPath([...segments, f])))}
              title={f}
            >
              {f}
            </li>
          ))}
          {listing.truncated && (
            <li className={styles.truncated}>
              Listing truncated (too many entries).
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default LibraryCatalog;
