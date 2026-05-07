// GET /api/library/search?q=<query>
// Walks the configured library tree and returns up to MAX_SEARCH_RESULTS
// file paths whose basename matches the query (case-insensitive substring).

import fs from "fs/promises";
import path from "path";
import {
  LIBRARY_ROOT,
  MAX_DEPTH,
  MAX_SEARCH_RESULTS,
  isModuleFile,
} from "../../../lib/library";

async function walk(dir, root, query, results, depth = 0) {
  if (depth > MAX_DEPTH) return;
  if (results.length >= MAX_SEARCH_RESULTS) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (results.length >= MAX_SEARCH_RESULTS) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, root, query, results, depth + 1);
    } else if (e.isFile() && isModuleFile(e.name)) {
      if (e.name.toLowerCase().includes(query)) {
        results.push(path.relative(root, full));
      }
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

  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) {
    return res.status(400).json({ error: "missing_query" });
  }

  const root = path.resolve(LIBRARY_ROOT);
  const results = [];
  await walk(root, root, q, results);

  return res.status(200).json({ results });
}
