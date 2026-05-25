/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import SpectrumAnalyzer, {
  STYLES,
  DEFAULT_STYLE,
  nextStyle,
  readAnalyzerStyle,
} from "./SpectrumAnalyzer";

describe("nextStyle", () => {
  it("cycles classic → led", () => {
    expect(nextStyle("classic")).toBe("led");
  });

  it("wraps led → classic", () => {
    expect(nextStyle("led")).toBe("classic");
  });

  it("exposes a stable STYLES array with both identifiers", () => {
    expect([...STYLES]).toEqual(["classic", "led"]);
  });

  it("DEFAULT_STYLE is classic", () => {
    expect(DEFAULT_STYLE).toBe("classic");
  });
});

// Lightweight in-memory localStorage shim. The default vitest env for this
// project is `node`, where neither `window` nor `localStorage` exist.
type Store = Record<string, string>;
function mockLocalStorage(initial: Store = {}) {
  const store: Store = { ...initial };
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

function withWindow(localStorage: Storage, body: () => void) {
  const g = globalThis as unknown as { window?: { localStorage: Storage } };
  const prev = g.window;
  g.window = { localStorage };
  try {
    body();
  } finally {
    g.window = prev;
  }
}

describe("readAnalyzerStyle", () => {
  it("returns the default when window is undefined (SSR)", () => {
    // No window stubbed → readAnalyzerStyle's SSR guard takes effect.
    expect(readAnalyzerStyle()).toBe("classic");
  });

  it("returns 'classic' when the key is unset", () => {
    withWindow(mockLocalStorage(), () => {
      expect(readAnalyzerStyle()).toBe("classic");
    });
  });

  it("returns 'led' when stored", () => {
    withWindow(mockLocalStorage({ "display.analyzerStyle": "led" }), () => {
      expect(readAnalyzerStyle()).toBe("led");
    });
  });

  it("returns 'classic' when stored", () => {
    withWindow(
      mockLocalStorage({ "display.analyzerStyle": "classic" }),
      () => {
        expect(readAnalyzerStyle()).toBe("classic");
      },
    );
  });

  it("falls back to default for an invalid value", () => {
    withWindow(
      mockLocalStorage({ "display.analyzerStyle": "sparkle" }),
      () => {
        expect(readAnalyzerStyle()).toBe("classic");
      },
    );
  });

  it("falls back to default for an empty string", () => {
    withWindow(mockLocalStorage({ "display.analyzerStyle": "" }), () => {
      expect(readAnalyzerStyle()).toBe("classic");
    });
  });

  it("falls back to default when localStorage.getItem throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("storage blocked");
      },
    } as unknown as Storage;
    withWindow(throwing, () => {
      expect(readAnalyzerStyle()).toBe("classic");
    });
  });
});

describe("SpectrumAnalyzer (SSR markup)", () => {
  // renderToString does not run effects, so no RAF, no ResizeObserver,
  // no interactive event firing. Click/keyboard cycling is covered by
  // the unit tests on nextStyle + readAnalyzerStyle + manual verification
  // in §6.3 and §6.6 of tasks.md.

  let prevRAF: typeof requestAnimationFrame;
  beforeEach(() => {
    prevRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (() => {
      throw new Error("requestAnimationFrame should not run during SSR");
    }) as typeof requestAnimationFrame;
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = prevRAF;
  });

  it("renders a canvas as an interactive button", () => {
    const html = renderToString(<SpectrumAnalyzer analyser={null} />);
    expect(html).toContain("<canvas");
    expect(html).toMatch(/role="button"/);
    expect(html).toMatch(/aria-label="Switch spectrum analyzer style"/);
    expect(html).toMatch(/tabindex="0"/);
    expect(html).toMatch(/title="Click to switch analyzer style"/);
  });

  it("does not mark the canvas aria-hidden anymore", () => {
    const html = renderToString(<SpectrumAnalyzer analyser={null} />);
    expect(html).not.toMatch(/aria-hidden/);
  });
});
