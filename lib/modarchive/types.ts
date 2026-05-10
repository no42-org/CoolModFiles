/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ChartKind =
  | "featured"
  | "tophits"
  | "topfavourites"
  | "topscore"
  | "topartists"
  | "topmembers";

// A mod row from a mod-chart page (tophits / topfavourites / topscore) or
// from an artist's / member's drill-in mod list.
export type ModItem = {
  id: number;
  title: string;
  filename?: string;
  rank?: number;
};

// A person row from topartists or topmembers.
export type PersonItem = {
  id: number;
  name: string;
  rank?: number;
};

export type Pagination = { page: number; totalPages: number };

export type ModChartResponse = {
  kind: "mods";
  items: ModItem[];
  pagination: Pagination;
};
export type PeopleChartResponse = {
  kind: "people";
  items: PersonItem[];
  pagination: Pagination;
};
export type ChartResponse = ModChartResponse | PeopleChartResponse;
export type PersonModsResponse = {
  items: ModItem[];
  pagination: Pagination;
};

// One genre row inside a category section on /index.php?request=view_genres.
export type Genre = {
  id: number;
  name: string;
  count?: number;
};

// One category section ("Alternative", "Pop", "Electronic", …) holding
// the genres that belong to it.
export type GenreCategory = {
  name: string;
  genres: Genre[];
};

export type GenresResponse = { categories: GenreCategory[] };

// Genre search results — same shape as PersonModsResponse, but the
// upstream HTML uses different selectors so we keep a distinct type
// to make the call sites explicit.
export type GenreModsResponse = {
  items: ModItem[];
  pagination: Pagination;
};
