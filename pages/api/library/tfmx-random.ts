/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// GET /api/library/tfmx-random
// Returns { tfxPath, samPath, base } for a uniformly-sampled TFMX pair
// reachable from LIBRARY_ROOT. Sibling of /api/library/random — the MOD
// random endpoint stays MOD-only; this one stays TFMX-only. Splitting
// avoids a server-side weighting policy (50/50? by count?) baked into
// the API surface.

import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { LIBRARY_ROOT, MAX_RANDOM_SCAN } from "../../../lib/library";
import { walkPairs } from "../../../lib/library/pairs";

type RandomResponse = { tfxPath: string; samPath: string; base: string };
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RandomResponse | ErrorResponse>
) {
  if (!LIBRARY_ROOT) {
    return res.status(404).json({ error: "library_disabled" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const root = path.resolve(LIBRARY_ROOT);
  const pairs = await walkPairs(root, MAX_RANDOM_SCAN);

  if (pairs.length === 0) {
    return res.status(404).json({ error: "no_tfmx_pairs" });
  }

  const pick = pairs[Math.floor(Math.random() * pairs.length)];
  return res.status(200).json(pick);
}
