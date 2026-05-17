/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AudioWorkletProcessor for AHX/THX playback via ahx2play.
 * Registered as 'ahx-processor', structurally parallel to
 * 'tfmx-processor' (public/tfmx.worklet.js) and 'libopenmpt-processor'
 * (chiptune3.worklet.js). Outbound messages (cmd: meta / pos / end / err /
 * stopped) match the existing vocabulary so the AudioPlayer facade can
 * dispatch by source kind without engine-aware branching in Player.tsx.
 *
 * Single-buffer load: AHX files are self-contained (synth-based, no
 * sample bank). ahx2play's ahxLoadFromRAM takes the buffer pointer
 * directly — no MEMFS, no FORCE_FILESYSTEM, no per-file FS dance.
 */

import createLibahx from './libahx.worklet.js'

// Module instance (ahx2play Emscripten Module). Populated asynchronously.
let M
let initFailed = false
// Live AHX instances. Used by the init .then to drain each instance's
// pendingPlay, and by the .catch to surface init failure as an 'err'
// event on any instance that's currently waiting on M.
const ahxInstances = new Set()

createLibahx()
	.then(mod => {
		M = mod
		// ahx2play's ahxInit allocates the synth wave tables (~200 KB) and
		// must run BEFORE any load. It's idempotent for the wave-table
		// allocation but writes audio_t state, so we call it once at module
		// init with the worklet's actual sampleRate. Subsequent per-play
		// work is load + play; init is not repeated.
		//
		// masterVol=256 (full) — facade controls volume via shared GainNode.
		// stereoSeparation=100 — full stereo by default; facade forwards
		// user-adjusted values via cmd:'setStereoSeparation'.
		const initRc = M.ccall('wasm_init', 'number',
			['number', 'number', 'number', 'number'],
			[sampleRate, 1024, 256, 100])
		if (initRc !== 0) {
			initFailed = true
			console.error('[ahx-processor] wasm_init failed:', initRc)
			for (const proc of ahxInstances) {
				if (proc.pendingPlay) {
					proc.pendingPlay = null
					proc.port.postMessage({ cmd: 'err', val: 'ptr' })
				}
			}
			return
		}
		for (const proc of ahxInstances) {
			if (proc.pendingPlay) {
				const val = proc.pendingPlay
				proc.pendingPlay = null
				proc._play(val)
			}
		}
	})
	.catch(e => {
		console.error('[ahx-processor] init failed', e)
		initFailed = true
		for (const proc of ahxInstances) {
			if (proc.pendingPlay) {
				proc.pendingPlay = null
				proc.port.postMessage({ cmd: 'err', val: 'ptr' })
			}
		}
	})


class AHX extends AudioWorkletProcessor {
	constructor() {
		super()
		this.port.onmessage = this.handleMessage_.bind(this)
		this.paused = false
		// Kept for facade parity with libopenmpt-processor and tfmx-processor;
		// AudioPlayer posts {cmd:'config'} once after creation regardless of
		// engine.
		this.config = {
			repeatCount: -1,
			stereoSeparation: 100,
			interpolationFilter: 0,
		}
		this.loaded = false       // ahx2play state — only one song at a time
		this.pcmPtr = 0           // PCM scratch in HEAPU8 (int16 interleaved)
		this.pcmFrames = 0        // size of pcmPtr in frames
		this.numSubsongs = 1      // wasm_subsongs() + 1 (count of EXTRA + the implicit main song)
		this.songIndex = 0
		this.currentMs = 0
		this.songName = ''
		this.revision = 0
		// Throttle pos messages to ~20 Hz, same as tfmx.worklet.js. process()
		// runs every 128 frames (~2.7 ms @ 48 kHz = ~375 Hz); without this
		// we'd flood the main thread with useless pos messages.
		this.lastPostedMs = -1
		// Per-instance queued play, used when _play is called before M is
		// ready. Drained from the module-level createLibahx().then handler.
		this.pendingPlay = null
		ahxInstances.add(this)
	}

