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

export type TfmxPair = {
  tfx: ArrayBuffer | Uint8Array;
  sam: ArrayBuffer | Uint8Array;
  base?: string;
};

export type AudioPlayerConfig = ChiptuneConfig;

type EngineKind = "libopenmpt" | "tfmx" | "ahx";

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

/**
 * Magic-byte sniff for AHX/THX buffers. Returns true iff:
 *  - The buffer has at least 4 bytes
 *  - Bytes 0-2 are ASCII "AHX" (0x41 0x48 0x58) OR ASCII "THX" (0x54 0x48 0x58)
 *  - Byte 3 (the format version byte) is 0x00 (v1.00–1.27) or 0x01 (v2.0+)
 *
 * The version-byte allowlist matters: bare 3-letter ASCII trigrams are
 * weak discriminators. A MOD/S3M/STM file whose 20-byte song title
 * happens to start with "AHX" or "THX" (zero-padded to byte 3 = 0x00)
 * passes a naïve 3-byte check; the 4-byte gate makes the false-positive
 * class narrower (per design.md D4 in openspec/changes/add-ahx-playback/).
 *
 * False positives that survive the gate are handled by the AHX engine's
 * load step — a non-AHX buffer with matching first 4 bytes fails
 * ahxLoadFromRAM, the worklet emits {cmd:'err',val:'ptr'}, and the
 * source-type-aware error path recovers.
 */
function looksLikeAhx(input: ArrayBuffer | TfmxPair): input is ArrayBuffer {
  if (!(input instanceof ArrayBuffer)) return false;
  if (input.byteLength < 4) return false;
  const v = new Uint8Array(input, 0, 4);
  const prefixMatches =
    (v[0] === 0x41 && v[1] === 0x48 && v[2] === 0x58) ||
    (v[0] === 0x54 && v[1] === 0x48 && v[2] === 0x58);
  if (!prefixMatches) return false;
  return v[3] === 0x00 || v[3] === 0x01;
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
        console.error("[AudioPlayer] tfmx engine init failed", e);
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
   * or an AHX/THX file (ahx-routed). Dispatch order in `play(input)`:
   *   1. TfmxPair shape → libtfmx
   *   2. ArrayBuffer + AHX/THX magic + valid version byte → ahx2play
   *   3. Anything else → libopenmpt
   * AHX and TFMX worklets are lazy-loaded on first use.
   */
  play(input: ArrayBuffer | TfmxPair): void {
    if (isTfmxPair(input)) {
      const wasAhx = this.active === "ahx";
      this.active = "tfmx";
      const myGen = ++this.tfmxGeneration;
      this.ahxGeneration++;  // invalidate any pending AHX play
      // Silence the libopenmpt engine while TFMX takes over the voice.
      this.chiptune.stop();
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
            this.tfmxNode.port.postMessage({
              cmd: "play",
              val: {
                tfx: input.tfx,
                sam: input.sam,
                base: input.base ?? "song",
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
      // Silence the libopenmpt engine.
      this.chiptune.stop();
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
    } else {
      const wasTfmx = this.active === "tfmx";
      const wasAhx = this.active === "ahx";
      this.active = "libopenmpt";
      this.tfmxGeneration++;
      this.ahxGeneration++;
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
    } else {
      this.chiptune.pause();
    }
  }

  unpause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "unpause" });
    } else if (this.active === "ahx" && this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "unpause" });
    } else {
      this.chiptune.unpause();
    }
  }

  togglePause(): void {
    if (this.active === "tfmx" && this.tfmxNode) {
      this.tfmxNode.port.postMessage({ cmd: "togglePause" });
    } else if (this.active === "ahx" && this.ahxNode) {
      this.ahxNode.port.postMessage({ cmd: "togglePause" });
    } else {
      this.chiptune.togglePause();
    }
  }

  stop(): void {
    this.tfmxGeneration++;
    this.ahxGeneration++;
    if (this.tfmxNode) this.tfmxNode.port.postMessage({ cmd: "stop" });
    if (this.ahxNode) this.ahxNode.port.postMessage({ cmd: "stop" });
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
    // TFMX: still not forwarded. libtfmx uses a different scale (100=full
    // stereo / 50=mono) and its worklet does not implement the control.
    // Forward only when libtfmx separation is actually wired up.
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
    this.tfmxReady = undefined;
    this.ahxReady = undefined;
    this.pendingStopAck = undefined;
    this.handlers = [];
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
