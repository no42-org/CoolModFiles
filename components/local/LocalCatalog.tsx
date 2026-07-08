import React from "react";
import styles from "./LocalCatalog.module.scss";
import {
  local,
  isModuleFile,
  sourceKey,
  type LocalSource,
  type TfmxLocalSource,
  type TfmxSingleLocalSource,
} from "../sources";
import { detectTfmxPairs } from "./tfmx-pairs";
import { showToast } from "../../utils";
import { useFilenameStyle } from "../../lib/filename/context";

type LocalCatalogProps = {
  pickedFiles: File[];
  setPickedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  pickedTfmxPairs: TfmxLocalSource[];
  setPickedTfmxPairs: React.Dispatch<React.SetStateAction<TfmxLocalSource[]>>;
  pickedTfmxSingles: TfmxSingleLocalSource[];
  setPickedTfmxSingles: React.Dispatch<
    React.SetStateAction<TfmxSingleLocalSource[]>
  >;
  onPlay: (source: LocalSource | TfmxLocalSource | TfmxSingleLocalSource) => void;
};

function LocalCatalog({
  pickedFiles,
  setPickedFiles,
  pickedTfmxPairs,
  setPickedTfmxPairs,
  pickedTfmxSingles,
  setPickedTfmxSingles,
  onPlay,
}: LocalCatalogProps) {
  const { render, renderPair } = useFilenameStyle();
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    // Pair detection runs FIRST so that TFMX halves are claimed before
    // isModuleFile gets a chance to drop them. Per local-files-mode spec:
    // both halves of a TFMX pair must be in the same drop — unpaired
    // halves are reported via toast so the user knows to drop the
    // companion together.
    const all = Array.from(incoming);
    const { pairs, singles, remainingFiles, collisions, unpaired } =
      detectTfmxPairs(all);
    const modules = remainingFiles.filter((f) => isModuleFile(f.name));

    // Surface collisions: when a folder drop contains two halves with the
    // same base name from different subdirectories, last-write-wins silently
    // discarded one. Tell the user which base(s) collapsed.
    if (collisions.length > 0) {
      const names = collisions.slice(0, 3).join(", ");
      const more = collisions.length > 3 ? ` (+${collisions.length - 3} more)` : "";
      showToast(`Duplicate TFMX pair(s): ${names}${more} — only one kept`);
    }
    // Surface unpaired halves so the user knows their drop produced no
    // catalog row.
    if (unpaired.length > 0) {
      const names = unpaired.slice(0, 3).join(", ");
      const more = unpaired.length > 3 ? ` (+${unpaired.length - 3} more)` : "";
      showToast(`Unpaired TFMX half: ${names}${more} — drop the matching file together`);
    }

    if (pairs.length === 0 && singles.length === 0 && modules.length === 0)
      return;

    if (modules.length > 0) {
      setPickedFiles((prev) => [...prev, ...modules]);
    }
    if (pairs.length > 0) {
      setPickedTfmxPairs((prev) => {
        // De-dup by sourceKey so the same pair dropped twice collapses.
        const existing = new Set(prev.map((p) => sourceKey(p)));
        const fresh = pairs.filter((p) => !existing.has(sourceKey(p)));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    }
    if (singles.length > 0) {
      setPickedTfmxSingles((prev) => {
        const existing = new Set(prev.map((s) => sourceKey(s)));
        const fresh = singles.filter((s) => !existing.has(sourceKey(s)));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const isEmpty =
    pickedFiles.length === 0 &&
    pickedTfmxPairs.length === 0 &&
    pickedTfmxSingles.length === 0;

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropZone} ${
          dragActive ? styles.dropZoneActive : ""
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div>Drop MOD, AHX, or TFMX files here</div>
        <div className={styles.dropHint}>
          .mod .xm .it .s3m .mptm .stm .mtm .669 .med .okt .ult .amf · .ahx
          .thx · tfx+sam · mdat+smpl · .fc .fc13 .fc14 .smod .hip .hipc .mcmd
        </div>
        <button
          className={styles.pickButton}
          onClick={() => inputRef.current?.click()}
        >
          or open files…
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          // @ts-expect-error -- webkitdirectory and directory aren't typed in
          // React's input attribute interface but are valid HTML attributes
          // for selecting a folder of files.
          webkitdirectory=""
          directory=""
          className={styles.hiddenInput}
          onChange={onPick}
        />
      </div>
      {isEmpty ? (
        <div className={styles.empty}>No files picked yet.</div>
      ) : (
        <ul className={styles.list}>
          {pickedTfmxPairs.map((pair, idx) => (
            <li
              key={`tfmx:${sourceKey(pair)}:${idx}`}
              className={styles.row}
              onClick={() => onPlay(pair)}
              title={`${pair.tfx.name} + ${pair.sam.name}`}
            >
              {renderPair(pair.base)}
            </li>
          ))}
          {pickedTfmxSingles.map((s, idx) => (
            <li
              key={`tfmx-single:${sourceKey(s)}:${idx}`}
              className={styles.row}
              onClick={() => onPlay(s)}
              title={s.file.name}
            >
              {render(s.file.name)}
            </li>
          ))}
          {pickedFiles.map((file, idx) => (
            <li
              key={`${file.name}:${file.size}:${file.lastModified}:${idx}`}
              className={styles.row}
              onClick={() => onPlay(local(file))}
              title={file.name}
            >
              {render(file.name)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocalCatalog;
