/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Magic-byte sniffs for PCM recordings (OGG / FLAC / MP3) used by the
 * PCM engine arm in lib/audio-player.ts to recognise recordings of
 * lost tracker modules. Extracted to its own file so it can be unit-
 * tested without dragging the audio-player module's ambient dependencies.
 *
 * Dispatch order in mimeForBuffer: ID3v2 prefix is parsed first and the
 * post-tag bytes are re-tested against OGG and FLAC predicates — this
 * prevents FLAC/OGG files that carry an ID3v2 prefix (for player-
 * compatibility reasons) from misrouting as MP3.
 *
 * Canonical implementation per design.md D2 in
 * openspec/changes/add-lost-module-recordings/. components/Player.tsx's
 * sniffDownloadExtension mirrors this logic for Blob inputs at download
 * time — keep the two in sync if D2 ever widens.
 */

type MimeType = "audio/mpeg" | "audio/ogg" | "audio/flac";

function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/**
 * If `bytes` starts with a valid ID3v2 header, returns the byte offset
 * immediately after the tag. Returns null if no ID3v2 prefix is present
 * or if the header is malformed.
 *
 * ID3v2 header layout (10 bytes):
 *   bytes 0-2: "ID3"
 *   byte  3  : major version (we accept any: 0x02, 0x03, 0x04)
 *   byte  4  : revision (unused)
 *   byte  5  : flags
 *   bytes 6-9: syncsafe size — 4 bytes, each carrying 7 significant bits.
 *              The most-significant bit of each is zero (the "syncsafe"
 *              property avoids collision with MP3 frame sync). Total
 *              tag size (excluding the 10-byte header) = sum of:
 *                (b6 & 0x7f) << 21 | (b7 & 0x7f) << 14 |
 *                (b8 & 0x7f) <<  7 | (b9 & 0x7f)
 */
function id3v2BodyOffset(bytes: Uint8Array): number | null {
  if (bytes.length < 10) return null;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
  const b6 = bytes[6];
  const b7 = bytes[7];
  const b8 = bytes[8];
  const b9 = bytes[9];
  // syncsafe: top bit of each size byte MUST be zero
  if ((b6 | b7 | b8 | b9) & 0x80) return null;
  const tagSize =
    ((b6 & 0x7f) << 21) |
    ((b7 & 0x7f) << 14) |
    ((b8 & 0x7f) << 7) |
    (b9 & 0x7f);
  return 10 + tagSize;
}

function startsWith(bytes: Uint8Array, offset: number, sig: number[]): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** True iff bytes at `offset` are ASCII "OggS" (0x4f 0x67 0x67 0x53). */
function isOggAt(bytes: Uint8Array, offset: number): boolean {
  return startsWith(bytes, offset, [0x4f, 0x67, 0x67, 0x53]);
}

/** True iff bytes at `offset` are ASCII "fLaC" (0x66 0x4c 0x61 0x43). */
function isFlacAt(bytes: Uint8Array, offset: number): boolean {
  return startsWith(bytes, offset, [0x66, 0x4c, 0x61, 0x43]);
}

/**
 * MP3 frame-sync sniff. MP3 frame header byte layout (ISO/IEC 11172-3):
 *
 *   byte 0:  1111 1111             (8 sync bits)
 *   byte 1:  111V VLLP
 *            ||| || ||
 *            ||| || |+-- protection (ignored by sniff)
 *            ||| || +--- layer bits (LL): 01=Layer III, 10=Layer II,
 *            ||| ||                       11=Layer I, 00=reserved
 *            ||| ++----- version bits (VV): 11=MPEG-1, 10=MPEG-2,
 *            |||                            00=MPEG-2.5, 01=reserved
 *            +++-------- 3 more sync bits (111)
 *
 * Layer III (MP3) and Layer II (MP2) are both accepted because legacy
 * archival rescues sometimes carry MP2 payloads with .mp3 extensions.
 * Layer I and the reserved layer value are rejected.
 */
