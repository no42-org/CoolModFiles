/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Engine-agnostic audio playback facade.
 *
 * Wraps the existing ChiptuneJsPlayer (libopenmpt under the hood) and
 * adds two lazy-loaded worklets: 'tfmx-processor' for TFMX pairs and
 * 'ahx-processor' for AHX/THX. Dispatch order in `play()`:
 *   - { tfx, sam[, base] }    → TFMX pair via libtfmxaudiodecoder
 *   - ArrayBuffer + AHX/THX magic → AHX via ahx2play (4-byte sniff)
 *   - ArrayBuffer (anything else) → tracker module via libopenmpt
 *
 * Public API mirrors ChiptuneJsPlayer 1:1 plus an overload on `play()`,
 * so a caller that today does `new ChiptuneJsPlayer({...})` can swap in
 * `new AudioPlayer({...})` without touching anything else.
 *
 * Architecture: the inner ChiptuneJsPlayer owns the AudioContext, the
 * master GainNode, and the libopenmpt-processor worklet (eager init —
 * cold-start path for MOD playback is unchanged). The facade owns the
 * lazy tfmx-processor AND ahx-processor worklets. All worklets connect
 * to the same gain; the inactive engines render silence each block, so
 * engine switching involves only a postMessage('stop') + postMessage
 * ('play') round-trip (no audio-graph reconnection). MOD cold start is
 * byte-for-byte the same as before this change.
 */

import { looksLikeAhx } from "./ahx-magic";
import type { MimeType } from "./recording-magic";

// TFMX engine input. Pairs (Huelsbeck) carry both halves; single-file
// formats (Hippel / Future Composer) carry only `tfx` plus `ext` so the
// worklet can name the MEMFS file with the real extension.
export type TfmxPair = {
  tfx: ArrayBuffer | Uint8Array;
  sam?: ArrayBuffer | Uint8Array;
  base?: string;
  ext?: string;
  // Dynamic Synthesizer pair: write the halves under `dns.`/`smp.` MEMFS
  // names instead of `.tfx`/`.sam` so libtfmx's DNS sample discovery works.
  dns?: boolean;
};

export type AudioPlayerConfig = ChiptuneConfig;

export type EngineKind = "libopenmpt" | "tfmx" | "ahx" | "pcm";

type EventName =
  | "onInitialized"
  | "onEnded"
  | "onError"
  | "onMetadata"
  | "onProgress"
  | "onFullAudioData";

type Handler = (payload?: unknown) => void;

function isTfmxPair(input: unknown): input is TfmxPair {
  // Route to the TFMX engine on the presence of `tfx` alone — pairs carry
  // `sam` too, single-file formats don't. No libopenmpt/AHX/PCM input
  // (a bare ArrayBuffer) has a `tfx` property, so this never mis-routes.
  return (
    typeof input === "object" &&
    input !== null &&
    "tfx" in input
  );
}

// TEMP diagnostic (remove once the Safari/WebKit TFMX failure is root-caused):
// push a trace line into window.__tfmxDebug so it can be read headlessly via
// page.evaluate — WebKit drops worklet/processor console output, so the normal
// console is blind to this failure. Also console.error for good measure.
function tfmxDbg(msg: string): void {
  try {
    const w = globalThis as unknown as { __tfmxDebug?: string[] };
    (w.__tfmxDebug ??= []).push(msg);
  } catch {
    /* no global (SSR) */
  }
  console.error("[tfmx-dbg]", msg);
}

// looksLikeAhx is the magic-byte sniff that decides AHX dispatch. It
// lives in lib/ahx-magic.ts so it can be unit-tested in isolation
// without dragging in this file's ChiptuneJsPlayer ambient global.
// See that file for the full rationale + the false-positive analysis.

export class AudioPlayer {
  context: AudioContext;
  gain: GainNode;
  // Master-mix AnalyserNode for visualisation (e.g. SpectrumAnalyzer).
  // Connected as a sibling fan-out off `gain` — observation-only, never
  // routed to `destination`. Downstream of the master gain so the
  // visualisation reflects the user's volume setting.
  analyser: AnalyserNode;

  // Public state surface — kept in sync with whichever engine is active.
  // Player.tsx and PlayerMin read these from polled intervals.
  meta?: ChiptuneMeta;
  duration?: number;
  currentTime?: number;
  order?: number;
  pattern?: number;
  row?: number;

  // The libopenmpt-driven inner player. Owns the AudioContext, the master
  // gain, and the eager-registered 'libopenmpt-processor' worklet.
  private chiptune: ChiptuneJsPlayer;

  // Lazy state for the TFMX engine. The worklet module is fetched the
  // first time a TFMX pair is played, then cached for the session.
  private tfmxReady?: Promise<void>;
  private tfmxNode?: AudioWorkletNode;
  // Cloneable subset of the constructor config — `context` is stripped
  // because structured clone (used by postMessage to the worklet)
  // rejects AudioContext. Matches the chiptune3.js convention.
  private tfmxConfig: Omit<ChiptuneConfig, "context">;

  // Lazy state for the AHX engine. Same shape as TFMX: worklet fetched
  // on first AHX play, cached for the session. The mutable ahxConfig
  // tracks the latest stereoSeparation so a setStereoSeparation call
  // BEFORE the AHX worklet is registered isn't lost (D9 amendment
  // 2026-05-17: AHX honours stereoSeparation natively at the libopenmpt
  // 0..100 scale).
  private ahxReady?: Promise<void>;
  private ahxNode?: AudioWorkletNode;
  private ahxConfig: Omit<ChiptuneConfig, "context">;

