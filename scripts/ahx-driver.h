/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Forward-declares the four audio-driver functions ahx2play's paula.c /
 * replayer.c expect to find via its #ifdef AUDIODRIVER_* chain in paula.h.
 *
 * paula.h's no-driver-defined branch (the "Read audiodrivers/how_to_write
 * _drivers.txt" else) does NOT emit prototypes for these, so the vendored
 * .c files would fail to compile. We force-include this header on every
 * vendored compile unit via `-include scripts/ahx-driver.h` instead of
 * patching paula.h itself — keeps the vendored tree byte-identical to
 * upstream.
 */
#pragma once
#include <stdint.h>
#include <stdbool.h>

void lockMixer(void);
void unlockMixer(void);
bool openMixer(int32_t freq, int32_t bufsize);
void closeMixer(void);
