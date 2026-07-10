/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AudioWorkletProcessor for TFMX playback via libtfmxaudiodecoder.
 * Registered as 'tfmx-processor', structurally parallel to
 * 'libopenmpt-processor' in chiptune3.worklet.js. Outbound messages
 * (cmd: meta / pos / end / err) match the libopenmpt vocabulary so the
 * AudioPlayer facade can dispatch by source.type without engine-aware
 * branching in Player.tsx.
 *
 * Two-buffer load: TFMX files come as a music-data half (.tfx) plus a
 * sample-bank half (.sam). libtfmx auto-discovers the sample bank by
 * filename, so we mount both buffers in MEMFS before calling tfx_load.
 */

// MUST come before the Emscripten glue import: Firefox's
// AudioWorkletGlobalScope has no TextDecoder (spec-compliant) and the
// glue constructs one unguarded during init — see the polyfill's header
// and issue #89.
import './worklet-textdecoder-polyfill.js'
import createLibtfmx from './libtfmx.worklet.js'

// Module instance (libtfmx Emscripten Module). Populated asynchronously.
let M
let initFailed = false
let initErrorDetail = ''
// Live TFX instances. Used by the init .then to drain each instance's
// pendingPlay, and by the .catch to surface init failure as an 'err'
// event on any instance that's currently waiting on M.
const tfxInstances = new Set()

let initStarted = false

// Instantiate libtfmx from a WebAssembly.Module compiled on the MAIN thread
// and handed in via the AudioWorkletNode's processorOptions. Safari's
// AudioWorkletGlobalScope hangs on emscripten's in-worklet async WASM
// instantiation (createLibtfmx() never resolves — the processor loads but
// decodes nothing, a silent "Couldn't play" on Safari while Chromium/Firefox
// work). Compiling on the main thread and doing only a SYNCHRONOUS
// `new WebAssembly.Instance` here — via emscripten's instantiateWasm hook —
// sidesteps it. Runs once, from the first processor's constructor. See
// ensureTfmx() in lib/audio-player.ts for the main-thread half.
function initWithModule(wasmModule) {
	if (initStarted) return
	initStarted = true
	if (!wasmModule) {
		initFailed = true
		initErrorDetail = 'no WebAssembly.Module in processorOptions — the main thread must compile and pass it'
		return
	}
	createLibtfmx({
		instantiateWasm: (imports, successCallback) => {
			const instance = new WebAssembly.Instance(wasmModule, imports)
			successCallback(instance)
			return instance.exports
		},
	})
		.then(mod => {
			M = mod
			for (const proc of tfxInstances) {
				if (proc.pendingPlay) {
					const val = proc.pendingPlay
					proc.pendingPlay = null
					proc._play(val)
				}
			}
		})
		.catch(e => {
			console.error('[tfmx-processor] init failed', e)
			initFailed = true
			// WebKit/Safari drops this worklet-thread console.error; forward the
			// real reason in the err `detail` so the main thread can surface it.
			initErrorDetail = `createLibtfmx() failed: ${e && e.stack ? e.stack : (e && e.message ? e.message : String(e))}`
			for (const proc of tfxInstances) {
				if (proc.pendingPlay) {
					proc.pendingPlay = null
					proc.port.postMessage({ cmd: 'err', val: 'init', detail: initErrorDetail })
				}
			}
		})
}


