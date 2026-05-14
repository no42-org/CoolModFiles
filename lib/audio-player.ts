/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Engine-agnostic audio playback facade.
 *
 * Wraps the existing ChiptuneJsPlayer (libopenmpt under the hood) and
 * adds a lazy-loaded 'tfmx-processor' worklet for TFMX playback. Dispatches
 * by the shape of `play()`'s argument:
 *   - ArrayBuffer            → tracker module via libopenmpt
 *   - { tfx, sam[, base] }   → TFMX pair via libtfmxaudiodecoder
 *
 * Public API mirrors ChiptuneJsPlayer 1:1 plus an overload on `play()`,
 * so a caller that today does `new ChiptuneJsPlayer({...})` can swap in
 * `new AudioPlayer({...})` without touching anything else.
 *
 * Architecture: the inner ChiptuneJsPlayer owns the AudioContext, the
 * master GainNode, and the libopenmpt-processor worklet (eager init —
 * cold-start path for MOD playback is unchanged). The facade owns the
 * lazy tfmx-processor worklet. Both worklets connect to the same gain;
 * the inactive engine renders silence each block, so engine switching
 * involves only a postMessage('stop') + postMessage('play') round-trip
 * (no audio-graph reconnection). MOD cold start is byte-for-byte the
 * same as before this change.
 */

export type TfmxPair = {
  tfx: ArrayBuffer | Uint8Array;
  sam: ArrayBuffer | Uint8Array;
  base?: string;
};

export type AudioPlayerConfig = ChiptuneConfig;

type EngineKind = "libopenmpt" | "tfmx";

type EventName =
  | "onInitialized"
  | "onEnded"
  | "onError"
  | "onMetadata"
  | "onProgress"
  | "onFullAudioData";

type Handler = (payload?: unknown) => void;

function isTfmxPair(input: unknown): input is TfmxPair {
  return (
    typeof input === "object" &&
    input !== null &&
    "tfx" in input &&
    "sam" in input
  );
}

export class AudioPlayer {
  context: AudioContext;
  gain: GainNode;

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

  private handlers: Array<{ eventName: EventName; handler: Handler }> = [];

  constructor(cfg: AudioPlayerConfig = {}) {
    // Hand the config straight to ChiptuneJsPlayer. If the caller passed
    // a prewarmed context (the documented pattern in audio-prewarm.js +
    // Player.tsx), it sets up around that. Otherwise chiptune creates its
    // own context.
    this.chiptune = new ChiptuneJsPlayer(cfg);
    this.context = this.chiptune.context;
    this.gain = this.chiptune.gain;
    // Strip the AudioContext before stashing for postMessage. Structured
    // clone rejects AudioContext; the only consumer of tfmxConfig is the
    // worklet's {cmd:'config'} message, which doesn't need it anyway.
    const { context: _omitCtx, ...cloneable } = cfg;
    void _omitCtx;
    this.tfmxConfig = cloneable;

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
      this.tfmxReady = this.context.audioWorklet
        .addModule("/tfmx.worklet.js")
        .then(() => {
          this.tfmxNode = new AudioWorkletNode(this.context, "tfmx-processor", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          this.tfmxNode.port.onmessage = (msg) => this.handleTfmxMessage_(msg);
          // Push the same config object the chiptune wrapper does so the
          // facade's listeners see a consistent meta shape regardless of
          // engine. libtfmx's worklet stores config for parity only — it
          // doesn't implement stereo separation / interpolation today.
          this.tfmxNode.port.postMessage({ cmd: "config", val: this.tfmxConfig });
          // Connect to the same master gain ChiptuneJsPlayer is using, so
          // setVol() controls both engines transparently. The non-active
          // engine emits silence each block per the AudioWorklet contract.
          this.tfmxNode.connect(this.gain);
        })
        .catch((e) => {
          console.error("[AudioPlayer] tfmx.worklet.js failed to load", e);
          this.tfmxReady = undefined; // allow retry on next play
          throw e;
        });
    }
    return this.tfmxReady;
  }

