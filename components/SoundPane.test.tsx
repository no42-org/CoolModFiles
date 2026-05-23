/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  computeAmigaDisabled,
  computeAmigaHint,
  computeStereoDisabled,
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

  it("tfmx hint covers both Amiga emulation and stereo separation", () => {
    // The TFMX engine cannot honour mid-track stereo separation
    // changes (libtfmx's only stereo control is `tfx_mixer_init`'s
    // panning arg, applied once per track load). The hint signals
    // both limitations in one banner above the Amiga emulation
    // section.
    const txt = hintText("tfmx", undefined);
    expect(txt).toContain("Amiga emulation");
    expect(txt).toContain("stereo separation");
  });
});

describe("computeStereoDisabled", () => {
  it("no track loaded → slider live", () => {
    expect(computeStereoDisabled(undefined)).toBe(false);
  });

  it("libopenmpt → slider live", () => {
    expect(computeStereoDisabled("libopenmpt")).toBe(false);
  });

  it("ahx → slider live (ahx2play honours stereo natively)", () => {
    expect(computeStereoDisabled("ahx")).toBe(false);
  });

  it("tfmx → slider disabled (libtfmx only sets stereo at track load)", () => {
    expect(computeStereoDisabled("tfmx")).toBe(true);
  });
});
