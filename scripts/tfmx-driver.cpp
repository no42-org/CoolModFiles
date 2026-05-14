/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Thin C wrapper around libtfmxaudiodecoder's public API. Compiled with the
 * vendored libtfmxaudiodecoder.a into a single-file Emscripten ES module
 * (public/libtfmx.worklet.js) that runs inside AudioWorkletGlobalScope.
 *
 * Functions are prefixed `tfx_` and exported via EMSCRIPTEN_KEEPALIVE so the
 * worklet can reach them via ccall. They map 1:1 to libtfmx's C API documented
 * in vendor/libtfmxaudiodecoder/src/tfmxaudiodecoder.h.
 *
 * tfx_malloc/tfx_free exist so the worklet can manage the PCM output buffer
 * without relying on auto-exported malloc/free (which closure compilation
 * strips when EXPORTED_FUNCTIONS doesn't name them).
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include "tfmxaudiodecoder.h"

extern "C" {

EMSCRIPTEN_KEEPALIVE void* tfx_new()                                  { return tfmxdec_new(); }
EMSCRIPTEN_KEEPALIVE void  tfx_delete(void* d)                        { tfmxdec_delete(d); }
EMSCRIPTEN_KEEPALIVE void  tfx_set_path(void* d, const char* p)       { tfmxdec_set_path(d, p); }
EMSCRIPTEN_KEEPALIVE int   tfx_reinit(void* d, int s)                 { return tfmxdec_reinit(d, s); }
EMSCRIPTEN_KEEPALIVE int   tfx_load(void* d, const char* p, int s)    { return tfmxdec_load(d, p, s); }
EMSCRIPTEN_KEEPALIVE void  tfx_mixer_init(void* d, int freq, int prec, int ch, int zero, int pan) {
    tfmxdec_mixer_init(d, freq, prec, ch, zero, pan);
}
EMSCRIPTEN_KEEPALIVE int      tfx_song_end(void* d)                   { return tfmxdec_song_end(d); }
EMSCRIPTEN_KEEPALIVE int      tfx_songs(void* d)                      { return tfmxdec_songs(d); }
EMSCRIPTEN_KEEPALIVE uint32_t tfx_duration(void* d)                   { return tfmxdec_duration(d); }
EMSCRIPTEN_KEEPALIVE void     tfx_seek(void* d, int32_t ms)           { tfmxdec_seek(d, ms); }
EMSCRIPTEN_KEEPALIVE const char* tfx_format_id(void* d)               { return tfmxdec_format_id(d); }
EMSCRIPTEN_KEEPALIVE const char* tfx_format_name(void* d)             { return tfmxdec_format_name(d); }
EMSCRIPTEN_KEEPALIVE void        tfx_buffer_fill(void* d, void* b, uint32_t l) { tfmxdec_buffer_fill(d, b, l); }
EMSCRIPTEN_KEEPALIVE const char* tfx_get_name(void* d)                { return tfmxdec_get_name(d); }
EMSCRIPTEN_KEEPALIVE void        tfx_set_loop_mode(void* d, int f)    { tfmxdec_set_loop_mode(d, f); }

EMSCRIPTEN_KEEPALIVE void* tfx_malloc(uint32_t sz)                    { return malloc(sz); }
EMSCRIPTEN_KEEPALIVE void  tfx_free(void* p)                          { free(p); }

}
