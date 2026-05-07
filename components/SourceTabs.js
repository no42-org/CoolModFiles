import React from "react";
import styles from "./SourceTabs.module.scss";

function SourceTabs({ activeTab, onChange, showLibrary }) {
  const tabs = [
    { id: "random", label: "Random" },
    showLibrary && { id: "library", label: "Library" },
    { id: "local", label: "Local" },
  ].filter(Boolean);

  return (
    <div className={styles.tabs}>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`${styles.tab} ${
            activeTab === t.id ? styles.tabActive : ""
          }`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default SourceTabs;
