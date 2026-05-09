/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { fetchHtml } from "../../../../lib/modarchive/fetch";
import * as cache from "../../../../lib/modarchive/cache";
import { parseModChart, parsePeopleChart } from "../../../../lib/modarchive/parse";
import type { ChartKind, ChartResponse } from "../../../../lib/modarchive/types";

const CHART_URLS: Record<ChartKind, string> = {
  tophits: "https://modarchive.org/index.php?request=view_chart&query=tophits",
  topfavourites: "https://modarchive.org/index.php?request=view_top_favourites",
  topscore: "https://modarchive.org/index.php?request=view_chart&query=topscore",
  topartists:
    "https://modarchive.org/index.php?request=view_chart&query=topartists",
  topmembers:
    "https://modarchive.org/index.php?request=view_chart&query=topmembers",
};

const VALID_KINDS = new Set<ChartKind>([
  "tophits",
  "topfavourites",
  "topscore",
  "topartists",
  "topmembers",
]);

function isChartKind(value: string): value is ChartKind {
  return VALID_KINDS.has(value as ChartKind);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChartResponse | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }
  const kindParam = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
  if (!kindParam || !isChartKind(kindParam)) {
    return res.status(404).json({ error: "unknown chart kind" });
  }
  const kind: ChartKind = kindParam;
  const url = CHART_URLS[kind];

  const cached = cache.get<ChartResponse>(url);
  if (cached) return res.status(200).json(cached);

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return res.status(502).json({ error: msg });
  }

  let payload: ChartResponse;
  try {
    if (kind === "topartists") {
      payload = { kind: "people", items: parsePeopleChart(html, "artists") };
    } else if (kind === "topmembers") {
      payload = { kind: "people", items: parsePeopleChart(html, "members") };
    } else {
      payload = { kind: "mods", items: parseModChart(html) };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    return res.status(502).json({ error: msg });
  }

  if (payload.items.length === 0) {
    return res.status(502).json({ error: "no items parsed from chart" });
  }

  cache.set(url, payload, cache.DEFAULT_TTL_SEC);
  return res.status(200).json(payload);
}
