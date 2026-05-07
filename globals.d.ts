// Vendor JS globals from public/chiptune2.js + public/libopenmpt.js.
// These scripts are loaded via <script> tags in pages/_document.tsx
// and create runtime globals that React code uses without imports.
//
// The declarations below cover the methods we currently call. Extend
// as needed when new methods are uncovered during the TypeScript
// migration.

declare class ChiptuneJsPlayer {
  constructor(config: ChiptuneJsConfig);
  load(input: string): Promise<ArrayBuffer>;
  play(buffer: ArrayBuffer): void;
  pause(): void;
  togglePause(): void;
  stop(): void;
  seek(seconds: number): void;
  getPosition(): number;
  duration(): number;
  metadata(): {
    title?: string;
    artist?: string;
    date?: string;
    type?: string;
    message?: string;
  };
  setVolume(percent: number): void;
  setRepeatCount(count: number): void;
  fireEvent(name: string, payload: object): void;
  getLibraryVersion(): string;
  getCoreVersion(): string;
}

declare class ChiptuneJsConfig {
  constructor(repeatCount?: number, volume?: number);
}

// CSS-only side-effect imports (e.g. @fontsource/press-start-2p,
// react-toastify/dist/ReactToastify.css, rc-slider/assets/index.css).
declare module "*.css";
declare module "@fontsource/*";
