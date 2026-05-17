#!/usr/bin/env bash
# Copyright 2026 Ronny Trommer <ronny@no42.org>
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Build public/libahx.worklet.js from vendor/ahx2play/.
#
# This is a manual build step — CI does not run it. The produced
# public/libahx.worklet.js is committed and travels with the repo.
# Re-run this script after bumping the vendored commit (update
# vendor/ahx2play/README.md at the same time).
#
# Compared to scripts/build-tfmx-wasm.sh this is much simpler:
#   - ahx2play has no autotools (3 .c files, build directly with emcc)
#   - ahxLoadFromRAM takes a raw buffer (no MEMFS / FORCE_FILESYSTEM)
#   - no library archive (.a) — link sources directly into the worklet
#
# Requirements (macOS):
#   brew install emscripten
# Requirements (Linux):
#   apt install emscripten   (or distro equivalent)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="${REPO_ROOT}/vendor/ahx2play"
OUT="${REPO_ROOT}/public/libahx.worklet.js"
DRIVER_C="${REPO_ROOT}/scripts/ahx-driver.c"
DRIVER_H="${REPO_ROOT}/scripts/ahx-driver.h"

# Parse args. --force is a no-op for ahx2play (the emcc step is single
# pass and idempotent — no stale autotools state to clean). Kept for
# parity with build-tfmx-wasm.sh's flag surface.
FORCE=0
for arg in "$@"; do
  case "${arg}" in
    --force|--force-regen) FORCE=1 ;;
    *) echo "warning: unknown arg '${arg}'" >&2 ;;
  esac
done

command -v emcc >/dev/null || { echo "error: emcc not found on PATH. brew install emscripten" >&2; exit 1; }
[ -d "${VENDOR}" ] || { echo "error: ${VENDOR} not found — vendor ahx2play first" >&2; exit 1; }
[ -f "${DRIVER_C}" ] || { echo "error: ${DRIVER_C} not found" >&2; exit 1; }

# Optional force-regen surface — currently a no-op but reserved so the
# Makefile and operator workflow can pass --force without conditional
# branching by engine.
if [ "${FORCE}" = "1" ]; then
  echo "==> --force noted (no autotools state to clean for ahx2play; build runs unconditionally)"
fi

# Build ahx2play sources + driver shim + glue into a single-file ES
# module suitable for AudioWorkletGlobalScope.
#
# Flag rationale (compare scripts/build-tfmx-wasm.sh):
#   -include scripts/ahx-driver.h
#       Force-includes the driver-function prototypes (lockMixer etc.)
#       on every vendored compile unit. paula.h's no-driver-defined
#       branch omits these prototypes, so without -include the vendored
#       sources fail to link. Avoids patching paula.h.
#   emcc, not em++
#       ahx2play is C99. em++ treats .c as C++ and the int16_t array
#       literals in replayer.c (values > 32767 like 0xE52F) trip the
#       C++11 narrowing-conversion check. emcc compiles as C and the
#       narrowing rules don't apply.
#   -sSINGLE_FILE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker
#       Same as the TFMX build: AudioWorklet has no fetch(), so the
#       .wasm must be base64-inlined into the .js as a single ES module.
#   (no -sFORCE_FILESYSTEM=1)
#       ahxLoadFromRAM takes a buffer pointer; no MEMFS needed. This is
#       the main reason the AHX bundle is ~14% the size of libtfmx.
#   (no --closure 1)
#       Same reasoning as build-tfmx-wasm.sh — closure mangles the FS
#       namespace AND drops un-referenced exports we ccall by name.
echo "==> emcc → ${OUT}"
emcc -Oz -DNDEBUG \
  -I "${VENDOR}" -include "${DRIVER_H}" \
  "${VENDOR}/replayer.c" \
  "${VENDOR}/loader.c" \
  "${VENDOR}/paula.c" \
  "${DRIVER_C}" \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createLibahx \
  -sSINGLE_FILE=1 \
  -sENVIRONMENT=worker \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","HEAP16","UTF8ToString"]' \
  -sEXPORTED_FUNCTIONS='["_wasm_load","_wasm_init","_wasm_play","_wasm_stop","_wasm_free","_wasm_close","_wasm_subsongs","_wasm_render","_wasm_song_name","_wasm_revision","_wasm_set_stereo_separation","_malloc","_free"]' \
  -o "${OUT}"

echo "==> done: $(wc -c <"${OUT}") bytes  →  ${OUT#${REPO_ROOT}/}"
