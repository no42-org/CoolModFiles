// Source abstraction. Each source produces an ArrayBuffer for player.play().
//
// Shape:
//   { type: "modarchive", id: number }
//   { type: "library",    path: string }
//   { type: "local",      file: File }

export const modArchive = (id) => ({ type: "modarchive", id });
export const library = (path) => ({ type: "library", path });
export const local = (file) => ({ type: "local", file });

export async function getBuffer(source, player) {
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
    default:
      throw new Error(`unknown source type: ${source.type}`);
  }
}

export function getPermalink(source) {
  switch (source.type) {
    case "modarchive":
      return `?source=modarchive&id=${source.id}`;
    case "library":
      return `?source=library&path=${encodeURIComponent(source.path)}`;
    case "local":
      return null;
    default:
      throw new Error(`unknown source type: ${source.type}`);
  }
}

export function isFavoritable(source) {
  return source.type !== "local";
}

export function sourceKey(source) {
  switch (source.type) {
    case "modarchive":
      return `modarchive:${source.id}`;
    case "library":
      return `library:${source.path}`;
    case "local":
      return `local:${source.file.name}:${source.file.size}:${source.file.lastModified}`;
    default:
      throw new Error(`unknown source type: ${source.type}`);
  }
}
