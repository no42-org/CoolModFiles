# ahx2play (vendored)

Olav Sørensen's accurate AHX/THX replayer, vendored for the CoolModFiles
AHX engine.

| Field | Value |
| --- | --- |
| Upstream | <https://github.com/8bitbubsy/ahx2play> |
| Commit | `7620a9f94682bd096a8d8d45005f67a772724336` (default branch `main`, 2024-01-06) |
| License | BSD-3-Clause (see [LICENSE](./LICENSE)) |
| Copyright | © 2021–2024 Olav Sørensen |

## What's here vs upstream

This directory holds the **unmodified** core replayer source from
upstream's repository root:

- `replayer.c` / `replayer.h` — replayer state machine, song struct, public API
- `loader.c` — AHX file parser (`ahxLoadFromRAM` takes a raw buffer, no FS needed)
- `paula.c` / `paula.h` — Paula chip emulation (sample synthesis, mixing)

Upstream also ships an `ahx2play/` test application and an
`audiodrivers/` directory (SDL2 / winmm). Neither is needed for the
WebAudio build — the worklet replaces them with a null audio driver in
[`scripts/ahx-driver.c`](../../scripts/ahx-driver.c) (no audio device;
the host pulls PCM frames via `wasm_render`).

## Building

The single source of truth for building this engine is
[`scripts/build-ahx-wasm.sh`](../../scripts/build-ahx-wasm.sh). Run it
after bumping the vendored commit:

```sh
bash scripts/build-ahx-wasm.sh
```

Output: `public/libahx.worklet.js` — a single-file ES module suitable
for `AudioWorkletGlobalScope` (WASM is base64-inlined; no fetch needed
at runtime).

CI does not run this script; the built `libahx.worklet.js` is committed
and travels with the repo.

## License compliance

BSD-3-Clause requires retaining the copyright notice and disclaimer in
both source and binary distributions. The unmodified [LICENSE](./LICENSE)
satisfies the source-form requirement; the binary-form requirement is
satisfied by the build script emitting the BSD attribution string in
the worklet's preamble comment.

The CoolModFiles project as a whole remains licensed under
GPL-3.0-or-later (see the root `LICENSE` of the repository); the
vendored ahx2play source remains under its own BSD-3-Clause license.
BSD-3 is FSF-listed as GPL-compatible.
