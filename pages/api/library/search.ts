// GET /api/library/search?q=<query>
// Walks the configured library tree and returns up to MAX_SEARCH_RESULTS
// matching entries. Each result is either a MOD file (matched by
// case-insensitive substring on the filename) or a TFMX pair (matched
// by substring on the pair's user-facing base — NOT the on-disk
// filename, per design D8).

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import path from "path";
import {
  LIBRARY_ROOT,
  MAX_DEPTH,
  MAX_SEARCH_RESULTS,
  isModuleFile,
} from "../../../lib/library";
import { detectPairsInDir } from "../../../lib/library/pairs";

type ModResult = { kind: "mod"; path: string };
type TfmxResult = {
  kind: "tfmx";
  tfxPath: string;
  samPath: string;
  base: string;
};
type SearchResult = ModResult | TfmxResult;

async function walk(
  dir: string,
  root: string,
  query: string,
  results: SearchResult[],
  depth = 0
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (results.length >= MAX_SEARCH_RESULTS) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const fileEntries: { name: string; isFile: boolean }[] = [];
  const subdirs: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) subdirs.push(e.name);
    else if (e.isFile()) fileEntries.push({ name: e.name, isFile: true });
  }

  const relDir = path.relative(root, dir).split(path.sep).join("/");
  const prefix = relDir ? `${relDir}/` : "";

  // Build pair lookups so we can emit entries in dir-entry order — the
  // previous pre-TFMX walker emitted MODs in entry order; emitting all
  // pairs first then all files would shift the truncation boundary and
  // hide deep-tree MODs behind shallow-dir pairs once MAX_SEARCH_RESULTS
  // caps.
  const pairs = detectPairsInDir(fileEntries);
  const pairByTfx = new Map(pairs.map((p) => [p.tfx, p]));
  const pairedHalves = new Set<string>();
  for (const p of pairs) {
    pairedHalves.add(p.tfx);
    pairedHalves.add(p.sam);
  }

  for (const f of fileEntries) {
    if (results.length >= MAX_SEARCH_RESULTS) return;
    const pair = pairByTfx.get(f.name);
    if (pair) {
      if (pair.base.toLowerCase().includes(query)) {
        results.push({
          kind: "tfmx",
          tfxPath: prefix + pair.tfx,
          samPath: prefix + pair.sam,
          base: pair.base,
        });
      }
      continue;
    }
    // Sample halves of detected pairs were already emitted via their
    // music-data sibling; skip to avoid double-listing.
    if (pairedHalves.has(f.name)) continue;
    if (!isModuleFile(f.name)) continue;
    if (f.name.toLowerCase().includes(query)) {
      results.push({ kind: "mod", path: prefix + f.name });
    }
  }

  for (const name of subdirs) {
    if (results.length >= MAX_SEARCH_RESULTS) return;
    await walk(path.join(dir, name), root, query, results, depth + 1);
  }
}

type SearchResponse = { results: SearchResult[] };
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse | ErrorResponse>
) {
  if (!LIBRARY_ROOT) {
    return res.status(404).json({ error: "library_disabled" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  if (!q) {
    return res.status(400).json({ error: "missing_query" });
  }

  const root = path.resolve(LIBRARY_ROOT);
  const results: SearchResult[] = [];
  await walk(root, root, q, results);

  return res.status(200).json({ results });
}
