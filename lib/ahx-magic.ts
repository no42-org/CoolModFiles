/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AHX/THX magic-byte sniff. Extracted from lib/audio-player.ts so it
 * can be unit-tested in isolation — audio-player.ts depends on the
 * ChiptuneJsPlayer ambient global (registered via the public/chiptune3.js
 * script tag) and isn't importable in a Node test runtime.
 *
 * The 4-byte gate (3-letter prefix + version-byte allowlist) is the
 * canonical implementation per design.md D4 in
 * openspec/changes/add-ahx-playback/. components/Player.tsx's
 * `sniffDownloadExtension` mirrors the same logic for Blob inputs at
 * download time — keep the two in sync if D4 ever widens (e.g. AHX v2
 * introducing version byte 0x02).
 */

/**
 * Returns true iff the input is an `ArrayBuffer` whose first 4 bytes are:
 *  - bytes 0-2: ASCII "AHX" (0x41 0x48 0x58) OR ASCII "THX" (0x54 0x48 0x58)
 *  - byte 3   : 0x00 (AHX v1.00–1.27) or 0x01 (AHX v2.0+)
 *
 * Accepts `unknown` so non-ArrayBuffer inputs (TfmxPair shapes, plain
 * objects, null) return false cleanly. Type-narrowing predicate so
 * callers can use it in `if (looksLikeAhx(x)) { /* x: ArrayBuffer *\/ }`.
 *
 * Bare 3-letter ASCII trigrams are weak discriminators on their own —
 * a MOD/S3M/STM file with a song-title field starting "AHX" or "THX"
 * zero-padded would pass a naïve 3-byte check. The version-byte
 * allowlist eliminates a meaningful slice of false positives. Surviving
 * false positives (AHX-shaped header on non-AHX payload) are handled
 * by the AHX engine's load step — the worklet emits `{cmd:'err',val:'ptr'}`
 * and the source-type-aware error path recovers.
 */
export function looksLikeAhx(input: unknown): input is ArrayBuffer {
  if (!(input instanceof ArrayBuffer)) return false;
  if (input.byteLength < 4) return false;
  const v = new Uint8Array(input, 0, 4);
  const prefixMatches =
    (v[0] === 0x41 && v[1] === 0x48 && v[2] === 0x58) ||
    (v[0] === 0x54 && v[1] === 0x48 && v[2] === 0x58);
  if (!prefixMatches) return false;
  return v[3] === 0x00 || v[3] === 0x01;
}
