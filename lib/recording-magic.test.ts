/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import {
  looksLikeOgg,
  looksLikeFlac,
  looksLikeMp3,
  mimeForBuffer,
} from "./recording-magic";

const OGG = [0x4f, 0x67, 0x67, 0x53];
const FLAC = [0x66, 0x4c, 0x61, 0x43];
const ID3 = [0x49, 0x44, 0x33];

function buf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

// Construct an ID3v2 header with the given tag body size in bytes,
// followed by `body` content padded to that size, optionally followed
// by trailing content (e.g. a signature past the tag).
function id3v2Wrap(bodySize: number, trailing: number[] = []): ArrayBuffer {
  const sizeBytes = [
    (bodySize >> 21) & 0x7f,
    (bodySize >> 14) & 0x7f,
    (bodySize >> 7) & 0x7f,
    bodySize & 0x7f,
  ];
  const header = [...ID3, 0x03, 0x00, 0x00, ...sizeBytes];
  const tagBody = new Array(bodySize).fill(0x00);
  return new Uint8Array([...header, ...tagBody, ...trailing]).buffer;
}

describe("looksLikeOgg", () => {
  it("returns true for OggS signature at offset 0", () => {
    expect(looksLikeOgg(buf(OGG))).toBe(true);
  });

  it("returns true for OggS past an ID3v2 tag", () => {
    // ID3v2 + 32-byte tag body + OggS
    expect(looksLikeOgg(id3v2Wrap(32, OGG))).toBe(true);
  });

  it("returns false for short buffer", () => {
    expect(looksLikeOgg(buf([0x4f, 0x67, 0x67]))).toBe(false);
  });

  it("returns false for non-OggS prefix", () => {
    expect(looksLikeOgg(buf([0x00, 0x00, 0x00, 0x00]))).toBe(false);
    expect(looksLikeOgg(buf(FLAC))).toBe(false);
  });

  it("accepts Uint8Array input", () => {
    expect(looksLikeOgg(new Uint8Array(OGG))).toBe(true);
  });
});

describe("looksLikeFlac", () => {
  it("returns true for fLaC signature at offset 0", () => {
    expect(looksLikeFlac(buf(FLAC))).toBe(true);
  });

  it("returns true for fLaC past an ID3v2 tag", () => {
    expect(looksLikeFlac(id3v2Wrap(64, FLAC))).toBe(true);
  });

  it("returns false for non-fLaC prefix", () => {
    expect(looksLikeFlac(buf(OGG))).toBe(false);
    expect(looksLikeFlac(buf([0x66, 0x4c, 0x61, 0x00]))).toBe(false);
  });

  it("returns false for short buffer", () => {
    expect(looksLikeFlac(buf([0x66, 0x4c, 0x61]))).toBe(false);
  });
});

describe("looksLikeMp3", () => {
  // MPEG-1 Layer III: byte 1 = 0b1111_1011 (version=11, layer=01, protect=1)
  const MP3_L3 = [0xff, 0xfb, 0x00, 0x00];
  // MPEG-1 Layer II: byte 1 = 0b1111_1101 (version=11, layer=10, protect=1)
  const MP2_L2 = [0xff, 0xfd, 0x00, 0x00];
  // MPEG-1 Layer I: byte 1 = 0b1111_1111 (version=11, layer=11, protect=1) — rejected
  const MP1_L1 = [0xff, 0xff, 0x00, 0x00];
  // Reserved layer: byte 1 = 0b1111_1001 (version=11, layer=00, protect=1) — rejected
  const RESERVED_LAYER = [0xff, 0xf9, 0x00, 0x00];
  // Reserved version: byte 1 = 0b1110_1011 (version=01, layer=01, protect=1) — rejected
  const RESERVED_VERSION = [0xff, 0xeb, 0x00, 0x00];

  it("returns true for Layer III frame sync", () => {
    expect(looksLikeMp3(buf(MP3_L3))).toBe(true);
  });

  it("returns true for Layer II frame sync (legacy MP2 in .mp3)", () => {
    expect(looksLikeMp3(buf(MP2_L2))).toBe(true);
  });

  it("returns false for Layer I", () => {
    expect(looksLikeMp3(buf(MP1_L1))).toBe(false);
  });

  it("returns false for reserved layer (0b00)", () => {
    expect(looksLikeMp3(buf(RESERVED_LAYER))).toBe(false);
  });

  it("returns false for reserved version (0b01)", () => {
    expect(looksLikeMp3(buf(RESERVED_VERSION))).toBe(false);
  });

  it("returns true for ID3v2 prefix with MP3 frame past tag", () => {
    expect(looksLikeMp3(id3v2Wrap(16, MP3_L3))).toBe(true);
  });

  it("returns true for ID3v2 prefix even with no valid frame past tag", () => {
    // ID3v2 prefix → looksLikeMp3 returns true unless FLAC/OGG past tag.
    // Caller relies on mimeForBuffer for the priority resolution.
    expect(looksLikeMp3(id3v2Wrap(8, [0x00, 0x00, 0x00, 0x00]))).toBe(true);
  });

  it("returns false for ID3v2 prefix with OGG past tag", () => {
    expect(looksLikeMp3(id3v2Wrap(8, OGG))).toBe(false);
  });

  it("returns false for ID3v2 prefix with FLAC past tag", () => {
    expect(looksLikeMp3(id3v2Wrap(8, FLAC))).toBe(false);
  });

  it("returns false for first byte not 0xFF", () => {
    expect(looksLikeMp3(buf([0xfe, 0xfb, 0x00, 0x00]))).toBe(false);
  });

  it("returns false for second byte top 3 bits != 111", () => {
    expect(looksLikeMp3(buf([0xff, 0x1b, 0x00, 0x00]))).toBe(false);
  });

  it("returns false for short buffer", () => {
    expect(looksLikeMp3(buf([0xff]))).toBe(false);
  });
});

