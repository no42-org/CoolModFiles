import React from "react";
import styles from "./LocalCatalog.module.scss";
import { local, isModuleFile } from "../sources";

function LocalCatalog({ pickedFiles, setPickedFiles, onPlay }) {
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef(null);

  const addFiles = (incoming) => {
    const filtered = Array.from(incoming).filter((f) => isModuleFile(f.name));
    if (filtered.length === 0) return;
    setPickedFiles((prev) => [...prev, ...filtered]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);

  const onPick = (e) => {
    addFiles(e.target.files);
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
