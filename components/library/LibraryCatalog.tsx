import React from "react";
import styles from "./LibraryCatalog.module.scss";
import {
  library,
  tfmxLibrary,
  tfmxSingleLibrary,
  type LibrarySource,
  type TfmxLibrarySource,
  type TfmxSingleLibrarySource,
} from "../sources";
import { useFilenameStyle } from "../../lib/filename/context";

type PairEntry = { base: string; tfx: string; sam: string };
type SingleEntry = { base: string; name: string; ext: string };

type Listing = {
  dirs: string[];
  files: string[];
  pairs?: PairEntry[];
  singles?: SingleEntry[];
  truncated?: boolean;
};

type SearchResult =
  | { kind: "mod"; path: string }
  | { kind: "tfmx"; tfxPath: string; samPath: string; base: string }
  | { kind: "tfmx-single"; path: string; base: string; ext: string };

type LibraryCatalogProps = {
  currentPath: string;
  setCurrentPath: React.Dispatch<React.SetStateAction<string>>;
  onPlay: (
    source: LibrarySource | TfmxLibrarySource | TfmxSingleLibrarySource
  ) => void;
};

function joinPath(parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

function LibraryCatalog({
  currentPath,
  setCurrentPath,
  onPlay,
}: LibraryCatalogProps) {
  const { render, renderPair } = useFilenameStyle();
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
            {searchResults.map((r) => {
              if (r.kind === "mod") {
                const lastSlash = r.path.lastIndexOf("/");
                const dir =
                  lastSlash === -1 ? "" : r.path.slice(0, lastSlash + 1);
                const base =
                  lastSlash === -1 ? r.path : r.path.slice(lastSlash + 1);
                return (
                  <li
                    key={`mod:${r.path}`}
                    className={`${styles.row} ${styles.file}`}
                    onClick={() => onPlay(library(r.path))}
                    title={r.path}
                  >
                    {dir}
                    {render(base)}
                  </li>
                );
              }
              if (r.kind === "tfmx-single") {
                return (
                  <li
                    key={`tfmx-single:${r.path}`}
                    className={`${styles.row} ${styles.file}`}
                    onClick={() =>
                      onPlay(tfmxSingleLibrary(r.path, r.base, r.ext))
                    }
                    title={r.path}
                  >
                    {render(r.path.slice(r.path.lastIndexOf("/") + 1))}
                  </li>
                );
              }
              return (
                <li
                  key={`tfmx:${r.tfxPath}`}
                  className={`${styles.row} ${styles.file}`}
                  onClick={() =>
                    onPlay(tfmxLibrary(r.tfxPath, r.samPath, r.base))
                  }
                  title={`${r.tfxPath} + ${r.samPath}`}
                >
                  {renderPair(r.base)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const pairs = listing?.pairs ?? [];
  const singles = listing?.singles ?? [];
  const isEmpty =
    !!listing &&
    listing.dirs.length === 0 &&
    pairs.length === 0 &&
    singles.length === 0 &&
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
              {renderPair(p.base)}
            </li>
          ))}
          {singles.map((s) => (
            <li
              key={`s:${s.name}`}
              className={`${styles.row} ${styles.file}`}
              onClick={() =>
                onPlay(
                  tfmxSingleLibrary(
                    joinPath([...segments, s.name]),
                    s.base,
                    s.ext
                  )
                )
              }
              title={s.name}
            >
              {render(s.name)}
            </li>
          ))}
          {listing.files.map((f) => (
            <li
              key={`f:${f}`}
              className={`${styles.row} ${styles.file}`}
              onClick={() => onPlay(library(joinPath([...segments, f])))}
              title={f}
            >
              {render(f)}
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