describe("mimeForBuffer", () => {
  const MP3_L3 = [0xff, 0xfb, 0x00, 0x00];

  it("returns audio/ogg for bare OggS", () => {
    expect(mimeForBuffer(buf(OGG))).toBe("audio/ogg");
  });

  it("returns audio/flac for bare fLaC", () => {
    expect(mimeForBuffer(buf(FLAC))).toBe("audio/flac");
  });

  it("returns audio/mpeg for bare MP3 frame sync", () => {
    expect(mimeForBuffer(buf(MP3_L3))).toBe("audio/mpeg");
  });

  it("returns audio/flac for FLAC-with-ID3v2-prefix (not audio/mpeg)", () => {
    expect(mimeForBuffer(id3v2Wrap(32, FLAC))).toBe("audio/flac");
  });

  it("returns audio/ogg for OGG-with-ID3v2-prefix (not audio/mpeg)", () => {
    expect(mimeForBuffer(id3v2Wrap(32, OGG))).toBe("audio/ogg");
  });

  it("returns audio/mpeg for pure ID3v2 + MP3 frame (no FLAC/OGG past tag)", () => {
    expect(mimeForBuffer(id3v2Wrap(16, MP3_L3))).toBe("audio/mpeg");
  });

  it("returns audio/mpeg for ID3v2 prefix with no recognised signature past tag", () => {
    expect(mimeForBuffer(id3v2Wrap(8, [0x00, 0x00, 0x00, 0x00]))).toBe(
      "audio/mpeg"
    );
  });

  it("returns null for short buffer", () => {
    expect(mimeForBuffer(buf([0x00, 0x00]))).toBeNull();
  });

  it("returns null for ID3v2 header with non-syncsafe size byte", () => {
    // Top bit of one size byte set — malformed ID3v2, treat as not-ID3v2
    const bytes = [...ID3, 0x03, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00];
    // Without ID3v2 prefix, the first byte is 0x49 ('I'), no MP3 sync → null
    expect(mimeForBuffer(new Uint8Array(bytes).buffer)).toBeNull();
  });
});

describe("deep scan for MP3 with leading garbage", () => {
  // MPEG-1 Layer III frame: 0xFF 0xFB ... (valid version + Layer III)
  // The frame-byte-2 value 0x90 = bitrate 128kbps, sample rate 44.1kHz,
  // no padding, no private bit — produces a 417-byte frame.
  const FRAME_HEADER_4B = [0xff, 0xfb, 0x90, 0x44];

  // Construct N consecutive MP3 frames separated by a frame's worth
  // of zero padding (close enough to a real 128k/44.1k frame length
  // that our deep-scan heuristic matches).
  function mp3Stream(frameCount: number, frameLen: number = 417): number[] {
    const out: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      out.push(...FRAME_HEADER_4B);
      // Pad to frameLen bytes
      for (let j = FRAME_HEADER_4B.length; j < frameLen; j++) out.push(0x00);
    }
    return out;
  }

  it("matches MP3 stream with leading ASCII garbage", () => {
    // "dr.feelgood" then valid MP3 stream — mimics the user's file
    // that fails the strict-at-offset-0 check.
    const garbage = Array.from("dr.feelgood by xyz").map((c) =>
      c.charCodeAt(0)
    );
    const buf = new Uint8Array([...garbage, ...mp3Stream(3)]).buffer;
    expect(mimeForBuffer(buf)).toBe("audio/mpeg");
  });

  it("matches MP3 stream with leading zero padding", () => {
    const padding = new Array(1024).fill(0x00);
    const buf = new Uint8Array([...padding, ...mp3Stream(3)]).buffer;
    expect(mimeForBuffer(buf)).toBe("audio/mpeg");
  });

  it("matches MP3 stream with leading binary garbage", () => {
    const garbage = Array.from({ length: 100 }, (_, i) => (i * 7) & 0xfe);
    const buf = new Uint8Array([...garbage, ...mp3Stream(4)]).buffer;
    expect(mimeForBuffer(buf)).toBe("audio/mpeg");
  });

  it("does NOT match a single isolated 0xFF byte (insufficient matches)", () => {
    const buf = new Uint8Array(2048).fill(0x00);
    buf[100] = 0xff;
    buf[101] = 0xfb;
    expect(mimeForBuffer(buf.buffer)).toBeNull();
  });

  it("does NOT match two frame syncs more than 4 KB apart", () => {
    const buf = new Uint8Array(20000).fill(0x55);
    buf[100] = 0xff;
    buf[101] = 0xfb;
    buf[10000] = 0xff;
    buf[10001] = 0xfb;
    expect(mimeForBuffer(buf.buffer)).toBeNull();
  });

  it("does NOT match a libopenmpt format with random 0xFF bytes scattered", () => {
    // Construct a fake MOD-like header that happens to have a 0xFF byte.
    // 0xFF at offset 100 with byte 101 = 0xFB would otherwise look like
    // a Layer III frame sync. Place only one such occurrence — deep
    // scan requires MP3_DEEP_SCAN_MIN_MATCHES so this should not match.
    const buf = new Uint8Array(2048).fill(0x00);
    buf[0] = 0x4d; // 'M'
    buf[1] = 0x54; // 'T'
    buf[2] = 0x4d; // 'M'
    buf[3] = 0x10;
    buf[100] = 0xff;
    buf[101] = 0xfb;
    expect(mimeForBuffer(buf.buffer)).toBeNull();
  });
});

