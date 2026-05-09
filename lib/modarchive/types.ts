/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ChartKind =
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

export type ModChartResponse = { kind: "mods"; items: ModItem[] };
export type PeopleChartResponse = { kind: "people"; items: PersonItem[] };
export type ChartResponse = ModChartResponse | PeopleChartResponse;
export type PersonModsResponse = { items: ModItem[] };