  private handleTfmxMessage_(msg: MessageEvent) {
    const data = msg.data as { cmd: string; [k: string]: unknown };
    switch (data.cmd) {
      case "meta": {
        if (this.active !== "tfmx") return;
        const m = data.meta as ChiptuneMeta;
        this.meta = m;
        this.duration = m.dur;
        this.fireEvent("onMetadata", m);
        break;
      }
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
   * Play a tracker module (libopenmpt-routed) or a TFMX pair (tfmx-routed).
   * Dispatches by argument shape:
   *   - ArrayBuffer            → libopenmpt
   *   - { tfx, sam[, base] }   → libtfmx (lazy-load on first call)
   */
  play(input: ArrayBuffer | TfmxPair): void {
    if (isTfmxPair(input)) {
      this.active = "tfmx";
      const myGen = ++this.tfmxGeneration;
      // Silence the libopenmpt engine while TFMX takes over the voice.
      this.chiptune.stop();
      void this.ensureTfmx().then(() => {
        // Generation guard: if play(other) or stop() ran between the
        // ensureTfmx() call and its resolution, our generation is stale
        // and we MUST NOT post the play. Without this, two engines could
        // render audio simultaneously (TFMX→MOD switch) or a stop()
        // could be silently overridden by a deferred play (TFMX→stop).
        if (myGen !== this.tfmxGeneration) return;
        if (!this.tfmxNode) return;
        this.tfmxNode.port.postMessage({
          cmd: "play",
          val: {
            tfx: input.tfx,
            sam: input.sam,
            base: input.base ?? "song",
          },
        });
      });
    } else {
      this.active = "libopenmpt";
      this.tfmxGeneration++;  // invalidate any pending TFMX play
      // Silence the TFMX engine if it had been playing.
      if (this.tfmxNode) {
        this.tfmxNode.port.postMessage({ cmd: "stop" });
      }
      this.chiptune.play(input);
    }
  }

  pause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "pause" });
    } else {
      this.chiptune.pause();
    }
  }

  unpause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "unpause" });
    } else {
      this.chiptune.unpause();
    }
  }

  togglePause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "togglePause" });
    } else {
      this.chiptune.togglePause();
    }
  }

  stop(): void {
    this.tfmxGeneration++;  // invalidate any pending TFMX play
    if (this.tfmxNode) this.tfmxNode.port.postMessage({ cmd: "stop" });
    this.chiptune.stop();
  }

  seek(seconds: number): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "setPos", val: seconds });
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
  }

  setPitch(value: number): void {
    if (this.active === "libopenmpt") this.chiptune.setPitch(value);
    // TFMX engine has no pitch control — silently ignored.
  }

  setTempo(value: number): void {
    if (this.active === "libopenmpt") this.chiptune.setTempo(value);
    // TFMX engine has no tempo control — silently ignored.
  }

  setCtl(name: string, value: string): void {
    if (this.active === "libopenmpt") this.chiptune.setCtl(name, value);
    // TFMX engine has no libopenmpt ctl table — silently ignored.
  }

  setStereoSeparation(value: number): void {
    this.chiptune.setStereoSeparation(value);
    // TFMX engine doesn't currently map to libopenmpt's stereo-separation
    // semantics (different scale: libtfmx 100=full stereo, 50=mono); the
    // worklet accepts the message and ignores it for now.
    if (this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "setStereoSeparation", val: value });
    }
  }

  selectSubsong(index: number): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "selectSubsong", val: index });
    } else {
      this.chiptune.selectSubsong(index);
    }
  }

  getCurrentTime(): number | undefined {
    return this.currentTime;
  }

  /** Fetch a tracker module from a URL and play it. libopenmpt-only path. */
  load(url: string): void {
    this.chiptune.load(url);
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
