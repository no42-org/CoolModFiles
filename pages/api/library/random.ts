// GET /api/library/random
// Returns { path: string } for a random module file in the library.
// Used by the player when 'n' or auto-advance fires while a Library
// track is playing.
//
// Query parameter:
//   excludeRecordings - when truthy (any non-empty string other than
//     "0" / "false"), filters out files whose extensions are in
//     RECORDING_EXTENSIONS. Per add-lost-module-recordings Decision 14
//     ("only random walks benefit from a tracker-only mode"). Default
//     behaviour (parameter absent or falsy) includes recordings in the
//     candidate set alongside trackers.

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import path from "path";
import {
  LIBRARY_ROOT,
  MAX_DEPTH,
  MAX_RANDOM_SCAN,
  RECORDING_EXTENSIONS,
  isModuleFile,
} from "../../../lib/library";

// Truthy parsing per design.md Decision 14: any non-empty string other
// than the lower-case literal "0" or "false" counts as opt-in. Exported
// for unit testing — only `default` is treated as the Next.js handler.
export function isTruthyParam(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "0" || v === "false") return false;
  return true;
}

function isRecordingFile(name: string): boolean {
  const lower = name.toLowerCase();
  return RECORDING_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function collect(
  dir: string,
  root: string,
  files: string[],
  excludeRecordings: boolean,
  depth = 0
): Promise<void> {
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
      await collect(full, root, files, excludeRecordings, depth + 1);
    } else if (e.isFile() && isModuleFile(e.name)) {
      if (excludeRecordings && isRecordingFile(e.name)) continue;
      files.push(path.relative(root, full));
    }
  }
}

type RandomResponse = { path: string };
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RandomResponse | ErrorResponse>
) {
  if (!LIBRARY_ROOT) {
    return res.status(404).json({ error: "library_disabled" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const excludeRecordings = isTruthyParam(req.query.excludeRecordings);

  const root = path.resolve(LIBRARY_ROOT);
  const files: string[] = [];
  await collect(root, root, files, excludeRecordings);

  if (files.length === 0) {
    return res.status(404).json({ error: "empty_library" });
  }

  const idx = Math.floor(Math.random() * files.length);
  return res.status(200).json({ path: files[idx] });
}
