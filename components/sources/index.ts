// Source abstraction. Each source produces an ArrayBuffer for player.play().
//
// Shape:
//   { type: "modarchive", id: number }
//   { type: "library",    path: string }
//   { type: "local",      file: File }

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

export type Source = ModArchiveSource | LibrarySource | LocalSource;
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

// Player surface needed by getBuffer for the modarchive case.
type PlayerLike = {
  load: (input: string) => Promise<ArrayBuffer>;
};

export async function getBuffer(
  source: Source,
  player: PlayerLike
): Promise<ArrayBuffer> {
  switch (source.type) {
    case "modarchive":
      return player.load(`jsplayer.php?moduleid=${source.id}`);
    case "library": {
      const res = await fetch(
        `/api/library/file?path=${encodeURIComponent(source.path)}`
      );
      if (!res.ok) throw new Error(`library fetch failed: ${res.status}`);
      return res.arrayBuffer();
    }
    case "local":
      return source.file.arrayBuffer();
  }
}

export function getPermalink(source: Source): string | null {
  switch (source.type) {
    case "modarchive":
      return `?source=modarchive&id=${source.id}`;
    case "library":
      return `?source=library&path=${encodeURIComponent(source.path)}`;
    case "local":
      return null;
  }
}

export function isFavoritable(source: Source): boolean {
  return source.type !== "local";
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
  }
}