class TFX extends AudioWorkletProcessor {
	constructor(options) {
		super()
		this.port.onmessage = this.handleMessage_.bind(this)
		this.paused = false
		// Kept for facade parity with libopenmpt-processor; libtfmx ignores
		// most of these but the AudioPlayer constructor posts {cmd:'config'}
		// once after creation regardless of engine.
		this.config = {
			repeatCount: -1,
			stereoSeparation: 100,
			interpolationFilter: 0,
		}
		this.decoder = 0          // libtfmx tfmxdec_new() handle, 0 = none
		this.pcmPtr = 0           // PCM scratch in HEAPU8 (int16 interleaved)
		this.pcmFrames = 0        // size of pcmPtr in frames
		this.songs = 0            // tfmxdec_songs result
		this.songIndex = 0
		this.durationMs = 0
		this.currentMs = 0
		this.endFired = false
		this.formatName = ''
		// Throttle pos messages to ~20Hz. process() runs every 128 frames
		// (~2.7ms @ 48kHz = ~375Hz); without this we'd flood the main
		// thread with hundreds of useless messages per second.
		this.lastPostedMs = -1
		// Last virtual MEMFS paths — unlinked between plays to keep
		// the in-memory FS bounded.
		this.lastTfx = ''
		this.lastSam = ''
		// Per-instance queued play, used when _play is called before M is
		// ready. Drained from the module-level createLibtfmx().then handler.
		this.pendingPlay = null
		tfxInstances.add(this)
		// Kick off libtfmx init with the main-thread-compiled WASM module the
		// facade passed through processorOptions (see ensureTfmx). No-op after
		// the first instance.
		initWithModule(options && options.processorOptions && options.processorOptions.wasmModule)
	}

	process(inputList, outputList, parameters) {
		if (!M || !this.decoder || this.paused) return true

		try {
		const left = outputList[0][0]
		const right = outputList[0][1]
		const frames = left.length

		// Reallocate the PCM scratch if frames-per-block changed (it doesn't
		// in practice — 128 — but cheap to guard).
		if (this.pcmFrames < frames) {
			if (this.pcmPtr) M.ccall('tfx_free', null, ['number'], [this.pcmPtr])
			this.pcmPtr = M.ccall('tfx_malloc', 'number', ['number'], [frames * 2 * 2])
			this.pcmFrames = frames
		}

		// Ask libtfmx for `frames` interleaved s16 stereo samples.
		M.ccall('tfx_buffer_fill', null, ['number', 'number', 'number'],
			[this.decoder, this.pcmPtr, frames * 2 * 2])

		// Convert int16 interleaved → float32 planar L/R.
		// pcmPtr is byte-aligned to 16-bit (malloc returns 8-byte aligned),
		// so HEAP16 indexing at pcmPtr/2 is safe.
		const i16Start = this.pcmPtr >> 1
		const i16 = M.HEAP16
		for (let i = 0; i < frames; i++) {
			left[i]  = i16[i16Start + (i << 1)]     / 32768
			right[i] = i16[i16Start + (i << 1) + 1] / 32768
		}

		// Once-only end-of-song signal. The facade decides what to do next
		// (loop, advance, etc.); the worklet keeps rendering silence (libtfmx
		// returns zero buffers after song end).
		if (!this.endFired && M.ccall('tfx_song_end', 'number', ['number'], [this.decoder])) {
			this.endFired = true
			this.port.postMessage({ cmd: 'end' })
		}

		// Advance our position counter. libtfmx has no get-position-in-ms
		// API, so we synthesise from frames rendered. When looping, wrap
		// at durationMs so the progress UI doesn't overshoot 100% — libtfmx
		// just ignores song-end in loop mode, leaving us to detect the
		// wrap ourselves.
		this.currentMs += (frames * 1000) / sampleRate
		const looping = this.config.repeatCount < 0
		if (looping && this.durationMs > 0 && this.currentMs >= this.durationMs) {
			this.currentMs -= this.durationMs
			this.endFired = false
			this.lastPostedMs = -1   // wrap: force the next pos through.
		}
		// Throttle to ~20Hz: only post when we've advanced ≥50ms since the
		// last message. Player.tsx polls duration/currentTime every 500ms,
		// so anything faster than 20Hz is invisible to the UI.
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
		} catch (e) {
			// WebKit/Safari is prone to WASM traps in the AudioWorklet render
			// path (e.g. a HEAP view detaching after WASM memory growth) that
			// otherwise die as a SILENT, unhandled processorerror — no console
			// output anywhere, the worklet just stops. Catch it and post the
			// real error to the main thread once, so the failure is diagnosable
			// (and the player can surface a proper error instead of freezing).
			if (!this.processErrored) {
				this.processErrored = true
				this.port.postMessage({
					cmd: 'err',
					val: 'process',
					detail: `process() threw: ${e && e.stack ? e.stack : String(e)}`,
				})
			}
			return true
		}
	}

