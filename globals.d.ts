// Vendor JS globals from public/chiptune3.js. The script is loaded as
// an ES module via a <script type="module"> tag in pages/_document.tsx,
// and attaches ChiptuneJsPlayer to window so non-module React code can
// reference the class without an import.
//
// Unlike the chiptune2 era, chiptune3 is async/event-based:
//  - currentTime, duration, meta are PROPERTIES set by messages from
//    the worklet, not methods returning live values.
//  - The constructor is async — first play() must wait for onInitialized.
//  - setVol takes 0..1 (GainNode), not 0..100.

type ChiptuneMeta = {
  title?: string;
  artist?: string;
  date?: string;
  type?: string;
  message?: string;
  dur?: number;
  song?: unknown;
  totalOrders?: number;
  totalPatterns?: number;
  libopenmptVersion?: string;
  libopenmptBuild?: string;
};

type ChiptuneConfig = {
  repeatCount?: number;
  stereoSeparation?: number;
  interpolationFilter?: number;
  context?: AudioContext;
};

declare class ChiptuneJsPlayer {
  constructor(config?: ChiptuneConfig);
  context: AudioContext;
  gain: GainNode;
  meta?: ChiptuneMeta;
  duration?: number;
  currentTime?: number;
  play(buffer: ArrayBuffer): void;
  pause(): void;
  unpause(): void;
  togglePause(): void;
  stop(): void;
  seek(seconds: number): void;
  setPos(seconds: number): void;
  setVol(value: number): void;
  setRepeatCount(count: number): void;
  setPitch(value: number): void;
  setTempo(value: number): void;
  selectSubsong(index: number): void;
  getCurrentTime(): number | undefined;
  load(url: string): void;
  addHandler(eventName: string, handler: (payload?: unknown) => void): void;
  onInitialized(handler: () => void): void;
  onEnded(handler: () => void): void;
  onError(handler: (payload: { type: string }) => void): void;
  onMetadata(handler: (meta: ChiptuneMeta) => void): void;
  onProgress(handler: (payload: { pos: number }) => void): void;
}

interface Window {
  __chiptunePrewarmedAudioContext?: AudioContext;
}

// CSS-only side-effect imports (e.g. @fontsource/press-start-2p,
// react-toastify/dist/ReactToastify.css, rc-slider/assets/index.css).
declare module "*.css";
declare module "@fontsource/*";
