/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { recordingMime, library, local, modArchive } from "./index";

// recordingMime only reads the source's filename, so a minimal File stub
// (just `.name`) is enough for the local-source cases.
const file = (name: string): File => ({ name }) as unknown as File;

describe("recordingMime — source-authoritative recording routing", () => {
  it("classifies Library recordings by path extension", () => {
    expect(recordingMime(library("dir/Micro Machines - MD0.mp3"))).toBe(
      "audio/mpeg"
    );
    expect(recordingMime(library("x.ogg"))).toBe("audio/ogg");
    expect(recordingMime(library("x.flac"))).toBe("audio/flac");
  });

  it("returns null for a Library tracker module (routes to libopenmpt, not PCM)", () => {
    // The regression: a real .mod from Library must NOT be treated as a
    // recording. It plays through libopenmpt; only recordings hit the
    // <audio>/PCM path.
    expect(recordingMime(library("Misc/ChipTune.A-F/Alien.mod"))).toBeNull();
    expect(recordingMime(library("x.xm"))).toBeNull();
  });

  it("classifies Local recordings by file name and modules as null", () => {
    expect(recordingMime(local(file("rec.flac")))).toBe("audio/flac");
    expect(recordingMime(local(file("4mat_VI.mod")))).toBeNull();
  });

  it("never treats Mod Archive as a recording", () => {
    expect(recordingMime(modArchive(12345))).toBeNull();
  });
});
