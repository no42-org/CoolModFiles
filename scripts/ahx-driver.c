/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Null audio driver + ccall entry points for the ahx2play WASM build.
 *
 * ahx2play upstream expects an audio device that drains samples via a
 * callback (see audiodrivers/sdl/sdldriver.c for the SDL reference). In
 * a WebAudio context we have no device — the AudioWorkletProcessor pulls
 * frames from us on its own schedule via wasm_render(). So the four
 * driver hooks are no-ops:
 *
 *   lockMixer / unlockMixer  — host serialises render calls; no-op here.
 *   openMixer                — stashes freq+bufsize but does NOT open a
 *                              device; returns true so ahxInit's audio-
 *                              device check passes.
 *   closeMixer               — symmetric no-op.
 *
 * The ccall entry points (wasm_*) expose ahx2play's API to JS via
 * Emscripten's `cwrap`. They map 1:1 onto upstream symbols with two
 * notable wrappers:
 *
 *   wasm_load(data, length)  — drops the length arg (ahx2play's loader
 *                              doesn't need it; the format is self-
 *                              delimiting via internal pointers).
 *   wasm_render(buf, frames) — calls paulaOutputSamples directly so the
 *                              worklet can render into a stack buffer
 *                              without going through Emscripten's audio
 *                              callback plumbing.
 */

#include <stdint.h>
#include <stdbool.h>
#include "../vendor/ahx2play/replayer.h"
#include "ahx-driver.h"

/* Audio-driver hooks expected by paula.c / replayer.c.
 * The freq + bufsize are stashed but unused — paula.c reads them back
 * from its own audio_t state which ahxInit populates separately. */
static int32_t g_freq;
static int32_t g_bufsize;
static bool    g_open;

void lockMixer(void) {}
void unlockMixer(void) {}
bool openMixer(int32_t freq, int32_t bufsize) {
    g_freq = freq;
    g_bufsize = bufsize;
    g_open = true;
    return true;
}
void closeMixer(void) { g_open = false; }

/* paulaOutputSamples is paula.c's render function. Declared here so the
 * glue file does not need to drag in paula.h's preprocessor cascade. */
extern void paulaOutputSamples(int16_t *stream, int32_t numSamples);

/* ---------------------------------------------------------------------
 * ccall entry points
 * ------------------------------------------------------------------- */

/* Load an in-memory AHX/THX buffer. Returns 0 on success, ahx2play
 * error code (1..6) on failure. See ERR_* enum in replayer.h. */
int wasm_load(const uint8_t *data, int32_t length) {
    (void)length;
    bool ok = ahxLoadFromRAM(data);
    return ok ? 0 : ahxGetErrorCode();
}

/* Initialise the renderer. masterVol 0..256, stereoSep 0..100. */
int wasm_init(int32_t freq, int32_t bufsize, int32_t masterVol, int32_t stereoSep) {
    return ahxInit(freq, bufsize, masterVol, stereoSep) ? 0 : -1;
}

int wasm_play(int32_t subsong) { return ahxPlay(subsong) ? 0 : -1; }
void wasm_stop(void) { ahxStop(); }
void wasm_free(void) { ahxFree(); }
void wasm_close(void) { ahxClose(); }

/* Number of subsongs reported by ahx2play. NB: this is the count of
 * EXTRA subsongs beyond the implicit main song — the worklet should
 * expose (wasm_subsongs() + 1) as the user-visible count. */
int wasm_subsongs(void) { return (int)song.Subsongs; }

/* Render `frames` stereo int16 frames into outBuf (frames * 4 bytes). */
int wasm_render(int16_t *outBuf, int32_t frames) {
    paulaOutputSamples(outBuf, frames);
    return frames;
}

/* Song title (up to 255 chars). Caller reads via UTF8ToString. */
const char *wasm_song_name(void) { return song.Name; }

/* Format revision byte. 0 = AHX v1, 1 = AHX v2 / THX. */
int wasm_revision(void) { return (int)song.Revision; }

/* Live stereo-separation update. percentage 0..100, same scale as
 * libopenmpt. Forwarded by the AudioPlayer facade's setStereoSeparation
 * when the active engine is AHX. */
extern void paulaSetStereoSeparation(int32_t percentage);
void wasm_set_stereo_separation(int32_t percentage) {
    paulaSetStereoSeparation(percentage);
}