	process(inputList, outputList, parameters) {
		if (!M || !this.loaded || this.paused) return true

		const left = outputList[0][0]
		const right = outputList[0][1]
		const frames = left.length

		// Reallocate the PCM scratch if frames-per-block changed (it doesn't
		// in practice — 128 — but cheap to guard).
		if (this.pcmFrames < frames) {
			if (this.pcmPtr) M._free(this.pcmPtr)
			this.pcmPtr = M._malloc(frames * 2 * 2)
			this.pcmFrames = frames
		}

		// Ask ahx2play for `frames` interleaved s16 stereo samples.
		// wasm_render forwards to paulaOutputSamples which fills the buffer.
		M.ccall('wasm_render', 'number', ['number', 'number'],
			[this.pcmPtr, frames])

		// Convert int16 interleaved → float32 planar L/R. pcmPtr is byte-
		// aligned to 16-bit (malloc returns 8-byte aligned), so HEAP16
		// indexing at pcmPtr/2 is safe.
		const i16Start = this.pcmPtr >> 1
		const i16 = M.HEAP16
		for (let i = 0; i < frames; i++) {
			left[i]  = i16[i16Start + (i << 1)]     / 32768
			right[i] = i16[i16Start + (i << 1) + 1] / 32768
		}

		// Advance our position counter. ahx2play has no get-position-in-ms
		// API (and no get-duration either), so we synthesise from frames
		// rendered. End-of-song detection is a Phase 1 follow-up — for now
		// the song plays until the user navigates away. Looping is the
		// default ahxPlay behaviour, so most songs loop forever naturally.
		this.currentMs += (frames * 1000) / sampleRate

		// Throttle to ~20 Hz: only post when we've advanced ≥50 ms since the
		// last message. Player.tsx polls duration/currentTime every 500 ms,
		// so anything faster than 20 Hz is invisible to the UI.
		if (this.currentMs - this.lastPostedMs >= 50) {
			this.port.postMessage({
				cmd: 'pos',
				pos: this.currentMs / 1000,
				order: 0,
				pattern: 0,
				row: 0,
			})
			this.lastPostedMs = this.currentMs
		}

		return true
	}

	handleMessage_(msg) {
		const v = msg.data.val
		switch (msg.data.cmd) {
			case 'config':
				// Shallow-merge: an incoming partial config (e.g. just
				// {repeatCount}) must not erase the defaults set in the
				// constructor.
				this.config = { ...this.config, ...v }
				break
			case 'play':
				this._play(v)
				break
			case 'pause':
				this.paused = true
				break
			case 'unpause':
				this.paused = false
				break
			case 'togglePause':
				this.paused = !this.paused
				break
			case 'stop':
				this._stop()
				// Ack the stop back to the facade so cross-engine play() can
				// wait until the audio thread has actually applied the stop
				// (loaded=false → process() returns silence) before starting
				// the next engine. Same handshake as tfmx.worklet.js.
				this.port.postMessage({ cmd: 'stopped' })
				break
			case 'meta':
				this._meta()
				break
			case 'selectSubsong':
				if (!this.loaded) break
				{
					// numSubsongs = wasm_subsongs() + 1 per the spike memo:
					// song.Subsongs is the count of EXTRA subsongs beyond
					// the implicit main song. ahx2play's ahxPlay(subsong)
					// accepts the inclusive range [0..song.Subsongs] —
					// 0 = the implicit main song, 1..N = extras — so
					// numSubsongs is also the count of valid picker
					// indices. Defensive clamp here mirrors Player.tsx's
					// `idx < count` gate on handleSubsongChange and turns
					// a coincidental invariant into a guarantee.
					if (typeof v !== 'number' || v < 0 || v >= this.numSubsongs) break
					const rc = M.ccall('wasm_play', 'number', ['number'], [v])
					if (rc === 0) {
						this.songIndex = v
						this.currentMs = 0
						this.lastPostedMs = -1
						this._meta()
					}
				}
				break
			case 'setStereoSeparation':
				// AHX engine implements stereo separation natively at the
				// same 0..100 percentage scale as libopenmpt. Forwarded by
				// the AudioPlayer facade per design.md D9 (refactored 2026-05-17
				// post-Phase-0 spike).
				this.config.stereoSeparation = v
				if (M) {
					M.ccall('wasm_set_stereo_separation', null, ['number'], [v])
				}
				break
			case 'repeatCount':
				this.config.repeatCount = v
				break
			// Accepted-silently for facade parity. ahx2play has no equivalents:
			//   setCtl                   — libopenmpt ctl_set; no AHX analog.
			//   setPitch / setTempo      — would require resampler hooks not
			//                              exposed by ahx2play.
			//   setOrderRow              — libopenmpt-specific.
			//   setPos                   — ahx2play has no seek; D9 / tasks
			//                              note seek is a Phase 1 follow-up.
			case 'setCtl':
			case 'setPitch':
			case 'setTempo':
			case 'setOrderRow':
			case 'setPos':
				break
			default:
				console.log('[ahx-processor] unknown message', msg.data)
		}
	}

