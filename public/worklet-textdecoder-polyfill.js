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
					continue
				}
				// Continuation-byte count claimed by the lead byte. 0x80–0xC1
				// (bare continuations and C0/C1 overlongs) and 0xF8–0xFF are
				// invalid leads.
				const n = c < 0xc2 ? -1 : c < 0xe0 ? 1 : c < 0xf0 ? 2 : c < 0xf8 ? 3 : -1
				// Validate the WHOLE sequence before consuming anything: every
				// continuation byte must exist and be 0b10xxxxxx. On violation,
				// emit U+FFFD for the lead byte alone and resynchronize at the
				// next byte — matching the native decoder. Never swallow valid
				// bytes: a Latin-1 title like "Läther" (4C E4 74 68 65 72) must
				// decode to "L�ther", not eat the 't' and 'h'.
				let ok = n > 0 && i + n <= b.length
				for (let j = 0; ok && j < n; j++) ok = (b[i + j] & 0xc0) === 0x80
				if (!ok) {
					s += '�'
					continue
				}
				let cp = c & (n === 1 ? 0x1f : n === 2 ? 0x0f : 0x07)
				for (let j = 0; j < n; j++) cp = (cp << 6) | (b[i + j] & 0x3f)
				i += n
				if (n === 3) {
					// Astral plane: reject overlong/out-of-range, else emit a
					// surrogate pair.
					if (cp < 0x10000 || cp > 0x10ffff) {
						s += '�'
						continue
					}
					const o = cp - 0x10000
					s += String.fromCharCode(0xd800 + (o >> 10), 0xdc00 + (o & 0x3ff))
				} else {
					// Reject UTF-8-encoded surrogate code points (CESU-8) so we
					// never emit lone surrogates.
					s += cp >= 0xd800 && cp <= 0xdfff
						? '�'
						: String.fromCharCode(cp)
				}
			}
			return s
		}
	}
}
