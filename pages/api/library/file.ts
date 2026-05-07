// GET /api/library/file?path=<file>
// Streams the raw bytes of the requested module file.

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { LIBRARY_ROOT, isModuleFile, resolveSafe } from "../../../lib/library";

export const config = {
  api: {
    responseLimit: false,
  },
};

type ErrorResponse = { error: string };

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

  if (!isModuleFile(filepath)) {
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
