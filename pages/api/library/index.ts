// GET /api/library?path=<dir>
// Returns { dirs, files, pairs, truncated } for the immediate children
// of the requested directory level. TFMX-pair halves are grouped into
// `pairs`; the remaining files are MOD-allowlist filtered into `files`.
//
// This endpoint does NOT honour the `excludeRecordings` query parameter
// (see /api/library/random) — folder listings always reflect filesystem
// reality. Per add-lost-module-recordings Decision 14.

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import {
  LIBRARY_ROOT,
  MAX_LISTING,
  isModuleFile,
  resolveSafe,
} from "../../../lib/library";
import {
  detectPairsInDir,
  detectSinglesInDir,
  type TfmxPairEntry,
  type TfmxSingleEntry,
} from "../../../lib/library/pairs";

type ListingResponse = {
  dirs: string[];
  files: string[];
  pairs: TfmxPairEntry[];
  singles: TfmxSingleEntry[];
  truncated: boolean;
};
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListingResponse | ErrorResponse>
) {
  if (!LIBRARY_ROOT) {
    return res.status(404).json({ error: "library_disabled" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const rawPath = req.query.path;
  const userPath = typeof rawPath === "string" ? rawPath : "";
  let dir: string;
  try {
    dir = await resolveSafe(userPath, LIBRARY_ROOT);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT")
      return res.status(404).json({ error: "not_found" });
    if (err.code === "EACCES")
      return res.status(403).json({ error: "forbidden" });
    return res.status(500).json({ error: "internal" });
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return res.status(500).json({ error: "read_failed" });
  }

  const dirs: string[] = [];
  const fileEntries: { name: string; isFile: boolean }[] = [];
  for (const e of entries) {
    if (e.isDirectory()) dirs.push(e.name);
    else if (e.isFile()) fileEntries.push({ name: e.name, isFile: true });
  }
  const pairs = detectPairsInDir(fileEntries);
  // Single-file libtfmx modules (Hippel / Future Composer). Their
  // extensions are not in the MOD allowlist, so they are naturally absent
  // from `files` below — no double-filter needed.
  const singles = detectSinglesInDir(fileEntries);
  // MOD allowlist excludes TFMX-half AND single-file extensions, so no
  // double-filter is needed to keep those out of `files`. Orphan halves
  // are naturally excluded too — they have non-MOD extensions.
  const files = fileEntries
    .filter((f) => isModuleFile(f.name))
    .map((f) => f.name);
  dirs.sort();
  files.sort();

  // Truncation policy per design.md Open Questions: favour navigation
  // (dirs) > content groups (pairs, singles) > individual files.
  const total = dirs.length + pairs.length + singles.length + files.length;
  const truncated = total > MAX_LISTING;

  const dirsOut = dirs.slice(0, MAX_LISTING);
  const remainingForPairs = Math.max(0, MAX_LISTING - dirsOut.length);
  const pairsOut = pairs.slice(0, remainingForPairs);
  const remainingForSingles = Math.max(
    0,
    MAX_LISTING - dirsOut.length - pairsOut.length
  );
  const singlesOut = singles.slice(0, remainingForSingles);
  const remainingForFiles = Math.max(
    0,
    MAX_LISTING - dirsOut.length - pairsOut.length - singlesOut.length
  );
  const filesOut = files.slice(0, remainingForFiles);

  return res.status(200).json({
    dirs: dirsOut,
    files: filesOut,
    pairs: pairsOut,
    singles: singlesOut,
    truncated,
  });
}