	handleMessage_(msg) {
		const v = msg.data.val
		switch (msg.data.cmd) {
			case 'config':
				// Shallow-merge: an incoming partial config (e.g. just
				// {repeatCount}) must not erase the defaults set up in the
				// constructor (stereoSeparation, interpolationFilter, …).
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
				// Ack the stop back to the facade so cross-engine play()
				// can wait until the audio thread has actually applied the
				// stop (decoder=0 → process() returns silence) before
				// starting libopenmpt. Without this ack there's a postMessage
				// drain window where both engines mix into the master gain.
				this.port.postMessage({ cmd: 'stopped' })
				break
			case 'meta':
				this._meta()
				break
			case 'setPos':
				if (!this.decoder) break
				{
					const ms = Math.max(0, Math.trunc(v * 1000))
					M.ccall('tfx_seek', null, ['number', 'number'], [this.decoder, ms])
					this.currentMs = ms
					this.endFired = false
				}
				break
			case 'selectSubsong':
				if (!this.decoder) break
				{
					const ok = M.ccall('tfx_reinit', 'number', ['number', 'number'], [this.decoder, v])
					if (ok === 1) {
						this.songIndex = v
						this.currentMs = 0
						this.endFired = false
						this.durationMs = M.ccall('tfx_duration', 'number', ['number'], [this.decoder])
						this._meta()
					}
				}
				break
			case 'repeatCount':
				this.config.repeatCount = v
				if (this.decoder) {
					// Map libopenmpt-style repeat count to libtfmx's boolean
					// loop_mode: -1 → loop forever; 0 or positive N → no loop.
					// libtfmx has no "play N times" mode, so positive counts
					// get the same treatment as 0.
					M.ccall('tfx_set_loop_mode', null, ['number', 'number'],
						[this.decoder, v < 0 ? 1 : 0])
				}
				break
			// Accepted-silently for facade parity. The AudioPlayer forwards
			// the same setCtl / setPitch / setTempo messages regardless of
			// engine; libtfmx doesn't have equivalents.
			case 'setCtl':
			case 'setPitch':
			case 'setTempo':
			case 'setOrderRow':
				break
			// Store the value for application on the NEXT track. libtfmx's
			// only stereo control is the `panning` argument to
			// tfx_mixer_init, called once per track — there's no runtime
			// setter exposed in the C wrapper. Mid-track slider drags
			// record the value but don't affect the currently-playing
			// track. The next tfx_mixer_init picks up this.config.stereoSeparation.
			case 'setStereoSeparation': {
				const n = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.trunc(v))) : 100
				this.config.stereoSeparation = n
				break
			}
			default:
				console.log('[tfmx-processor] unknown message', msg.data)
		}
	}

	_play(val) {
		// If the engine failed to initialise, fail this play immediately
		// so the facade's onError → playNext path can recover.
		if (initFailed) {
			this.port.postMessage({ cmd: 'err', val: 'init', detail: initErrorDetail || 'wasm init failed (no detail captured)' })
			return
		}
		// Defer until M is ready. createLibtfmx's .then iterates
		// tfxInstances and re-invokes _play with the saved val.
		if (!M) {
			this.pendingPlay = val
			return
		}
		this.pendingPlay = null
		this._stop()
		// Reset paused flag so a pause→stop→play sequence isn't stuck on silence.
		this.paused = false

		// AudioPlayer.play() posts {tfx, sam?, base, ext?, dns?} as ArrayBuffer
		// (structured clone preserves the type); we only need the
		// ArrayBuffer→Uint8Array wrap for MEMFS writeFile. `sam` is absent
		// for single-file libtfmx formats (Hippel / Future Composer).
		const tfxBytes = new Uint8Array(val?.tfx ?? new ArrayBuffer(0))
		const hasSam = val?.sam != null
		const samBytes = hasSam ? new Uint8Array(val.sam) : null
		// Dynamic Synthesizer (Chris Huelsbeck) pairs: libtfmx's DNS decoder
		// finds its sample bank by the `dns.`↔`smp.` filename token, NOT the
		// generic `.tfx`→`.sam` guess the Huelsbeck-TFMX conventions use. So a
		// DNS pair written as `<base>.tfx`/`<base>.sam` fails to content-detect
		// (verified: load returns 0). Write DNS halves under `dns.`/`smp.`.
		const isDnsPair = hasSam && val?.dns === true
		// Sanitise to a filename-safe ASCII slug. libtfmx uses fopen
		// internally; spaces and unicode in pair base-names (e.g. "Apidya - Load")
		// would otherwise force quoting concerns. `|| 'song'` covers the
		// undefined/null case; the replace cannot yield an empty string for
		// any non-empty input, so no trailing fallback is needed.
		const base = (val?.base || 'song').replace(/[^A-Za-z0-9_-]/g, '_')
		// Music-data MEMFS extension. Pairs keep the historical `.tfx`.
		// Single-file formats use their REAL extension (e.g. `.fc`, `.hipc`)
		// so libtfmx's sample-sidecar guessing doesn't hunt for a phantom
		// `.sam`. Validate the ext is a plain `.<alnum>` token before use;
		// tfx_load still content-detects the actual format regardless.
		const extRaw = typeof val?.ext === 'string' ? val.ext.toLowerCase() : ''
		const musicExt = hasSam ? '.tfx' : (/^\.[a-z0-9]+$/.test(extRaw) ? extRaw : '.tfx')

		const vdir = '/song'
		try { M.FS.mkdir(vdir) } catch { /* exists from a previous play */ }
		const vTfx = isDnsPair ? `${vdir}/dns.${base}` : `${vdir}/${base}${musicExt}`
		const vSam = !hasSam ? '' : (isDnsPair ? `${vdir}/smp.${base}` : `${vdir}/${base}.sam`)
		// Record the paths BEFORE writing so a partial-success failure
		// (vTfx written, vSam throws) is still cleaned up by the next
		// _stop / _unlinkVirtual. Empty vSam is skipped by _unlinkVirtual.
		this.lastTfx = vTfx
		this.lastSam = vSam
		try {
			M.FS.writeFile(vTfx, tfxBytes)
			if (hasSam) M.FS.writeFile(vSam, samBytes)
		} catch (e) {
			// Worklet-side console.* is silently dropped by some browsers
			// (Safari/WebKit in particular). Surface diagnostics via the
			// err message's `detail` field so the facade can log them on
			// the main thread.
			this.port.postMessage({
				cmd: 'err',
				val: 'ptr',
				detail: `MEMFS writeFile failed: vTfx=${vTfx} vSam=${vSam || 'none'} tfxLen=${tfxBytes.length} samLen=${hasSam ? samBytes.length : 'none'} error=${e && e.message ? e.message : String(e)}`,
			})
			return
		}

		this.decoder = M.ccall('tfx_new', 'number', [], [])
		if (!this.decoder) {
			this.port.postMessage({
				cmd: 'err',
				val: 'ptr',
				detail: 'tfx_new returned 0',
			})
			return
		}
		M.ccall('tfx_set_path', null, ['number', 'string'], [this.decoder, vTfx])
		const ok = M.ccall('tfx_load', 'number', ['number', 'string', 'number'],
			[this.decoder, vTfx, 0])
		if (ok !== 1) {
			// tfx_load (libtfmx's init/load path) rejected the data.
			// This is NOT related to TFMX_PROBE_SIZE (0xb80): that only gates
			// the optional detect() probe for Hippel-style TFMX, not the
			// init/load of Huelsbeck TFMX like the Apidya-Load reference
			// example, which fails here for an unrelated reason.
			this.port.postMessage({
				cmd: 'err',
				val: 'ptr',
				detail: `tfx_load failed: vTfx=${vTfx} vSam=${vSam || 'none'} tfxLen=${tfxBytes.length} samLen=${hasSam ? samBytes.length : 'none'} returnedOk=${ok}`,
			})
			this._stop()
			return
		}

		// Map libopenmpt-style stereoSeparation (0=mono, 100=full stereo)
		// to libtfmx panning (50=mono, 100=full stereo, 0=mirrored stereo).
		// We only ever produce values in [50..100] — the mirrored-stereo
		// half of libtfmx's range isn't reachable from the slider, by design.
		const sep = Math.max(0, Math.min(100, this.config.stereoSeparation))
		const tfmxPanning = 50 + Math.round(sep / 2)
		M.ccall('tfx_mixer_init', null,
			['number', 'number', 'number', 'number', 'number', 'number'],
			// freq, bits, channels, zero-sample, panning
			[this.decoder, sampleRate, 16, 2, 0, tfmxPanning])

		this.songIndex = 0
		this.currentMs = 0
		this.endFired = false
		this.durationMs = M.ccall('tfx_duration', 'number', ['number'], [this.decoder])
		if (this.durationMs === 0) {
			this.port.postMessage({ cmd: 'err', val: 'dur' })
		}
		this.songs = M.ccall('tfx_songs', 'number', ['number'], [this.decoder])
		this.formatName = M.ccall('tfx_format_name', 'string', ['number'], [this.decoder]) || ''

		this._meta()
	}

	_stop() {
		if (M && this.pcmPtr) {
			M.ccall('tfx_free', null, ['number'], [this.pcmPtr])
			this.pcmPtr = 0
			this.pcmFrames = 0
		}
		if (M && this.decoder) {
			M.ccall('tfx_delete', null, ['number'], [this.decoder])
			this.decoder = 0
		}
		// Unlink the virtual MEMFS files written by the most recent _play
		// so a session of 7+ TFMX pairs doesn't leak 14+ files at ~100KB each.
		this._unlinkVirtual()
		// Drop any play that was queued waiting for M to initialise — if
		// the user stops before the WASM module finishes loading, we MUST
		// NOT auto-fire the queued play once the .then handler drains.
		this.pendingPlay = null
		this.songs = 0
		this.songIndex = 0
		this.durationMs = 0
		this.currentMs = 0
		this.endFired = false
		this.paused = false
		this.formatName = ''
		this.lastPostedMs = -1
	}

	_unlinkVirtual() {
		if (!M) return
		if (this.lastTfx) {
			try { M.FS.unlink(this.lastTfx) } catch { /* gone or never created */ }
			this.lastTfx = ''
		}
		if (this.lastSam) {
			try { M.FS.unlink(this.lastSam) } catch { /* gone or never created */ }
			this.lastSam = ''
		}
	}

	_meta() {
		if (!this.decoder) return

		const title = M.ccall('tfx_get_name', 'string', ['number'], [this.decoder]) || ''
		// libtfmx exposes no per-subsong names, so we mirror chiptune3.worklet.js'
		// "Subsong N" fallback (see its getSongs()).
		const songs = []
		for (let i = 0; i < this.songs; i++) songs.push(`Subsong ${i + 1}`)

		this.port.postMessage({
			cmd: 'meta',
			meta: {
				dur: this.durationMs / 1000,
				title,
				type: this.formatName,
				// Stub the libopenmpt-shaped song detail so onMetadata
				// consumers that drill into it don't need to branch.
				song: {
					channels: [],
					instruments: [],
					samples: [],
					orders: [],
					patterns: [],
					numSubsongs: this.songs,
				},
				songs,
				totalOrders: 0,
				totalPatterns: 0,
			},
		})
	}
}


registerProcessor('tfmx-processor', TFX)
