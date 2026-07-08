/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import {
  isTfmxSingleFile,
  tfmxSingleExt,
  isModuleFile,
  TFMX_SINGLE_EXTENSIONS,
} from "./index";

describe("isTfmxSingleFile / tfmxSingleExt", () => {
  it("matches every single-file libtfmx extension (case-insensitive)", () => {
    for (const ext of TFMX_SINGLE_EXTENSIONS) {
      expect(isTfmxSingleFile(`song${ext}`)).toBe(true);
      expect(isTfmxSingleFile(`SONG${ext.toUpperCase()}`)).toBe(true);
      expect(tfmxSingleExt(`song${ext}`)).toBe(ext);
    }
  });

  it("returns the correct ext for numbered Future Composer variants", () => {
    // `.fc14` must not be shadowed by `.fc` — endsWith(".fc") is false for
    // "song.fc14", so the specific extension is returned.
    expect(tfmxSingleExt("tune.fc14")).toBe(".fc14");
    expect(tfmxSingleExt("tune.fc13")).toBe(".fc13");
    expect(tfmxSingleExt("tune.fc")).toBe(".fc");
  });

  it("does NOT match pair-half or ambiguous extensions", () => {
    for (const name of [
      "song.tfx",
      "song.sam",
      "song.mdat", // ambiguous — stays pair-only per Decision 4
      "song.smpl",
      "song.tfm",
      "song.tfmx",
      "mdat.song",
    ]) {
      expect(isTfmxSingleFile(name)).toBe(false);
      expect(tfmxSingleExt(name)).toBeNull();
    }
  });

  it("does NOT match MOD / AHX / recording extensions", () => {
    for (const name of ["song.mod", "song.xm", "song.ahx", "song.mp3"]) {
      expect(isTfmxSingleFile(name)).toBe(false);
    }
  });

  it("single-file extensions are NOT part of isModuleFile (distinct engine)", () => {
    // Deliberately kept out of isModuleFile so they don't route to
    // libopenmpt/AHX/PCM at AudioPlayer.play() (design Decision 1).
    for (const ext of TFMX_SINGLE_EXTENSIONS) {
      expect(isModuleFile(`song${ext}`)).toBe(false);
    }
  });
});
