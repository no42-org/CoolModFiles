// GET /api/library/random
// Returns { path: string } for a random module file in the library.
// Used by the player when 'n' or auto-advance fires while a Library
// track is playing.

import fs from "fs/promises";
import path from "path";
import {
  LIBRARY_ROOT,
  MAX_DEPTH,
  MAX_RANDOM_SCAN,
  isModuleFile,
} from "../../../lib/library";

async function collect(dir, root, files, depth = 0) {
  if (depth > MAX_DEPTH) return;
  if (files.length >= MAX_RANDOM_SCAN) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (files.length >= MAX_RANDOM_SCAN) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collect(full, root, files, depth + 1);
    } else if (e.isFile() && isModuleFile(e.name)) {
      files.push(path.relative(root, full));
    }
  }
}

export default async function handler(req, res) {
  if (!LIBRARY_ROOT) {
    return res.status(404).json({ error: "library_disabled" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const root = path.resolve(LIBRARY_ROOT);
  const files = [];
  await collect(root, root, files);

  if (files.length === 0) {
    return res.status(404).json({ error: "empty_library" });
  }

  const idx = Math.floor(Math.random() * files.length);
  return res.status(200).json({ path: files[idx] });
}
