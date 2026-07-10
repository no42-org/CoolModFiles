# Vendored: libtfmxaudiodecoder

Upstream: <https://github.com/mschwendt/libtfmxaudiodecoder>

Pinned commit: `a07d88609e7a714f01e03b37f6f6e08df22d6d8c` (2026-06-22, tag `1.0.14`)

This is a C++ audio decoder library for TFMX (Chris Hülsbeck "Pro" / Jochen Hippel), Chris Hülsbeck's **Dynamic Synthesizer** (his pre-TFMX format), and Future Composer file formats — the engine that powers CoolModFiles' TFMX playback path. It is GPL-2.0-or-later, which is compatible with this project's GPL-3.0 license.

## Why vendored

GPL distribution requires shipping the corresponding source for any binary we distribute. The compiled `.worklet.js` ships under `public/`; this directory carries the unmodified source it was built from. The pinned commit hash above is what `scripts/build-tfmx-wasm.sh` rebuilds against.

## What's modified

Nothing. The contents of this directory are an unmodified `git archive` of the upstream `a07d8860` tree (tag `1.0.14`), with two additions that are ours, not upstream's: this `VENDORING.md` and a `.gitignore` (upstream ships neither, and expects generated autotools output to be regenerated locally). License terms in `COPYING` and the per-file boilerplate apply unchanged.

## What the 1.0.7 → 1.0.14 bump brings

- **Dynamic Synthesizer decoder** (`src/Chris/DNS/`), new in 1.0.10 — Chris Hülsbeck's pre-TFMX format (`dns.`/`smp.` pairs; Hollywood Poker Pro, Starball, PTC).
- **Playback corrections** the prior pin (1.0.7) missed: the v1.0.9 fix for a v1.0.4 "loop mode" regression that shortened some song durations; click-removal and on-the-fly fixes for Z-Out, R-Type, Turrican II's loader jingle, Sledge Hammer One, A Prehistoric Tale; and TFMX Pro macros `$30`/`$31` (1.0.14) that enable Turrican III.
- The **public C API** (`src/tfmxaudiodecoder.h`) is unchanged except the version define, so the worklet's `ccall` bindings and the integration table below are unaffected. (Upstream's "rebuild for ABI changes" notes refer to the private C++ API, which we do not bind to; we recompile from source regardless.)

## How to rebuild the shipping `.worklet.js`

```sh
./scripts/build-tfmx-wasm.sh
```

The script regenerates autotools (requires `glibtoolize` from Homebrew `libtool` on macOS), cross-compiles under `emscripten` (>= 4.0; last built with 6.0.2), links a thin wrapper from `scripts/tfmx-driver.cpp`, and writes `public/libtfmx.worklet.js` (single-file ES module with the WASM embedded — required for `AudioWorkletGlobalScope`, which cannot `fetch`). 1.0.14's `configure.ac` requires a C++11 compiler (`AX_CXX_COMPILE_STDCXX([11])`) and an `m4/` macro dir, both satisfied by the regen step.

## License

GPL-2.0-or-later. See [`COPYING`](./COPYING). Each source file carries its own header confirming the "or later" grant.

## Upstream integration points referenced by our worklet

The public C API lives in [`src/tfmxaudiodecoder.h`](./src/tfmxaudiodecoder.h). The functions `public/tfmx.worklet.js` calls (via the thin wrapper in `scripts/tfmx-driver.cpp`):

| Function | Purpose |
|---|---|
| `tfmxdec_new` / `tfmxdec_delete` | decoder lifecycle |
| `tfmxdec_set_path` / `tfmxdec_load` | path-based load via MEMFS (sample bank auto-discovered) |
| `tfmxdec_init` / `tfmxdec_reinit` | select subsong (0-indexed) |
| `tfmxdec_songs` | subsong count |
| `tfmxdec_duration` | duration of current subsong in ms |
| `tfmxdec_seek` | seek to ms position |
| `tfmxdec_mixer_init` | configure mixer (sample rate, bit depth, channels, panning) |
| `tfmxdec_buffer_fill` | render N bytes of PCM into a destination buffer |
| `tfmxdec_song_end` | end-of-song flag |
| `tfmxdec_format_name` | metadata strings |