  // Tracks which engine should be "voicing" right now. The inactive
  // engine still renders silence on every block (Web Audio API contract);
  // this flag exists so we route inbound forwarded messages back out as
  // the *right* engine's events to listeners.
  private active: EngineKind = "libopenmpt";

  // Generation counter for TFMX plays. Bumped on every play() and stop().
  // The deferred ensureTfmx().then callback compares against the latest
  // value so an intervening engine-switch or stop() invalidates the
  // pending play. Same pattern as playGenerationRef in Player.tsx.
  private tfmxGeneration = 0;

  // Parallel generation counter for AHX plays — same invariant as
  // tfmxGeneration. Independent counters mean a TFMX→AHX→TFMX rapid
  // switch correctly invalidates each pending play without one
  // engine's counter masking the other's.
  private ahxGeneration = 0;

  // Lazy state for the PCM engine (OGG/FLAC/MP3 recordings). pcmReady
  // serves the same race-guard role as tfmxReady/ahxReady — concurrent
  // playPcm calls cannot both pass an `if (!this.pcmEl)` check and each
  // call createMediaElementSource on the same element (which throws
  // InvalidStateError: only one source node per element).
  private pcmReady?: Promise<void>;
  private pcmEl?: HTMLAudioElement;
  private pcmSrc?: MediaElementAudioSourceNode;

  // Generation counter for PCM plays. Bumped on every playPcm() and
  // stop(). Deferred ensurePcm().then callbacks check it before
  // assigning a new src so a newer engine switch invalidates the
  // pending play. Also used to gate aborted-load `error` events from
  // a stale src swap from interrupting a newer recording.
  private pcmGeneration = 0;

  private handlers: Array<{ eventName: EventName; handler: Handler }> = [];

  // One-shot callback waiting for a {cmd:'stopped'} ack from the TFMX
  // worklet. Cross-engine play() uses this to delay starting libopenmpt
  // until the worklet has applied its stop — otherwise both engines
  // briefly mix into the master gain.
  private pendingStopAck?: () => void;

  constructor(cfg: AudioPlayerConfig = {}) {
    // Hand the config straight to ChiptuneJsPlayer. If the caller passed
    // a prewarmed context (the documented pattern in audio-prewarm.js +
    // Player.tsx), it sets up around that. Otherwise chiptune creates its
    // own context.
    this.chiptune = new ChiptuneJsPlayer(cfg);
    this.context = this.chiptune.context;
    this.gain = this.chiptune.gain;
    // Sibling fan-out: gain → destination (owned by ChiptuneJsPlayer)
    // AND gain → analyser. In-path insertion would require modifying
    // ChiptuneJsPlayer (vendored) or post-construction reconnection;
    // fan-out is local and audio-graph-equivalent.
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;
    this.gain.connect(this.analyser);
    // Strip the AudioContext before stashing for postMessage. Structured
    // clone rejects AudioContext; the only consumer of tfmxConfig is the
    // worklet's {cmd:'config'} message, which doesn't need it anyway.
    const { context: _omitCtx, ...cloneable } = cfg;
    void _omitCtx;
    this.tfmxConfig = cloneable;
    // AHX worklet starts with the same cloneable config. The worklet
    // overlays its own defaults (stereoSeparation=100) but the values
    // we post here win.
    this.ahxConfig = { ...cloneable };

    // Forward chiptune's events to facade listeners. This means a caller
    // that registers `audioPlayer.onMetadata(fn)` hears MOD metadata via
    // the same handler that will receive TFMX metadata.
    this.chiptune.onInitialized(() => this.fireEvent("onInitialized"));
    this.chiptune.onMetadata((m: ChiptuneMeta) => {
      if (this.active !== "libopenmpt") return;
      this.meta = m;
      this.duration = m.dur;
      this.fireEvent("onMetadata", m);
    });
    this.chiptune.onProgress((p) => {
      if (this.active !== "libopenmpt") return;
      const data = p as { pos: number; order?: number; pattern?: number; row?: number };
      this.currentTime = data.pos;
      this.order = data.order;
      this.pattern = data.pattern;
      this.row = data.row;
      this.fireEvent("onProgress", p);
    });
    this.chiptune.onEnded(() => {
      if (this.active !== "libopenmpt") return;
      this.fireEvent("onEnded");
    });
    this.chiptune.onError((e) => {
      if (this.active !== "libopenmpt") return;
      this.fireEvent("onError", e);
    });
  }

