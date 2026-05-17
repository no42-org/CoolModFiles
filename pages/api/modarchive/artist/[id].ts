/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { fetchHtml } from "../../../../lib/modarchive/fetch";
import * as cache from "../../../../lib/modarchive/cache";
import {
  parsePagination,
  parsePersonMods,
} from "../../../../lib/modarchive/parse";
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

  const pageRaw = Array.isArray(req.query.page)
    ? req.query.page[0]
    : req.query.page;
  const page = pageRaw ? Number(pageRaw) : 1;
  if (!Number.isInteger(page) || page <= 0) {
    return res.status(400).json({ error: "page must be a positive integer" });
  }

  // Hit the canonical URL directly. modules.php?<id> 302-redirects here and
  // the redirect drops &page=N, so pagination only works on the post-redirect form.
  const baseUrl = `https://modarchive.org/index.php?request=view_artist_modules&query=${id}`;
  const url = page === 1 ? baseUrl : `${baseUrl}&page=${page}`;
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
  let pagination;
  try {
    items = parsePersonMods(html);
    pagination = parsePagination(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    return res.status(502).json({ error: msg });
  }

  if (items.length === 0) {
    return res.status(404).json({ error: "no mods found for this artist" });
  }

  const payload: PersonModsResponse = { items, pagination };
  cache.set(url, payload, cache.DEFAULT_TTL_SEC);
  return res.status(200).json(payload);
}
