import React from "react";
import styles from "./LocalCatalog.module.scss";
import { local, isModuleFile, type LocalSource } from "../sources";

type LocalCatalogProps = {
  pickedFiles: File[];
  setPickedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onPlay: (source: LocalSource) => void;
};

function LocalCatalog({
  pickedFiles,
  setPickedFiles,
  onPlay,
}: LocalCatalogProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const filtered = Array.from(incoming).filter((f) => isModuleFile(f.name));
    if (filtered.length === 0) return;
    setPickedFiles((prev) => [...prev, ...filtered]);
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
      {pickedFiles.length === 0 ? (
        <div className={styles.empty}>No files picked yet.</div>
      ) : (
        <ul className={styles.list}>
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
