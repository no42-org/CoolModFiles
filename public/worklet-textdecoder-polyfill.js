/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * TextDecoder polyfill for AudioWorkletGlobalScope.
 *
 * The WHATWG Encoding spec exposes TextDecoder to `Window` and `Worker`
 * scopes only — NOT to worklets (https://encoding.spec.whatwg.org/
 * `[Exposed=(Window,Worker)] interface TextDecoder`). Firefox follows
 * the spec, so an AudioWorklet has no TextDecoder; Chrome exposes it
 * there as a non-standard extension, which is how the gap went
 * unnoticed during development.
 *
 * The Emscripten glue in libtfmx.worklet.js and libahx.worklet.js
 * contains an unguarded `var UTF8Decoder = new TextDecoder` inside the
 * module factory (modern Emscripten dropped the `typeof TextDecoder`
 * guard because Window/Worker always have it). In Firefox that throws
 * `ReferenceError: TextDecoder is not defined` during engine init and
 * every TFMX/AHX play fails — reported with a console screenshot in
 * https://github.com/no42-org/CoolModFiles/issues/89. The shipped
 * libopenmpt.worklet.js bundle avoids the same fate by carrying its own
 * TextDecoder replacement, which is the precedent this file follows.
 *
 * Import this module BEFORE the Emscripten glue module in each wrapper
 * worklet (ES module evaluation order is declaration order, and the
 * glue only touches TextDecoder inside the factory call, which runs
 * later still). Decode-only UTF-8 is all the glue needs: both bundles
 * construct exactly one no-argument `new TextDecoder` and only call
 * `.decode(Uint8Array)`; neither references TextEncoder or UTF-16.
 */

if (typeof TextDecoder === 'undefined') {
	globalThis.TextDecoder = class TextDecoder {
		decode(input) {
			if (!input) return ''
			const b = input instanceof Uint8Array
				? input
				: new Uint8Array(input.buffer || input)
			let s = ''
			let i = 0
			while (i < b.length) {
				const c = b[i++]
				if (c < 0x80) {
					s += String.fromCharCode(c)
				} else if (c < 0xe0) {
					s += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f))
				} else if (c < 0xf0) {
					s += String.fromCharCode(
						((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f)
					)
				} else {
					const cp =
						((c & 0x07) << 18) |
						((b[i++] & 0x3f) << 12) |
						((b[i++] & 0x3f) << 6) |
						(b[i++] & 0x3f)
					const o = cp - 0x10000
					s += String.fromCharCode(0xd800 + (o >> 10), 0xdc00 + (o & 0x3ff))
				}
			}
			return s
		}
	}
}
