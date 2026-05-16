// GET /api/library/file?path=<file>
// Streams the raw bytes of the requested file. Allowlist covers MOD
// tracker formats plus TFMX-pair halves. TFMX halves are only served
// when their partner half exists in the same directory — see design
// D4 "orphan-half rejection preserves the security perimeter".

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import path from "path";
import { createReadStream } from "fs";
import { LIBRARY_ROOT, isModuleFile, resolveSafe } from "../../../lib/library";
import { parseHalfName } from "../../../lib/tfmx/pairs";
import { detectPairsInDir } from "../../../lib/library/pairs";

export const config = {
  api: {
    responseLimit: false,
  },
};

type ErrorResponse = { error: string };

/**
 * Returns true when the file at `filepath` is a TFMX half whose partner
 * exists in the same directory. False for non-halves, orphan halves, or
 * unreadable directories. The check uses readdir + pair grouping rather
 * than fs.stat on a guessed partner name: convention coverage is
 * canonical in detectPairsInDir, which already understands all three
 * naming patterns.
 */
async function hasTfmxPartner(filepath: string): Promise<boolean> {
  const dir = path.dirname(filepath);
  const name = path.basename(filepath);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, isFile: true }));
  for (const pair of detectPairsInDir(files)) {
    if (pair.tfx === name || pair.sam === name) return true;
  }
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ErrorResponse>
) {
  if (!LIBRARY_ROOT) {
    return res.status(404).json({ error: "library_disabled" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const userPath = req.query.path;
  if (!userPath || typeof userPath !== "string") {
    return res.status(400).json({ error: "missing_path" });
  }

  let filepath: string;
  try {
    filepath = await resolveSafe(userPath, LIBRARY_ROOT);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT")
      return res.status(404).json({ error: "not_found" });
    if (err.code === "EACCES")
      return res.status(403).json({ error: "forbidden" });
    return res.status(500).json({ error: "internal" });
  }

  const basename = path.basename(filepath);
  const isMod = isModuleFile(filepath);
  const isTfmxHalf = parseHalfName(basename) !== null;

  if (!isMod && !isTfmxHalf) {
    return res.status(404).json({ error: "not_found" });
  }

  // Orphan-half rejection: serving a TFMX half without its partner
  // would broaden the filename-extension perimeter without any
  // partner-existence defense. Reject before the stat / stream.
  if (isTfmxHalf && !(await hasTfmxPartner(filepath))) {
    return res.status(404).json({ error: "not_found" });
  }

  let stat;
  try {
    stat = await fs.stat(filepath);
  } catch {
    return res.status(404).json({ error: "not_found" });
  }
  if (!stat.isFile()) {
    return res.status(404).json({ error: "not_found" });
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", stat.size);

  const stream = createReadStream(filepath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "read_failed" });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
}
