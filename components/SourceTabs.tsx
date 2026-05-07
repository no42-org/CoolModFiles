import React from "react";
import styles from "./SourceTabs.module.scss";

type TabId = "random" | "library" | "local";

type SourceTabsProps = {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
  showLibrary: boolean;
};

function SourceTabs({ activeTab, onChange, showLibrary }: SourceTabsProps) {
  const tabs = (
    [
      { id: "random", label: "Random" },
      showLibrary && { id: "library", label: "Library" },
      { id: "local", label: "Local" },
    ] as Array<{ id: TabId; label: string } | false>
  ).filter((t): t is { id: TabId; label: string } => Boolean(t));

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
