// Source abstraction. Each source produces input for player.play().
//
// Shape:
//   { type: "modarchive",  id: number }
//   { type: "library",     path: string }
//   { type: "local",       file: File }
//   { type: "tfmx-local",  tfx: File, sam: File, base: string }
//
// All variants except `tfmx-local` produce a single ArrayBuffer. The
// `tfmx-local` variant produces a pair `{ tfx, sam }` because TFMX is
// a two-file Amiga format and libtfmx auto-discovers the sample bank
// by filename from the music-data file's path.

export const MODULE_EXTENSIONS = [
  ".mod",
  ".xm",
  ".s3m",
  ".it",
  ".mptm",
  ".stm",
  ".mtm",
  ".669",
  ".med",
  ".okt",
  ".ult",
] as const;

export function isModuleFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return MODULE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export type ModArchiveSource = { type: "modarchive"; id: number };
export type LibrarySource = { type: "library"; path: string };
export type LocalSource = { type: "local"; file: File };
export type TfmxLocalSource = {
  type: "tfmx-local";
  tfx: File;
  sam: File;
  base: string;
};

export type Source =
  | ModArchiveSource
  | LibrarySource
  | LocalSource
  | TfmxLocalSource;
export type SourceType = Source["type"];
export type SourceHistoryBuckets = Record<
  SourceType,
  { items: Source[]; current: number }
>;

export const modArchive = (id: number): ModArchiveSource => ({
  type: "modarchive",
  id,
});
export const library = (path: string): LibrarySource => ({
  type: "library",
  path,
});
export const local = (file: File): LocalSource => ({ type: "local", file });
export const tfmxLocal = (
  tfx: File,
  sam: File,
  base: string
): TfmxLocalSource => ({ type: "tfmx-local", tfx, sam, base });

export type TfmxBuffers = { tfx: ArrayBuffer; sam: ArrayBuffer };
export type SourceBuffer = ArrayBuffer | TfmxBuffers;

export async function getBuffer(source: Source): Promise<SourceBuffer> {
  switch (source.type) {
    case "modarchive": {
      // modarchive.org/jsplayer.php returns a ZIP-wrapped module. The
      // old chiptune2 path got away with feeding ZIP bytes straight to
      // libopenmpt because that WASM build had zlib compiled in;
      // chiptune3's libopenmpt.worklet.js does not. api.modarchive.org/
      // downloads.php returns the raw module bytes — same endpoint the
      // download button already uses, with open CORS.
      const res = await fetch(
        `https://api.modarchive.org/downloads.php?moduleid=${source.id}`
      );
      if (!res.ok) throw new Error(`modarchive fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      // downloads.php returns 200 OK with a 16-byte body ("Invalid ID
      // Error") for unknown moduleids. No real module is anywhere near
      // that small, so reject early and let the caller's .catch retry
      // with a different random id.
      if (buf.byteLength < 100) {
        throw new Error(
          `modarchive returned ${buf.byteLength} bytes for ${source.id} — likely Invalid ID`
        );
      }
      return buf;
    }
    case "library": {
      const res = await fetch(
        `/api/library/file?path=${encodeURIComponent(source.path)}`
      );
      if (!res.ok) throw new Error(`library fetch failed: ${res.status}`);
      return res.arrayBuffer();
    }
    case "local":
      return source.file.arrayBuffer();
    case "tfmx-local":
      // Two buffers, read in parallel; the worklet expects both before
      // it can mount the MEMFS files and call tfx_load.
      return {
        tfx: await source.tfx.arrayBuffer(),
        sam: await source.sam.arrayBuffer(),
      };
  }
}

export function getPermalink(source: Source): string | null {
  switch (source.type) {
    case "modarchive":
      return `?source=modarchive&id=${source.id}`;
    case "library":
      return `?source=library&path=${encodeURIComponent(source.path)}`;
    case "local":
    case "tfmx-local":
      return null;
  }
}

export function isFavoritable(source: Source): boolean {
  // Whitelist server-resolvable sources. Local-style sources (LocalSource,
  // TfmxLocalSource) have no cross-session identity.
  return source.type === "modarchive" || source.type === "library";
}

export function getEmbedUrl(source: Source, domain?: string): string | null {
  const base = domain || "";
  switch (source.type) {
    case "modarchive":
      return `${base}/embed/${source.id}`;
    case "library": {
      const segments = source.path.split("/").map(encodeURIComponent);
      return `${base}/embed/library/${segments.join("/")}`;
    }
    case "local":
    case "tfmx-local":
      return null;
  }
}

export function getEmbedHtml(
  source: Source,
  title: string,
  domain?: string
): string | null {
  const url = getEmbedUrl(source, domain);
  if (!url) return null;
  return `<iframe
  width="100%"
  height="200"
  src="${url}?title=${encodeURIComponent(title)}"
  frameborder="0"
></iframe>`;
}

export function sourceKey(source: Source): string {
  switch (source.type) {
    case "modarchive":
      return `modarchive:${source.id}`;
    case "library":
      return `library:${source.path}`;
    case "local":
      return `local:${source.file.name}:${source.file.size}:${source.file.lastModified}`;
    case "tfmx-local":
      return `tfmx-local:${source.base}:${source.tfx.size}:${source.sam.size}`;
  }
}
