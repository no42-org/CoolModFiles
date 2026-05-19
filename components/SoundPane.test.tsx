/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  computeAmigaDisabled,
  computeAmigaHint,
} from "./SoundPane";

describe("computeAmigaDisabled", () => {
  it("no track loaded → controls live (both undefined)", () => {
    expect(computeAmigaDisabled(undefined, undefined)).toBe(false);
  });

  it("libopenmpt + mod → enabled", () => {
    expect(computeAmigaDisabled("libopenmpt", "mod")).toBe(false);
  });

  it("libopenmpt + xm → disabled (the regression case)", () => {
    expect(computeAmigaDisabled("libopenmpt", "xm")).toBe(true);
  });

  it("libopenmpt + it → disabled", () => {
    expect(computeAmigaDisabled("libopenmpt", "it")).toBe(true);
  });

  it("libopenmpt + s3m → disabled", () => {
    expect(computeAmigaDisabled("libopenmpt", "s3m")).toBe(true);
  });

  it("libopenmpt + mptm → disabled", () => {
    expect(computeAmigaDisabled("libopenmpt", "mptm")).toBe(true);
  });

  it("ahx + anything → disabled", () => {
    expect(computeAmigaDisabled("ahx", "mod")).toBe(true);
    expect(computeAmigaDisabled("ahx", undefined)).toBe(true);
  });

  it("tfmx + anything → disabled", () => {
    expect(computeAmigaDisabled("tfmx", "mod")).toBe(true);
    expect(computeAmigaDisabled("tfmx", undefined)).toBe(true);
  });

  it("undefined engine + mod → enabled (type alone is sufficient for MOD)", () => {
    expect(computeAmigaDisabled(undefined, "mod")).toBe(false);
  });

  it("undefined engine + xm → disabled (type alone is sufficient to disable)", () => {
    expect(computeAmigaDisabled(undefined, "xm")).toBe(true);
  });

  it("libopenmpt + uppercase MOD → enabled (case-insensitive compare)", () => {
    expect(computeAmigaDisabled("libopenmpt", "MOD")).toBe(false);
  });
});

describe("computeAmigaHint", () => {
  function hintText(
    engine: Parameters<typeof computeAmigaHint>[0],
    type: Parameters<typeof computeAmigaHint>[1],
  ): string {
    const h = computeAmigaHint(engine, type);
    if (!h) return "";
    return renderToString(<>{h.copy}</>);
  }

  it("no track → no hint", () => {
    expect(computeAmigaHint(undefined, undefined)).toBeNull();
  });

  it("libopenmpt + mod → no hint", () => {
    expect(computeAmigaHint("libopenmpt", "mod")).toBeNull();
  });

  it("ahx engine → ahx2play copy", () => {
    expect(hintText("ahx", undefined)).toContain("ahx2play");
    expect(hintText("ahx", "mod")).toContain("Paula model");
  });

  it("tfmx engine → libtfmx copy", () => {
    expect(hintText("tfmx", undefined)).toContain("libtfmx");
    expect(hintText("tfmx", "mod")).toContain("playback engine");
  });

  it("libopenmpt + xm → format-specific copy with type echoed", () => {
    const txt = hintText("libopenmpt", "xm");
    expect(txt).toContain("classic MOD files");
    expect(txt).toContain("<code>xm</code>");
  });

  it("libopenmpt + it → format-specific copy with type echoed", () => {
    const txt = hintText("libopenmpt", "it");
    expect(txt).toContain("<code>it</code>");
  });

  it("libopenmpt + UPPERCASE → type lower-cased in hint", () => {
    const txt = hintText("libopenmpt", "XM");
    expect(txt).toContain("<code>xm</code>");
  });

  it("engine takes precedence over format-specific hint", () => {
    // AHX/TFMX engines never report MOD type, but if they did the
    // engine-specific copy still wins.
    expect(hintText("ahx", "xm")).toContain("ahx2play");
    expect(hintText("tfmx", "xm")).toContain("libtfmx");
  });
});
