/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { fetchHtml } from "../../../lib/modarchive/fetch";
import * as cache from "../../../lib/modarchive/cache";
import { parseGenres } from "../../../lib/modarchive/parse";
import type { GenresResponse } from "../../../lib/modarchive/types";

const URL = "https://modarchive.org/index.php?request=view_genres";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GenresResponse | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  const cached = cache.get<GenresResponse>(URL);
  if (cached) return res.status(200).json(cached);

  let html: string;
  try {
    html = await fetchHtml(URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return res.status(502).json({ error: msg });
  }

  let categories;
  try {
    categories = parseGenres(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    return res.status(502).json({ error: msg });
  }

  if (categories.length === 0) {
    return res.status(502).json({ error: "no genres parsed" });
  }

  const payload: GenresResponse = { categories };
  cache.set(URL, payload, cache.DEFAULT_TTL_SEC);
  return res.status(200).json(payload);
}
