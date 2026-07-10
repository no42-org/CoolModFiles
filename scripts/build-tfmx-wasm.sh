#!/usr/bin/env bash
# Copyright 2026 Ronny Trommer <ronny@no42.org>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Build public/libtfmx.worklet.js from vendor/libtfmxaudiodecoder/.
#
# This is a manual build step — CI does not run it. The produced
# public/libtfmx.worklet.js is committed and travels with the repo.
# Re-run this script after bumping the vendored commit (update VENDORING.md
# at the same time).
#
# Requirements (macOS):
#   brew install emscripten libtool autoconf automake
# Requirements (Linux):
#   apt install emscripten libtool autoconf automake  (or distro equivalent)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="${REPO_ROOT}/vendor/libtfmxaudiodecoder"
OUT="${REPO_ROOT}/public/libtfmx.worklet.js"
DRIVER="${REPO_ROOT}/scripts/tfmx-driver.cpp"

command -v emcc >/dev/null || { echo "error: emcc not found on PATH. brew install emscripten" >&2; exit 1; }

# Use glibtoolize on macOS (Homebrew libtool ships it under that name); GNU
# libtoolize on Linux.
if command -v glibtoolize >/dev/null; then LIBTOOLIZE=glibtoolize
elif command -v libtoolize >/dev/null; then LIBTOOLIZE=libtoolize
else echo "error: libtoolize / glibtoolize not found. brew install libtool" >&2; exit 1
fi

cd "${VENDOR}"

# Regenerate autotools if configure isn't present. This keeps the vendored
# tree free of generated files (matching what `git archive` produced).
if [ ! -x ./configure ]; then
  echo "==> regenerating autotools"
  "${LIBTOOLIZE}" -i -c -f
  aclocal --force
  autoheader -f
  automake -a -c -f
  autoconf -f
fi

# Cross-compile configure under emcc.
if [ ! -f Makefile ]; then
  echo "==> emconfigure"
  emconfigure ./configure --disable-shared --enable-static
fi

echo "==> emmake (libtfmxaudiodecoder.a)"
emmake make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" \
  CXXFLAGS="-Oz -DNDEBUG" CFLAGS="-Oz -DNDEBUG"

# Link the static library + our driver into a single-file ES module suitable
# for AudioWorkletGlobalScope (which cannot fetch external resources).
#
# Flag rationale:
#   -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLibtfmx
#       Produce an ES module whose default export is a factory returning a
#       Promise<Module>. Matches the chiptune3 / libopenmpt pattern.
#       (NOT -sSINGLE_FILE) The .wasm is emitted as a SEPARATE file
#       (libtfmx.worklet.wasm), not inlined. Safari's AudioWorkletGlobalScope
#       hangs on emscripten's in-worklet async WASM instantiation — so the
#       MAIN thread fetches + WebAssembly.compile()s this .wasm and hands the
#       compiled WebAssembly.Module to the processor via processorOptions;
#       the worklet then does a synchronous `new WebAssembly.Instance` via an
#       instantiateWasm hook (see tfmx.worklet.js + ensureTfmx in
#       lib/audio-player.ts). This is the portable AudioWorklet+WASM pattern.
#   -sENVIRONMENT=worker
#       Strip web/node init code. The worklet runs in an audio worker.
#   -sFORCE_FILESYSTEM=1
#       libtfmx's load path goes through fopen on the music-data file and
#       auto-discovers the matching sample file via filename heuristics. We
#       use MEMFS to register both .tfx and .sam blobs as virtual files.
#   -sALLOW_MEMORY_GROWTH=1
#       Some TFMX modules need >16 MB at peak (large sample banks).
#   (closure compilation disabled)
#       --closure 1 mangles the FS namespace's inner method names even
#       when 'FS' is in EXPORTED_RUNTIME_METHODS, and the documented
#       FS_writeFile / FS_mkdir / FS_unlink aliases get stripped too.
#       Without closure, M.FS.writeFile(path, bytes) works as expected.
#       Bundle is ~15–25 KB larger un-closured; acceptable given the
#       worklet is lazy-loaded.
echo "==> em++ link → ${OUT}"
em++ -Oz -DNDEBUG \
  "${DRIVER}" \
  "${VENDOR}/src/.libs/libtfmxaudiodecoder.a" \
  -I "${VENDOR}/src" \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createLibtfmx \
  -sENVIRONMENT=worker \
  -sFORCE_FILESYSTEM=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap","FS","HEAPU8","HEAP16"]' \
  -o "${OUT}"

echo "==> done: $(wc -c <"${OUT}") bytes  →  ${OUT#${REPO_ROOT}/}"