  // Lazy-register the TFMX worklet on first TFMX play.
  // Prewarm note: the existing audio-prewarm.js only creates the
  // AudioContext — it does not register any AudioWorklet modules. The
  // chiptune3 wrapper registers libopenmpt-processor eagerly in its
  // constructor. tfmx-processor is registered here, on demand, against
  // the same context. The cost (worklet module fetch + compile) is paid
  // once per session on the first TFMX play and is absorbed by Player.tsx's
  // existing "Loading..." state.
  private ensureTfmx(): Promise<void> {
    if (!this.tfmxReady) {
      // If a previous attempt registered a node but the chain still
      // rejected (e.g. AudioWorkletNode constructor threw on Safari
      // after addModule resolved), disconnect the orphan before
      // recreating — otherwise it stays attached to this.gain forever.
      if (this.tfmxNode) {
        try { this.tfmxNode.disconnect(); } catch { /* not connected */ }
        this.tfmxNode = undefined;
      }
      const chain = this.context.audioWorklet
        .addModule("/tfmx.worklet.js")
        .then(() => {
          this.tfmxNode = new AudioWorkletNode(this.context, "tfmx-processor", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          this.tfmxNode.port.onmessage = (msg) => this.handleTfmxMessage_(msg);
          tfmxDbg("tfmx node created");
          // Currently-missing handler: an AudioWorklet fires `processorerror`
          // when the processor's constructor OR process() throws. On WebKit
          // this otherwise dies SILENTLY (no console, no message). Capture it.
          this.tfmxNode.onprocessorerror = (ev: Event) => {
            const m = (ev as unknown as { message?: string }).message;
            tfmxDbg(`processorerror: ${m || ev.type || "unknown"}`);
            if (this.active === "tfmx")
              this.fireEvent("onError", { type: "tfmx-processor-error" });
          };
          // Push the same config object the chiptune wrapper does so the
          // facade's listeners see a consistent meta shape regardless of
          // engine. libtfmx's worklet stores config for parity only — it
          // doesn't implement stereo separation / interpolation today.
          this.tfmxNode.port.postMessage({ cmd: "config", val: this.tfmxConfig });
          // Connect to the same master gain ChiptuneJsPlayer is using, so
          // setVol() controls both engines transparently. The non-active
          // engine emits silence each block per the AudioWorklet contract.
          this.tfmxNode.connect(this.gain);
        });
      // Single catch covers BOTH addModule rejection AND any throw inside
      // the .then body (AudioWorkletNode constructor can throw on Safari
      // pre-iOS 14.5). Without this, a throw in the .then body would
      // leave tfmxReady as a permanently-rejected promise that all
      // subsequent play() calls await silently.
      this.tfmxReady = chain.catch((e) => {
        tfmxDbg(`engine init failed: ${e && e.message ? e.message : String(e)}`);
        this.tfmxReady = undefined;
        throw e;
      });
    }
    return this.tfmxReady;
  }

  // Lazy-register the AHX worklet on first AHX play. Same pattern as
  // ensureTfmx — see that method for the architectural notes.
  private ensureAhx(): Promise<void> {
    if (!this.ahxReady) {
      if (this.ahxNode) {
        try { this.ahxNode.disconnect(); } catch { /* not connected */ }
        this.ahxNode = undefined;
      }
      const chain = this.context.audioWorklet
        .addModule("/ahx.worklet.js")
        .then(() => {
          this.ahxNode = new AudioWorkletNode(this.context, "ahx-processor", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          this.ahxNode.port.onmessage = (msg) => this.handleAhxMessage_(msg);
          // Post the current config so the worklet's initial render uses
          // the latest stereoSeparation (mutated by setStereoSeparation
          // calls that happened BEFORE this lazy-load resolved).
          this.ahxNode.port.postMessage({ cmd: "config", val: this.ahxConfig });
          this.ahxNode.connect(this.gain);
        });
      this.ahxReady = chain.catch((e) => {
        console.error("[AudioPlayer] ahx engine init failed", e);
        this.ahxReady = undefined;
        throw e;
      });
    }
    return this.ahxReady;
  }

  // Lazy-create the HTMLAudioElement + MediaElementAudioSourceNode for
  // PCM recording playback. No worklet, no WASM — the browser's native
  // OGG/FLAC/MP3 decoders are the engine. Connects to the same master
  // gain as the worklet engines so the spectrum analyser tap, master
  // volume, and cross-engine handshake all keep working without
  // modification.
  //
  // Returns a Promise to mirror ensureTfmx/ensureAhx, but the underlying
  // operations are synchronous — there's no addModule equivalent for
  // <audio>. The Promise serves the race-guard role: concurrent playPcm
  // calls cannot both pass an `if (!this.pcmEl)` check and each invoke
  // createMediaElementSource on the same element (which throws
  // InvalidStateError).
  // Track type for the currently-loaded PCM recording. Set in playPcm
  // before the audio element loads, read by the loadedmetadata listener
  // to populate MetaData.type ("mp3"/"ogg"/"flac"). MetaData.title is
  // intentionally NOT populated here — Player.tsx derives the title
  // from the source's filename per design.md Decision 8 (no tag parser).
  private pcmType?: "mp3" | "ogg" | "flac";

  private ensurePcm(): Promise<void> {
    if (!this.pcmReady) {
      try {
        this.pcmEl = new Audio();
        // "metadata" is enough to fire loadedmetadata without
        // prefetching the whole file on every src swap. The explicit
        // play() call triggers full streaming when the user actually
        // wants to listen.
        this.pcmEl.preload = "metadata";
        // Master gain is the sole volume authority. Pinning these
        // properties to neutral values means the volume popover stays
        // effective; reassigning them anywhere else would silently
        // break it.
        this.pcmEl.volume = 1.0;
        this.pcmEl.muted = false;
        // crossOrigin is read-once at load time — must be set BEFORE
        // any src assignment. Defensive: blob URLs are same-origin
        // and don't need it, but a future http URL would.
        this.pcmEl.crossOrigin = "anonymous";

        this.pcmSrc = this.context.createMediaElementSource(this.pcmEl);
        this.pcmSrc.connect(this.gain);

        // loadedmetadata: if duration is finite, populate it.
        // VBR MP3s without a Xing/VBRI header report Infinity here;
        // the duration becomes finite later via durationchange.
        this.pcmEl.addEventListener("loadedmetadata", () => {
          if (this.active !== "pcm" || !this.pcmEl) return;
          const dur = this.pcmEl.duration;
          const meta: ChiptuneMeta = { type: this.pcmType };
          if (Number.isFinite(dur)) {
            meta.dur = dur;
            this.duration = dur;
          } else {
            this.duration = undefined;
          }
          this.meta = meta;
          this.fireEvent("onMetadata", meta);
        });

        // durationchange: when a VBR MP3's duration becomes finite,
        // update and re-fire onMetadata so the seekbar picks it up.
        this.pcmEl.addEventListener("durationchange", () => {
          if (this.active !== "pcm" || !this.pcmEl) return;
          const dur = this.pcmEl.duration;
          if (Number.isFinite(dur) && dur !== this.duration) {
            this.duration = dur;
            const meta: ChiptuneMeta = { type: this.pcmType, dur };
            this.meta = meta;
            this.fireEvent("onMetadata", meta);
          }
        });

        this.pcmEl.addEventListener("timeupdate", () => {
          if (this.active !== "pcm" || !this.pcmEl) return;
          const pos = this.pcmEl.currentTime;
          this.currentTime = pos;
          this.fireEvent("onProgress", { pos });
        });

        this.pcmEl.addEventListener("ended", () => {
          if (this.active !== "pcm") return;
          this.fireEvent("onEnded");
        });

        // error: a rapid src swap (user clicks recording A, then B
        // before A finishes loading) may produce an error event for
        // the aborted A load. We can't reliably tag the listener with
        // a specific generation; instead, guard on this.active so a
        // post-engine-switch error is silently dropped.
        this.pcmEl.addEventListener("error", () => {
          if (this.active !== "pcm") return;
          const code = this.pcmEl?.error?.code;
          console.error("[pcm]", code);
          this.fireEvent("onError", { type: "pcm" });
        });

        this.pcmReady = Promise.resolve();
      } catch (e) {
        console.error("[AudioPlayer] pcm engine init failed", e);
        this.pcmReady = Promise.reject(e);
        this.pcmEl = undefined;
        this.pcmSrc = undefined;
      }
    }
    return this.pcmReady;
  }

  private playPcm(input: ArrayBuffer, mime: string): void {
    const wasTfmx = this.active === "tfmx";
    const wasAhx = this.active === "ahx";
    this.active = "pcm";
    // Set pcmType from mime so the loadedmetadata listener can include
    // it in MetaData.type. Player.tsx reads this to drive engine-aware
    // UI gating (SoundPane hints, PlayerBig pattern viewer).
    this.pcmType =
      mime === "audio/mpeg" ? "mp3" : mime === "audio/ogg" ? "ogg" : "flac";
    const myGen = ++this.pcmGeneration;
    this.tfmxGeneration++;
    this.ahxGeneration++;
    // Silence libopenmpt unconditionally — its worklet keeps writing
    // PCM into the master gain until told to stop.
    this.chiptune.stop();

    const startPcm = () => {
      this.ensurePcm()
        .then(() => {
          // Generation guard: a newer engine switch invalidates this.
          if (myGen !== this.pcmGeneration) return;
          if (!this.pcmEl) return;
          // canPlayType returns "" if the codec is unsupported. For
          // explicit-click playback this gives an actionable error
          // path instead of a mystery skip; random walks still
          // recover via onError → playNext.
          if (this.pcmEl.canPlayType(mime) === "") {
            this.fireEvent("onError", {
              type: "pcm-codec-unsupported",
              detail: mime,
            });
            return;
          }
          // Revoke the previous blob URL (if any) before assigning a
          // new one to keep the browser from holding the prior buffer.
          const priorSrc = this.pcmEl.src;
          if (priorSrc && priorSrc.startsWith("blob:")) {
            try { URL.revokeObjectURL(priorSrc); } catch { /* ignore */ }
          }
          this.pcmEl.src = URL.createObjectURL(
            new Blob([input], { type: mime })
          );
          // play() returns a Promise that REJECTS under autoplay
          // policy. Surface as onError so the recovery path runs
          // instead of leaving the UI stuck on "Loading…".
          const playPromise = this.pcmEl.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((err: unknown) => {
              if (myGen !== this.pcmGeneration) return;
              this.fireEvent("onError", {
                type: "pcm-autoplay",
                detail: String(err),
              });
            });
          }
        })
        .catch((e) => {
          if (myGen !== this.pcmGeneration) return;
          console.error("[AudioPlayer] pcm play aborted", e);
          this.fireEvent("onError", { type: "pcm-init" });
        });
    };

    if ((wasTfmx && this.tfmxNode) || (wasAhx && this.ahxNode)) {
      // Cross-engine handshake mirrors the existing pattern — wait for
      // the worklet to ack its stop before assigning the audio
      // element's src so both engines don't briefly mix.
      if (wasTfmx && this.tfmxNode) {
        this.tfmxNode.port.postMessage({ cmd: "stop" });
      }
      if (wasAhx && this.ahxNode) {
        this.ahxNode.port.postMessage({ cmd: "stop" });
      }
      this.waitForStopAck_().then(startPcm);
    } else {
      // libopenmpt was already active or no prior engine: stop any
      // worklet nodes (silently producing silence anyway) and start.
      if (this.tfmxNode) this.tfmxNode.port.postMessage({ cmd: "stop" });
      if (this.ahxNode) this.ahxNode.port.postMessage({ cmd: "stop" });
      startPcm();
    }
  }

  private handleAhxMessage_(msg: MessageEvent) {
    const data = msg.data as { cmd: string; [k: string]: unknown };
    switch (data.cmd) {
      case "meta": {
        if (this.active !== "ahx") return;
        const m = data.meta as ChiptuneMeta;
        this.meta = m;
        this.duration = m.dur;
        this.fireEvent("onMetadata", m);
        break;
      }
      case "pos": {
        if (this.active !== "ahx") return;
        const d = data as unknown as {
          pos: number;
          order?: number;
          pattern?: number;
          row?: number;
        };
        this.currentTime = d.pos;
        this.order = d.order;
        this.pattern = d.pattern;
        this.row = d.row;
        this.fireEvent("onProgress", d);
        break;
      }
      case "end":
        if (this.active !== "ahx") return;
        this.fireEvent("onEnded");
        break;
      case "err":
        if (this.active !== "ahx") return;
        if (typeof data.detail === "string") {
          console.error("[ahx-processor]", data.detail);
        }
        this.fireEvent("onError", { type: String(data.val ?? "") });
        break;
      case "stopped": {
        // Worklet acks stop applied. Both tfmx and ahx use the same
        // pendingStopAck — only one cross-engine handshake is ever in
        // flight (the generation counters enforce serialisation).
        const cb = this.pendingStopAck;
        if (cb) {
          this.pendingStopAck = undefined;
          cb();
        }
        break;
      }
      default:
        break;
    }
  }

  private handleTfmxMessage_(msg: MessageEvent) {
    const data = msg.data as { cmd: string; [k: string]: unknown };
    switch (data.cmd) {
      case "meta": {
        tfmxDbg("worklet meta received");
        if (this.active !== "tfmx") return;
        const m = data.meta as ChiptuneMeta;
        this.meta = m;
        this.duration = m.dur;
        this.fireEvent("onMetadata", m);
        break;
      }
      case "dbg":
        tfmxDbg(`worklet: ${String(data.detail ?? "")}`);
        break;
      case "pos": {
        if (this.active !== "tfmx") return;
        // Worklet→main message contents are arbitrary structured-clone
        // shapes; the double-cast routes through `unknown` to acknowledge
        // we're treating an unstructured payload as a known shape.
        const d = data as unknown as {
          pos: number;
          order?: number;
          pattern?: number;
          row?: number;
        };
        this.currentTime = d.pos;
        this.order = d.order;
        this.pattern = d.pattern;
        this.row = d.row;
        this.fireEvent("onProgress", d);
        break;
      }
      case "end":
        if (this.active !== "tfmx") return;
        this.fireEvent("onEnded");
        break;
      case "err":
        tfmxDbg(
          `worklet err: val=${String(data.val ?? "")} detail=${
            typeof data.detail === "string" ? data.detail.slice(0, 300) : "-"
          }`
        );
        if (this.active !== "tfmx") return;
        // The worklet's `detail` field (when present) carries a richer
        // diagnostic string. console.error runs on the main thread here,
        // so it surfaces in DevTools even on browsers (Safari/WebKit)
        // that drop AudioWorkletGlobalScope log output.
        if (typeof data.detail === "string") {
          console.error("[tfmx-processor]", data.detail);
        }
        this.fireEvent("onError", { type: String(data.val ?? "") });
        break;
      case "stopped": {
        // Worklet acks that it has applied a 'stop' command. Used by
        // cross-engine play() to delay starting libopenmpt until the
        // TFMX worklet has actually silenced its output. Fires regardless
        // of `this.active` because the transition has already flipped it.
        const cb = this.pendingStopAck;
        if (cb) {
          this.pendingStopAck = undefined;
          cb();
        }
        break;
      }
      default:
        // Forward-compatibility: unknown commands are dropped silently
        // (matches chiptune3.js's default-case console.log style without
        // the noise).
        break;
    }
  }

  // ---------------------------------------------------------------------
  // Public methods — same shape as ChiptuneJsPlayer plus play() overload.
  // ---------------------------------------------------------------------

  /**
   * Play a tracker module (libopenmpt-routed), a TFMX pair (tfmx-routed),
   * an AHX/THX file (ahx-routed), or a PCM recording (pcm-routed via the
   * browser's native decoders). Dispatch order in `play(input)`:
   *   1. TfmxPair shape → libtfmx
   *   2. ArrayBuffer + AHX/THX magic + valid version byte → ahx2play
   *   3. `pcmMime` provided by the caller → PCM adapter
   *   4. Anything else → libopenmpt
   * AHX and TFMX worklets are lazy-loaded on first use. The PCM adapter
   * is lazy-created on first PCM play (no worklet — uses HTMLAudioElement).
   *
   * `pcmMime` is the caller's authoritative recording signal, derived from
   * the SOURCE's extension (Library/Local `.mp3`/`.ogg`/`.flac`) — NOT from
   * content sniffing. Content-sniffing every buffer here was a bug: the MP3
   * deep-scan false-positives on tracker modules' raw PCM sample data, so a
   * genuine `.mod` from Library/Local got routed to the `<audio>` element
   * and failed to decode ("Couldn't play that track"). Recordings only ever
   * arrive from a source with a recording extension, so the extension is a
   * complete and safe classifier; module bytes never reach a sniffer now.
   */
  play(input: ArrayBuffer | TfmxPair, pcmMime: MimeType | null = null): void {
    // Safari/WebKit suspends the AudioContext aggressively — notably across
    // the cross-engine worklet switch — which silently freezes the TFMX
    // worklet's process(): metadata loads but audio never renders and the
    // position stays at 0:00. Chromium and Firefox tolerate the single
    // prewarm-time resume() (audio-prewarm.js); Safari does not. Re-assert
    // resume() at the top of every play() (a no-op if already running). This
    // call runs in the user-gesture stack — play() is invoked from the
    // row/track click handler — which is what Safari requires to honour it.
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    if (isTfmxPair(input)) {
      const wasAhx = this.active === "ahx";
      this.active = "tfmx";
      const myGen = ++this.tfmxGeneration;
      this.ahxGeneration++;  // invalidate any pending AHX play
      this.pcmGeneration++;  // invalidate any pending PCM play
      // Silence the libopenmpt engine while TFMX takes over the voice.
      this.chiptune.stop();
      // Synchronously pause the PCM audio element if it exists — no ack
      // handshake needed because <audio>.pause() is synchronous.
      if (this.pcmEl) this.pcmEl.pause();
      // Cross-engine handshake from ahx → tfmx: need ahx's stopped ack
      // before starting tfmx, otherwise both worklets briefly mix.
      const startTfmx = () => {
        this.ensureTfmx()
          .then(() => {
            // Generation guard: if play(other) or stop() ran between the
            // ensureTfmx() call and its resolution, our generation is stale
            // and we MUST NOT post the play. Without this, two engines could
            // render audio simultaneously (TFMX→MOD switch) or a stop()
            // could be silently overridden by a deferred play (TFMX→stop).
            if (myGen !== this.tfmxGeneration) return;
            if (!this.tfmxNode) return;
            // Safari may have re-suspended the context during ensureTfmx()'s
            // async gap (worklet module fetch/compile + the ahx→tfmx stop
            // handshake). Re-assert just before the worklet begins rendering,
            // otherwise process() is never clocked. (See the note in play().)
            if (this.context.state === "suspended") {
              this.context.resume().catch(() => {});
            }
            this.tfmxNode.port.postMessage({
              cmd: "play",
              val: {
                tfx: input.tfx,
                // `sam` is absent for single-file formats; the worklet
                // branches on its presence. `ext` (e.g. ".fc") names the
                // single-file MEMFS file so libtfmx doesn't hunt for a
                // phantom ".sam" sidecar. Both undefined for a plain pair
                // with no ext, which the worklet treats as the pair path.
                sam: input.sam,
                base: input.base ?? "song",
                ext: input.ext,
                dns: input.dns,
              },
            });
          })
          .catch((e) => {
            // ensureTfmx() failed (addModule rejected, or the .then body
            // threw). The worklet was never registered so it can't emit
            // 'err' on its own — surface as a synthetic onError so
            // Player.tsx's onError → playNext path can recover. Without
            // this the UI hangs on "Loading…" forever.
            if (myGen !== this.tfmxGeneration) return;
            console.error("[AudioPlayer] tfmx play aborted", e);
            this.fireEvent("onError", { type: "tfmx-init" });
          });
      };
      if (wasAhx && this.ahxNode) {
        this.ahxNode.port.postMessage({ cmd: "stop" });
        this.waitForStopAck_().then(startTfmx);
      } else {
        startTfmx();
      }
    } else if (looksLikeAhx(input)) {
      const wasTfmx = this.active === "tfmx";
      this.active = "ahx";
      const myGen = ++this.ahxGeneration;
      this.tfmxGeneration++;  // invalidate any pending TFMX play
      this.pcmGeneration++;   // invalidate any pending PCM play
      // Silence the libopenmpt engine.
      this.chiptune.stop();
      if (this.pcmEl) this.pcmEl.pause();
      const startAhx = () => {
        this.ensureAhx()
          .then(() => {
            if (myGen !== this.ahxGeneration) return;
            if (!this.ahxNode) return;
            this.ahxNode.port.postMessage({ cmd: "play", val: input });
          })
          .catch((e) => {
            if (myGen !== this.ahxGeneration) return;
            console.error("[AudioPlayer] ahx play aborted", e);
            this.fireEvent("onError", { type: "ahx-init" });
          });
      };
      if (wasTfmx && this.tfmxNode) {
        // Cross-engine handshake: tfmx → ahx mirrors tfmx → libopenmpt.
        this.tfmxNode.port.postMessage({ cmd: "stop" });
        this.waitForStopAck_().then(startAhx);
      } else {
        startAhx();
      }
    } else if (pcmMime !== null) {
      // The caller flagged this as a recording (by source extension).
      // `input` is runtime-safely an ArrayBuffer here — TfmxPair is
      // excluded above and looksLikeAhx's type predicate narrowed the
      // ArrayBuffer away in its false branch; the playable callers
      // (Player.tsx, EmbedPlayer.tsx) never construct a non-TfmxPair
      // non-ArrayBuffer input. The assertion is the minimum needed to
      // satisfy strict mode without restructuring the dispatch.
      this.playPcm(input as ArrayBuffer, pcmMime);
    } else {
      const wasTfmx = this.active === "tfmx";
      const wasAhx = this.active === "ahx";
      this.active = "libopenmpt";
      this.tfmxGeneration++;
      this.ahxGeneration++;
      this.pcmGeneration++;
      // Synchronously pause PCM if it was active or just lingering. No ack.
      if (this.pcmEl) this.pcmEl.pause();
      if (wasTfmx && this.tfmxNode) {
        // Cross-engine switch: post stop, then wait for the worklet's
        // {cmd:'stopped'} ack before starting libopenmpt — otherwise the
        // TFMX process() keeps writing PCM into the shared gain during
        // the postMessage drain window and both engines briefly mix.
        const node = this.tfmxNode;
        node.port.postMessage({ cmd: "stop" });
        if (this.ahxNode) this.ahxNode.port.postMessage({ cmd: "stop" });
        this.waitForStopAck_().then(() => this.chiptune.play(input));
      } else if (wasAhx && this.ahxNode) {
        // Mirror handshake for ahx → libopenmpt. Same reasoning as the
        // tfmx case above — the ahx worklet keeps rendering PCM until
        // it processes the 'stop' message and acks.
        this.ahxNode.port.postMessage({ cmd: "stop" });
        if (this.tfmxNode) this.tfmxNode.port.postMessage({ cmd: "stop" });
        this.waitForStopAck_().then(() => this.chiptune.play(input));
      } else {
        // libopenmpt was already active: stop any worklet nodes that
        // exist (silently — they're already producing silence so no ack
        // is needed) and play.
        if (this.tfmxNode) this.tfmxNode.port.postMessage({ cmd: "stop" });
        if (this.ahxNode) this.ahxNode.port.postMessage({ cmd: "stop" });
        this.chiptune.play(input);
      }
    }
  }

  private waitForStopAck_(timeoutMs = 100): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (this.pendingStopAck === finish) this.pendingStopAck = undefined;
        resolve();
      };
      this.pendingStopAck = finish;
      // Safety net: if the worklet never replies (init lost, processor
      // disposed, ack postMessage dropped), proceed after a short wait
      // so the user doesn't hang on a silent transition.
      setTimeout(finish, timeoutMs);
    });
  }

  pause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "pause" });
    } else if (this.active === "ahx" && this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "pause" });
    } else if (this.active === "pcm" && this.pcmEl) {
      this.pcmEl.pause();
    } else {
      this.chiptune.pause();
    }
  }

  unpause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "unpause" });
    } else if (this.active === "ahx" && this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "unpause" });
    } else if (this.active === "pcm" && this.pcmEl) {
      // play() returns a Promise; rejection is handled the same way as
      // the initial playPcm autoplay-rejection path.
      const p = this.pcmEl.play();
      if (p && typeof p.catch === "function") {
        p.catch((err: unknown) => {
          this.fireEvent("onError", {
            type: "pcm-autoplay",
            detail: String(err),
          });
        });
      }
    } else {
      this.chiptune.unpause();
    }
  }

  togglePause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "togglePause" });
    } else if (this.active === "ahx" && this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "togglePause" });
    } else if (this.active === "pcm" && this.pcmEl) {
      if (this.pcmEl.paused) {
        this.unpause();
      } else {
        this.pcmEl.pause();
      }
    } else {
      this.chiptune.togglePause();
    }
  }

  stop(): void {
    this.tfmxGeneration++;
    this.ahxGeneration++;
    this.pcmGeneration++;
    if (this.tfmxNode) this.tfmxNode.port.postMessage({ cmd: "stop" });
    if (this.ahxNode) this.ahxNode.port.postMessage({ cmd: "stop" });
    if (this.pcmEl) {
      this.pcmEl.pause();
      this.pcmEl.currentTime = 0;
    }
    this.chiptune.stop();
  }

  seek(seconds: number): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "setPos", val: seconds });
    } else if (this.active === "ahx" && this.ahxNode) {
      // ahx2play has no seek API; the worklet accepts setPos messages
      // silently for facade parity. Documented as a Phase 1 follow-up
      // in design.md "Open Questions".
      this.ahxNode.port.postMessage({ cmd: "setPos", val: seconds });
    } else if (this.active === "pcm" && this.pcmEl) {
      this.pcmEl.currentTime = seconds;
    } else {
      this.chiptune.seek(seconds);
    }
  }

  setPos(seconds: number): void {
    this.seek(seconds);
  }

  setVol(value: number): void {
    // Master gain is shared with chiptune; controlling it through
    // ChiptuneJsPlayer is the same as touching this.gain.gain.value.
    this.chiptune.setVol(value);
  }

  setRepeatCount(count: number): void {
    this.chiptune.setRepeatCount(count);
    if (this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "repeatCount", val: count });
    }
    if (this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "repeatCount", val: count });
    }
  }

  setPitch(value: number): void {
    if (this.active === "libopenmpt") this.chiptune.setPitch(value);
    // TFMX and AHX engines have no pitch control — silently ignored.
  }

  setTempo(value: number): void {
    if (this.active === "libopenmpt") this.chiptune.setTempo(value);
    // TFMX and AHX engines have no tempo control — silently ignored.
  }

  setCtl(name: string, value: string): void {
    if (this.active === "libopenmpt") this.chiptune.setCtl(name, value);
    // TFMX and AHX engines have no libopenmpt ctl table — silently ignored.
  }

  setStereoSeparation(value: number): void {
    // libopenmpt: always update. Its worklet stores the value into config
    // so subsequent tracks inherit it — preserves the persistence behaviour
    // the user expects when switching engines mid-session.
    this.chiptune.setStereoSeparation(value);
    // AHX: forward live to the AHX worklet AND update ahxConfig so the
    // lazy-load init path receives the latest value. Per design.md D9
    // amendment (2026-05-17 post-Phase-0): ahx2play implements stereo
    // separation natively at the same 0..100 percentage scale as
    // libopenmpt.
    this.ahxConfig = { ...this.ahxConfig, stereoSeparation: value };
    if (this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "setStereoSeparation", val: value });
    }
    // TFMX: store in tfmxConfig + forward to the worklet. The worklet
    // records the value but cannot apply it to the running track —
    // libtfmx's only stereo control is `tfx_mixer_init`'s panning arg,
    // which is called once per track. The next track picks up the new
    // value via tfx_mixer_init's panning argument (mapped 0..100 →
    // libtfmx's 50..100 in the worklet). Slider drag during a TFMX
    // track is "best-effort, applied on next track" by design.
    this.tfmxConfig = { ...this.tfmxConfig, stereoSeparation: value };
    if (this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "setStereoSeparation", val: value });
    }
  }

  selectSubsong(index: number): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "selectSubsong", val: index });
    } else if (this.active === "ahx" && this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "selectSubsong", val: index });
    } else {
      this.chiptune.selectSubsong(index);
    }
  }

  /**
   * Currently-active audio engine. Exposed so the Sound pane (and any
   * keyboard handler with per-engine UI behaviour) can gate its controls
   * by `EngineKind` instead of by string-equality on `meta.type`. See
   * design.md D9 in openspec/changes/add-ahx-playback/.
   */
  get activeEngine(): EngineKind {
    return this.active;
  }

  getCurrentTime(): number | undefined {
    return this.currentTime;
  }

  /**
   * Fetch a tracker module from a URL and play it. **libopenmpt-only by
   * design.** This forwards directly to ChiptuneJsPlayer.load(url) and
   * bypasses the facade's `play()` magic-byte sniff. A caller that wants
   * to fetch an AHX file by URL MUST go through `getBuffer(...).then(buf
   * => play(buf))` — the sniff path — rather than `load(url)`.
   *
   * Background: no current caller routes non-libopenmpt URLs through
   * this method. Documented per design.md D14 in
   * openspec/changes/add-ahx-playback/ to prevent a future caller from
   * silently breaking on AHX URLs.
   */
  load(url: string): void {
    this.chiptune.load(url);
  }

  /**
   * Tear down player-owned resources. Disconnects the TFMX worklet node
   * from the master gain, clears the handler list, and invalidates any
   * pending TFMX play resolution. Safe to call multiple times.
   *
   * Does NOT close the AudioContext — it may be the shared prewarmed
   * context owned by audio-prewarm.js. Whoever constructed the
   * AudioPlayer owns the context lifecycle.
   */
  dispose(): void {
    this.tfmxGeneration++;
    this.ahxGeneration++;
    this.pcmGeneration++;
    if (this.tfmxNode) {
      try { this.tfmxNode.port.postMessage({ cmd: "stop" }); } catch { /* port closed */ }
      try { this.tfmxNode.disconnect(); } catch { /* not connected */ }
      this.tfmxNode = undefined;
    }
    if (this.ahxNode) {
      try { this.ahxNode.port.postMessage({ cmd: "stop" }); } catch { /* port closed */ }
      try { this.ahxNode.disconnect(); } catch { /* not connected */ }
      this.ahxNode = undefined;
    }
    if (this.pcmEl) {
      try { this.pcmEl.pause(); } catch { /* ignore */ }
      const src = this.pcmEl.src;
      if (src && src.startsWith("blob:")) {
        try { URL.revokeObjectURL(src); } catch { /* ignore */ }
      }
      try { this.pcmEl.removeAttribute("src"); } catch { /* ignore */ }
    }
    if (this.pcmSrc) {
      try { this.pcmSrc.disconnect(); } catch { /* not connected */ }
      this.pcmSrc = undefined;
    }
    this.pcmEl = undefined;
    this.pcmReady = undefined;
    this.tfmxReady = undefined;
    this.ahxReady = undefined;
    this.pendingStopAck = undefined;
    this.handlers = [];
    try { this.analyser.disconnect(); } catch { /* not connected */ }
    this.chiptune.stop();
  }

  // ---------------------------------------------------------------------
  // Handlers — same shape as ChiptuneJsPlayer.
  // ---------------------------------------------------------------------

  addHandler(eventName: EventName, handler: Handler): void {
    this.handlers.push({ eventName, handler });
  }

  fireEvent(eventName: EventName, payload?: unknown): void {
    for (const h of this.handlers) {
      if (h.eventName === eventName) h.handler(payload);
    }
  }

  onInitialized(handler: () => void): void {
    this.addHandler("onInitialized", handler);
  }
  onEnded(handler: () => void): void {
    this.addHandler("onEnded", handler);
  }
  onError(handler: (payload: { type: string }) => void): void {
    this.addHandler("onError", handler as Handler);
  }
  onMetadata(handler: (meta: ChiptuneMeta) => void): void {
    this.addHandler("onMetadata", handler as Handler);
  }
  onProgress(handler: (payload: { pos: number }) => void): void {
    this.addHandler("onProgress", handler as Handler);
  }
}
