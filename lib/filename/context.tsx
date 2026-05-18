/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * React context for the filename-style display preference.
 *
 * The Provider wraps Player's render tree (see components/Player.tsx).
 * Consumers (catalog rows in LibraryCatalog, LocalCatalog, and the three
 * ModArchive list components) call `useFilenameStyle()` to get a stable
 * `render` callback rather than importing toAmigaStyle directly — that
 * keeps the auto-mode pass-through branch hidden from call-site code.
 *
 * Consumers rendered outside the Provider (isolated tests, Storybook,
 * future refactors) get the default value: style="auto", pass-through
 * render, web-style renderPair. The hook does not throw — this is a
 * display preference, not a correctness invariant.
 *
 * Spec: openspec/changes/add-amiga-prefix-filenames/specs/filename-display/spec.md
 */

import React from "react";
import {
  toAmigaStyle,
  renderTfmxPairLabel,
  type FilenameStyle,
} from "./amiga-style";

export type FilenameStyleContextValue = {
  style: FilenameStyle;
  render: (name: string) => string;
  renderPair: (base: string) => string;
};

const DEFAULT_VALUE: FilenameStyleContextValue = {
  style: "auto",
  render: (name) => name,
  renderPair: (base) => renderTfmxPairLabel(base),
};

const FilenameStyleContext =
  React.createContext<FilenameStyleContextValue>(DEFAULT_VALUE);

export function FilenameStyleProvider({
  style,
  children,
}: {
  style: FilenameStyle;
  children: React.ReactNode;
}) {
  const value = React.useMemo<FilenameStyleContextValue>(
    () => ({
      style,
      render: (name: string) => {
        if (style === "amiga") return toAmigaStyle(name, "native");
        if (style === "amiga-all") return toAmigaStyle(name, "all");
        return name;
      },
      renderPair: (base: string) => renderTfmxPairLabel(base),
    }),
    [style],
  );
  return (
    <FilenameStyleContext.Provider value={value}>
      {children}
    </FilenameStyleContext.Provider>
  );
}

export function useFilenameStyle(): FilenameStyleContextValue {
  return React.useContext(FilenameStyleContext);
}
