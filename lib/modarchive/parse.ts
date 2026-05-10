/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// HTML parsers for modarchive.org chart and drill-in pages. Selectors
// were derived from the actual rendered HTML in 2026-05; if modarchive
// restructures their templates, update the selectors here in one place.
//
// URL → page-shape mapping:
//   index.php?request=view_chart&query=tophits        — mod chart
//   index.php?request=view_chart&query=topfavourites  — mod chart
//   index.php?request=view_chart&query=topscore       — mod chart
//   index.php?request=view_top_favourites             — mod chart (alt URL form)
//   index.php?request=view_chart&query=topartists     — people chart (artists)
//   index.php?request=view_chart&query=topmembers     — people chart (members)
//   modules.php?<artistid>                            — artist drill-in
//                                                       (302 → view_artist_modules)
//   member.php?<memberid>                             — member drill-in
//                                                       (302 → view_member)
//
// All chart pages return ~40 items per page, paginated up to 25 pages.
// We fetch page 1 only — explicit v1 scope.

import * as cheerio from "cheerio";
import type { ModItem, Pagination, PersonItem } from "./types";

// Pagination on chart pages is rendered as a strip of `<a>` tags whose
// hrefs include `&page=N#mods` (or `?page=N` etc). The currently active
// page uses class `pagination-selected`. Total pages = max page number
// referenced anywhere in the strip. If no pagination markup is found,
// assume single-page result.
export function parsePagination(html: string): Pagination {
  const $ = cheerio.load(html);
  const seen = new Set<number>();
  let active = 1;
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/[?&]page=(\d+)/);
    if (!m) return;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return;
    seen.add(n);
    if ($(el).attr("class")?.includes("pagination-selected")) {
      active = n;
    }
  });
  if (seen.size === 0) return { page: 1, totalPages: 1 };
  const totalPages = Math.max(...seen);
  return { page: active, totalPages };
}

function extractIdFromHref(href: string): number | null {
  // Matches `module.php?12345` / `modules.php?67890` / `member.php?13579`.
  const m = href.match(/[?](\d+)/);
  return m ? Number(m[1]) : null;
}

// Mod-chart pages share the same row shape:
//   <a class="chart-listing-title" href="module.php?<id>">TITLE</a>
//   <span class="chart-listing">FILENAME.ext</span>
//   <h1 class="chart-listing-title">#N</h1>           ← rank, in a sibling td
export function parseModChart(html: string): ModItem[] {
  const $ = cheerio.load(html);
  const items: ModItem[] = [];
  $("a.chart-listing-title").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href.startsWith("module.php?")) return;
    const id = extractIdFromHref(href);
    if (id === null) return;
    const title = $(el).text().trim();
    // Filename lives in the same <td> in a `<span class="chart-listing">`.
    const filename =
      $(el).closest("td").find("span.chart-listing").first().text().trim() ||
      undefined;
    // Rank is in a sibling <td> as `<h1 class="chart-listing-title">#N</h1>`.
    const rankText = $(el)
      .closest("tr")
      .find("h1.chart-listing-title")
      .first()
      .text()
      .trim();
    const rankMatch = rankText.match(/(\d+)/);
    const rank = rankMatch ? Number(rankMatch[1]) : undefined;
    items.push({ id, title, filename, rank });
  });
  return items;
}

// People-chart pages (topartists, topmembers) share the same row shape but
// link to either `modules.php?<id>` (artists) or `member.php?<id>` (members).
export function parsePeopleChart(
  html: string,
  expected: "artists" | "members"
): PersonItem[] {
  const $ = cheerio.load(html);
  const prefix = expected === "artists" ? "modules.php?" : "member.php?";
  const items: PersonItem[] = [];
  $("a.chart-listing-title").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href.startsWith(prefix)) return;
    const id = extractIdFromHref(href);
    if (id === null) return;
    const name = $(el).text().trim();
    const rankText = $(el)
      .closest("tr")
      .find("h1.chart-listing-title")
      .first()
      .text()
      .trim();
    const rankMatch = rankText.match(/(\d+)/);
    const rank = rankMatch ? Number(rankMatch[1]) : undefined;
    items.push({ id, name, rank });
  });
  return items;
}

// Artist's mod list (`modules.php?<artistid>` redirects to
// `index.php?request=view_artist_modules&query=<artistid>`). Each row:
//   <a class="module-listing" href="module.php?<id>" title="filename.mod">filename.mod</a>
//   <span class="module-listing">Title (Subtitle)</span>
export function parsePersonMods(html: string): ModItem[] {
  const $ = cheerio.load(html);
  const items: ModItem[] = [];
  $("a.module-listing").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href.startsWith("module.php?")) return;
    const id = extractIdFromHref(href);
    if (id === null) return;
    const filename = $(el).text().trim();
    // Title lives in the next sibling <td>'s `<span class="module-listing">`.
    const title =
      $(el).closest("td").next("td").find("span.module-listing").first().text().trim() ||
      filename;
    items.push({ id, title, filename });
  });
  return items;
}
