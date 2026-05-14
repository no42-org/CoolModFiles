import React from "react";
import styles from "./LocalCatalog.module.scss";
import {
  local,
  isModuleFile,
  sourceKey,
  type LocalSource,
  type TfmxLocalSource,
} from "../sources";
import { detectTfmxPairs } from "./tfmx-pairs";

type LocalCatalogProps = {
  pickedFiles: File[];
  setPickedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  pickedTfmxPairs: TfmxLocalSource[];
  setPickedTfmxPairs: React.Dispatch<React.SetStateAction<TfmxLocalSource[]>>;
  onPlay: (source: LocalSource | TfmxLocalSource) => void;
};

function LocalCatalog({
  pickedFiles,
  setPickedFiles,
  pickedTfmxPairs,
  setPickedTfmxPairs,
  onPlay,
}: LocalCatalogProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    // Pair detection runs FIRST so that TFMX halves are claimed before
    // isModuleFile gets a chance to drop them. Unpaired TFMX halves
    // (filename matches the half-pattern but no companion) are silently
    // discarded per the tfmx-playback spec.
    const all = Array.from(incoming);
    const { pairs, remainingFiles } = detectTfmxPairs(all);
    const modules = remainingFiles.filter((f) => isModuleFile(f.name));

    if (pairs.length === 0 && modules.length === 0) return;

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

  const isEmpty = pickedFiles.length === 0 && pickedTfmxPairs.length === 0;

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
        <div>Drop MOD files here</div>
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
              {pair.base} (TFMX)
            </li>
          ))}
          {pickedFiles.map((file, idx) => (
            <li
              key={`${file.name}:${file.size}:${file.lastModified}:${idx}`}
              className={styles.row}
              onClick={() => onPlay(local(file))}
              title={file.name}
            >
              {file.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocalCatalog;
