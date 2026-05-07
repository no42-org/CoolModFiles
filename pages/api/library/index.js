// GET /api/library?path=<dir>
// Returns { dirs: string[], files: string[], truncated: boolean } for the
// immediate children of the requested directory level.

import fs from "fs/promises";
import {
  LIBRARY_ROOT,
  MAX_LISTING,
  isModuleFile,
  resolveSafe,
} from "../../../lib/library";

export default async function handler(req, res) {
  if (!LIBRARY_ROOT) {
    return res.status(404).json({ error: "library_disabled" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const userPath = req.query.path || "";
  let dir;
  try {
    dir = await resolveSafe(userPath, LIBRARY_ROOT);
  } catch (e) {
    if (e.code === "ENOENT") return res.status(404).json({ error: "not_found" });
    if (e.code === "EACCES") return res.status(403).json({ error: "forbidden" });
    return res.status(500).json({ error: "internal" });
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return res.status(500).json({ error: "read_failed" });
  }

  const dirs = [];
  const files = [];
  for (const e of entries) {
    if (e.isDirectory()) dirs.push(e.name);
    else if (e.isFile() && isModuleFile(e.name)) files.push(e.name);
  }
  dirs.sort();
  files.sort();

  const total = dirs.length + files.length;
  const truncated = total > MAX_LISTING;

  return res.status(200).json({
    dirs: dirs.slice(0, MAX_LISTING),
    files: files.slice(0, Math.max(0, MAX_LISTING - dirs.length)),
    truncated,
  });
}
