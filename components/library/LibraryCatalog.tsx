import React from "react";
import styles from "./LibraryCatalog.module.scss";
import {
  library,
  tfmxLibrary,
  type LibrarySource,
  type TfmxLibrarySource,
} from "../sources";

type PairEntry = { base: string; tfx: string; sam: string };

type Listing = {
  dirs: string[];
  files: string[];
  pairs?: PairEntry[];
  truncated?: boolean;
};

type SearchResult =
  | { kind: "mod"; path: string }
  | { kind: "tfmx"; tfxPath: string; samPath: string; base: string };

type LibraryCatalogProps = {
  currentPath: string;
  setCurrentPath: React.Dispatch<React.SetStateAction<string>>;
  onPlay: (source: LibrarySource | TfmxLibrarySource) => void;
};

function joinPath(parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

function LibraryCatalog({
  currentPath,
  setCurrentPath,
  onPlay,
}: LibraryCatalogProps) {
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [error, setError] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<
    SearchResult[] | null
  >(null);
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listing fetch — fires when currentPath changes (and search is empty)
  React.useEffect(() => {
    if (searchQuery) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/library?path=${encodeURIComponent(currentPath)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Listing) => !cancelled && setListing(data))
      .catch((status: number) => !cancelled && setError(status));
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
        .then((data: { results?: SearchResult[] }) =>
          setSearchResults(data.results || [])
        )
        .catch(() => setSearchResults([]));
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  const segments = currentPath ? currentPath.split("/").filter(Boolean) : [];

  const goTo = (path: string) => {
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
            {searchResults.map((r) =>
              r.kind === "mod" ? (
                <li
                  key={`mod:${r.path}`}
                  className={`${styles.row} ${styles.file}`}
                  onClick={() => onPlay(library(r.path))}
                  title={r.path}
                >
                  {r.path}
                </li>
              ) : (
                <li
                  key={`tfmx:${r.tfxPath}`}
                  className={`${styles.row} ${styles.file}`}
                  onClick={() =>
                    onPlay(tfmxLibrary(r.tfxPath, r.samPath, r.base))
                  }
                  title={`${r.tfxPath} + ${r.samPath}`}
                >
                  {r.base} (TFMX)
                </li>
              )
            )}
          </ul>
        )}
      </div>
    );
  }

  const pairs = listing?.pairs ?? [];
  const isEmpty =
    !!listing &&
    listing.dirs.length === 0 &&
    pairs.length === 0 &&
    listing.files.length === 0;

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
      ) : isEmpty ? (
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
          {pairs.map((p) => (
            <li
              key={`p:${p.base}`}
              className={`${styles.row} ${styles.file}`}
              onClick={() =>
                onPlay(
                  tfmxLibrary(
                    joinPath([...segments, p.tfx]),
                    joinPath([...segments, p.sam]),
                    p.base
                  )
                )
              }
              title={`${p.tfx} + ${p.sam}`}
            >
              {p.base} (TFMX)
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
