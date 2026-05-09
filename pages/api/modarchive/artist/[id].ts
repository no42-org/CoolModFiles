/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { fetchHtml } from "../../../../lib/modarchive/fetch";
import * as cache from "../../../../lib/modarchive/cache";
import { parsePersonMods } from "../../../../lib/modarchive/parse";
import type { PersonModsResponse } from "../../../../lib/modarchive/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PersonModsResponse | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }
  const idParam = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id must be a positive integer" });
  }

  // modarchive.org redirects modules.php?<id> → index.php?request=view_artist_modules&query=<id>
  const url = `https://modarchive.org/modules.php?${id}`;
  const cached = cache.get<PersonModsResponse>(url);
  if (cached) return res.status(200).json(cached);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return res.status(502).json({ error: msg });
  }

  let items;
  try {
    items = parsePersonMods(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    return res.status(502).json({ error: msg });
  }

  if (items.length === 0) {
    return res.status(404).json({ error: "no mods found for this artist" });
  }

  const payload: PersonModsResponse = { items };
  cache.set(url, payload, cache.DEFAULT_TTL_SEC);
  return res.status(200).json(payload);
}