	_play(val) {
		// If the engine failed to initialise, fail this play immediately so
		// the facade's onError → playNext path can recover.
		if (initFailed) {
			this.port.postMessage({ cmd: 'err', val: 'ptr' })
			return
		}
		// Defer until M is ready. createLibahx's .then drains pendingPlay.
		if (!M) {
			this.pendingPlay = val
			return
		}
		this.pendingPlay = null
		this._stop()
		this.paused = false

		// AudioPlayer.play() posts the buffer as ArrayBuffer (structured
		// clone preserves the type). Wrap as Uint8Array to copy into the
		// WASM heap.
		const bytes = new Uint8Array(val ?? new ArrayBuffer(0))
		if (bytes.length < 4) {
			this.port.postMessage({
				cmd: 'err',
				val: 'ptr',
				detail: `buffer too small: ${bytes.length} bytes`,
			})
			return
		}

		const dataPtr = M._malloc(bytes.length)
		M.HEAPU8.set(bytes, dataPtr)
		// wasm_load returns 0 on success or an ahx2play ERR_* code (1..6).
		const rc = M.ccall('wasm_load', 'number', ['number', 'number'],
			[dataPtr, bytes.length])
		M._free(dataPtr)
		if (rc !== 0) {
			// Common causes: ERR_NOT_AN_AHX (4) when the false-positive class
			// from design.md "Risks" matches (e.g. a MOD titled "AHX"), or
			// ERR_OUT_OF_MEMORY (1) under heap pressure. Either way the
			// onError → playNext path handles it.
			this.port.postMessage({
				cmd: 'err',
				val: 'ptr',
				detail: `wasm_load failed: rc=${rc} bytes=${bytes.length} firstFour=${
					Array.from(bytes.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
				}`,
			})
			return
		}

		// Pull metadata that's stable for the whole song. wasm_subsongs returns
		// the count of EXTRA subsongs beyond the implicit main song (spike
		// finding 2026-05-17); add 1 for the user-visible total.
		const extraSubsongs = M.ccall('wasm_subsongs', 'number', [], [])
		this.numSubsongs = extraSubsongs + 1
		this.revision = M.ccall('wasm_revision', 'number', [], [])
		const namePtr = M.ccall('wasm_song_name', 'number', [], [])
		this.songName = M.UTF8ToString(namePtr) || ''

		// Apply stereo-separation from config if it differs from the init
		// default. Defensive — the facade may have posted setStereoSeparation
		// before play, or may post it just after.
		if (this.config.stereoSeparation !== 100) {
			M.ccall('wasm_set_stereo_separation', null, ['number'],
				[this.config.stereoSeparation])
		}

		// Start playback at subsong 0 (the implicit main song).
		const playRc = M.ccall('wasm_play', 'number', ['number'], [0])
		if (playRc !== 0) {
			// wasm_load succeeded but wasm_play didn't — ahx2play's global
			// song_t was populated by the loader. We MUST call wasm_free
			// here before bailing: a subsequent _play would call _stop,
			// _stop checks `if (M && this.loaded)` which is false (loaded
			// never got set), and the leaked song state would persist
			// for the rest of the session.
			M.ccall('wasm_free', null, [], [])
			this.port.postMessage({
				cmd: 'err',
				val: 'ptr',
				detail: `wasm_play(0) failed: rc=${playRc}`,
			})
			return
		}

		this.loaded = true
		this.songIndex = 0
		this.currentMs = 0
		this.lastPostedMs = -1

		this._meta()
	}

	_stop() {
		if (M && this.loaded) {
			M.ccall('wasm_stop', null, [], [])
			M.ccall('wasm_free', null, [], [])
			this.loaded = false
		}
		if (M && this.pcmPtr) {
			M._free(this.pcmPtr)
			this.pcmPtr = 0
			this.pcmFrames = 0
		}
		// Drop any play queued while waiting for M — if the user stops
		// before init completes, we MUST NOT auto-fire the queued play.
		this.pendingPlay = null
		this.numSubsongs = 1
		this.songIndex = 0
		this.currentMs = 0
		this.paused = false
		this.songName = ''
		this.revision = 0
		this.lastPostedMs = -1
	}

	_meta() {
		if (!this.loaded) return

		// AHX has no per-subsong names in the format (subsongs are implicit
		// position-table entries). Fall back to "Subsong N", matching the
		// libopenmpt and TFMX worklet conventions.
		const songs = []
		for (let i = 0; i < this.numSubsongs; i++) songs.push(`Subsong ${i + 1}`)

		// meta.type = "ahx" pinned per design.md D12 — collapses the v0/v1
		// distinction at the meta layer. The version byte lives on
		// meta.song.revision for any consumer that wants it.
		// meta.song.songIndex is the currently-playing subsong; required
		// by the spec scenario "Subsong selection switches the playing
		// subsong" so a consumer can verify the switch took effect.
		this.port.postMessage({
			cmd: 'meta',
			meta: {
				dur: 0,  // ahx2play has no duration API; seek is a Phase 1 follow-up.
				title: this.songName,
				type: 'ahx',
				song: {
					channels: [],
					instruments: [],
					samples: [],
					orders: [],
					patterns: [],
					numSubsongs: this.numSubsongs,
					songIndex: this.songIndex,
					revision: this.revision,
				},
				songs,
				totalOrders: 0,
				totalPatterns: 0,
			},
		})
	}
}


registerProcessor('ahx-processor', AHX)