function looksLikeMp3FrameSync(bytes: Uint8Array, offset: number): boolean {
  if (bytes.length < offset + 2) return false;
  if (bytes[offset] !== 0xff) return false;
  const b1 = bytes[offset + 1];
  // Top 3 bits must be 111 (frame-sync continuation)
  if ((b1 & 0xe0) !== 0xe0) return false;
  const version = (b1 >> 3) & 0x03;
  // Reject reserved version 01
  if (version === 0x01) return false;
  const layer = (b1 >> 1) & 0x03;
  // Accept Layer III (0b01) and Layer II (0b10); reject Layer I (0b11)
  // and reserved (0b00)
  if (layer !== 0x01 && layer !== 0x02) return false;
  return true;
}

/** True iff the input looks like an OGG file (including OGG-with-ID3v2-prefix). */
export function looksLikeOgg(input: ArrayBuffer | Uint8Array): boolean {
  if (input.byteLength < 4) return false;
  const bytes = asBytes(input);
  if (isOggAt(bytes, 0)) return true;
  const after = id3v2BodyOffset(bytes);
  return after !== null && isOggAt(bytes, after);
}

/** True iff the input looks like a FLAC file (including FLAC-with-ID3v2-prefix). */
export function looksLikeFlac(input: ArrayBuffer | Uint8Array): boolean {
  if (input.byteLength < 4) return false;
  const bytes = asBytes(input);
  if (isFlacAt(bytes, 0)) return true;
  const after = id3v2BodyOffset(bytes);
  return after !== null && isFlacAt(bytes, after);
}

/**
 * True iff the input looks like an MP3 file.
 *
 * Matches if:
 *   (a) buffer starts with an ID3v2 tag AND no FLAC/OGG signature is
 *       found past the tag, OR
 *   (b) buffer matches the MP3 frame-sync rule at offset 0.
 *
 * Note: callers should prefer `mimeForBuffer` over this predicate
 * directly when the buffer might be FLAC/OGG with an ID3v2 prefix —
 * `mimeForBuffer` does the priority resolution.
 */
export function looksLikeMp3(input: ArrayBuffer | Uint8Array): boolean {
  if (input.byteLength < 4) return false;
  const bytes = asBytes(input);
  const id3End = id3v2BodyOffset(bytes);
  if (id3End !== null) {
    // ID3v2 prefix present: only an MP3 match if FLAC/OGG don't sit past it
    if (isOggAt(bytes, id3End) || isFlacAt(bytes, id3End)) return false;
    return true;
  }
  return looksLikeMp3FrameSync(bytes, 0);
}

/**
 * Returns the MIME type for a recording buffer, or null if the buffer
 * doesn't look like a recording. Priority:
 *   1. ID3v2 prefix → peek past tag, test OGG/FLAC. If matched, return
 *      "audio/ogg" / "audio/flac". Otherwise treat as MP3.
 *   2. Bare OGG signature → "audio/ogg".
 *   3. Bare FLAC signature → "audio/flac".
 *   4. MP3 frame sync at offset 0 → "audio/mpeg".
 *   5. None of the above → null (caller falls through to libopenmpt).
 */
export function mimeForBuffer(
  input: ArrayBuffer | Uint8Array
): MimeType | null {
  if (input.byteLength < 4) return null;
  const bytes = asBytes(input);
  const id3End = id3v2BodyOffset(bytes);
  if (id3End !== null) {
    if (isOggAt(bytes, id3End)) return "audio/ogg";
    if (isFlacAt(bytes, id3End)) return "audio/flac";
    return "audio/mpeg";
  }
  if (isOggAt(bytes, 0)) return "audio/ogg";
  if (isFlacAt(bytes, 0)) return "audio/flac";
  if (looksLikeMp3FrameSync(bytes, 0)) return "audio/mpeg";
  return null;
}