describe("false-positive sweep against libopenmpt format headers", () => {
  // For each libopenmpt-supported format, construct a representative
  // first-16-byte header and verify mimeForBuffer does NOT match.
  //
  // Sources for the headers:
  //   .mod (ProTracker): no fixed magic; signature at offset 1080 — first
  //                      16 bytes are part of the song title (ASCII or
  //                      zero). Test with a typical zero-padded title.
  //   .xm  : "Extended Module: " (17 chars)
  //   .it  : "IMPM"
  //   .s3m : "SCRM" at offset 44; first bytes are song title
  //   .stm : song title (20 bytes) — typical zero-padded
  //   .mtm : "MTM\x10"
  //   .669 : "if" or "JN" (magic ID)
  //   .med : "MMD0" / "MMD1" / "MMD2" / "MMD3"
  //   .okt : "OKTASONG"
  //   .ult : "MAS_UTrack_V00"
  //   .amf : "AMF" (Asylum) or "ASYLUM Music Format V1.0" / DSMI "AMF"
  //   .mptm: "IMPM" (same as IT, extension differs)
  const headers: Array<{ name: string; bytes: number[] }> = [
    {
      name: ".mod (zero-padded title)",
      bytes: [
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".xm (Extended Module: )",
      bytes: [
        0x45, 0x78, 0x74, 0x65, 0x6e, 0x64, 0x65, 0x64, 0x20, 0x4d, 0x6f, 0x64,
        0x75, 0x6c, 0x65, 0x3a,
      ],
    },
    {
      name: ".it (IMPM)",
      bytes: [
        0x49, 0x4d, 0x50, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".s3m (zero-padded title)",
      bytes: [
        0x53, 0x33, 0x4d, 0x20, 0x53, 0x6f, 0x6e, 0x67, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".mtm (MTM\\x10)",
      bytes: [
        0x4d, 0x54, 0x4d, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".669 (if magic)",
      bytes: [
        0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".669 (JN magic)",
      bytes: [
        0x4a, 0x4e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".med (MMD0)",
      bytes: [
        0x4d, 0x4d, 0x44, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".med (MMD3)",
      bytes: [
        0x4d, 0x4d, 0x44, 0x33, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".okt (OKTASONG)",
      bytes: [
        0x4f, 0x4b, 0x54, 0x41, 0x53, 0x4f, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
    {
      name: ".ult (MAS_UTrack_V00)",
      bytes: [
        0x4d, 0x41, 0x53, 0x5f, 0x55, 0x54, 0x72, 0x61, 0x63, 0x6b, 0x5f, 0x56,
        0x30, 0x30, 0x30, 0x00,
      ],
    },
    {
      name: ".amf (Asylum)",
      bytes: [
        0x41, 0x53, 0x59, 0x4c, 0x55, 0x4d, 0x20, 0x4d, 0x75, 0x73, 0x69, 0x63,
        0x20, 0x46, 0x6f, 0x72,
      ],
    },
    {
      name: ".amf (DSMI)",
      bytes: [
        0x41, 0x4d, 0x46, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ],
    },
  ];

  for (const { name, bytes } of headers) {
    it(`${name} does not match any recording MIME`, () => {
      expect(mimeForBuffer(new Uint8Array(bytes).buffer)).toBeNull();
    });
  }

  // AHX and THX are routed by their own engine before mimeForBuffer is
  // even called (per AudioPlayer.play() dispatch order), but verify
  // anyway that the recording sniff doesn't claim them.
  it("AHX header does not match any recording MIME", () => {
    const ahx = [0x41, 0x48, 0x58, 0x00, 0x00, 0x00, 0x00, 0x00];
    expect(mimeForBuffer(new Uint8Array(ahx).buffer)).toBeNull();
  });

  it("THX header does not match any recording MIME", () => {
    const thx = [0x54, 0x48, 0x58, 0x00, 0x00, 0x00, 0x00, 0x00];
    expect(mimeForBuffer(new Uint8Array(thx).buffer)).toBeNull();
  });
});
