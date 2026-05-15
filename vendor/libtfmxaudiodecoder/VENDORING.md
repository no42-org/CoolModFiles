# Vendored: libtfmxaudiodecoder

Upstream: <https://github.com/mschwendt/libtfmxaudiodecoder>

Pinned commit: `7605525ae773d42b23d1fef50e00afd440920d85` (2026-05-13, tag `v1.0.7`)

This is a C++ audio decoder library for TFMX (Chris Hülsbeck "Pro" / Jochen Hippel) and Future Composer file formats — the engine that powers CoolModFiles' TFMX playback path. It is GPL-2.0-or-later, which is compatible with this project's GPL-3.0 license.

## Why vendored

GPL distribution requires shipping the corresponding source for any binary we distribute. The compiled `.worklet.js` ships under `public/`; this directory carries the unmodified source it was built from. The pinned commit hash above is what `scripts/build-tfmx-wasm.sh` rebuilds against.

## What's modified

Nothing. The contents of this directory are an unmodified `git archive` of the upstream `7605525a` tree. License terms in `COPYING` and the per-file boilerplate apply unchanged.

## How to rebuild the shipping `.worklet.js`

```sh
./scripts/build-tfmx-wasm.sh
```

The script regenerates autotools (requires `glibtoolize` from Homebrew `libtool` on macOS), cross-compiles under `emscripten` (>= 4.0), links a thin wrapper from `scripts/tfmx-driver.cpp`, and writes `public/libtfmx.worklet.js` (single-file ES module with the WASM embedded — required for `AudioWorkletGlobalScope`, which cannot `fetch`).

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
