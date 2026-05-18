/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Amiga prefix transform for file-derived display strings.
 * Pure basename transform. Callers with full paths (e.g. Library mod
 * search rows whose `r.path` is `Hippel/Apidya/echoing.mod`) must split
 * the basename off on `/` before calling and rejoin around the result.
 * The transform itself does no path handling.
 *
 * Spec: openspec/changes/add-amiga-prefix-filenames/specs/filename-display/spec.md
 * Algorithm rationale: openspec/changes/add-amiga-prefix-filenames/design.md (Decision 3)
 */

export type FilenameStyle = "auto" | "amiga" | "amiga-all";

// Mode selector for `toAmigaStyle`. `"native"` covers Amiga-native
// formats only; `"all"` extends the table with PC-era tracker formats
// for users who want visual consistency over historical accuracy.
export type AmigaStyleMode = "native" | "all";

// Amiga-native extension → prefix. `.thx` is the earlier extension for
// the AHX engine; both map to the same `ahx.` prefix.
const NATIVE_PREFIX_TABLE: Readonly<Record<string, string>> = Object.freeze({
  ".mod": "mod.",
  ".med": "med.",
  ".okt": "okt.",
  ".ahx": "ahx.",
  ".thx": "ahx.",
});

// "Amiga everywhere" mode: native table plus PC-era trackers. Each PC
// extension maps to its own extension-derived prefix. The product
// directive trades historical accuracy for visual consistency — users
// who opt into this mode want every catalog row in prefix form.
const ALL_PREFIX_TABLE: Readonly<Record<string, string>> = Object.freeze({
  ...NATIVE_PREFIX_TABLE,
  ".xm": "xm.",
  ".it": "it.",
  ".s3m": "s3m.",
  ".mptm": "mptm.",
  ".stm": "stm.",
  ".mtm": "mtm.",
  ".669": "669.",
  ".ult": "ult.",
});

// Recognized prefix → canonical output prefix. Identity for native
// prefixes; `thx.` is an alias that canonicalizes to `ahx.` so a file
// already named `thx.something` is rewritten as `ahx.something` rather
// than left alone (the AHX engine identity wins). The same alias is
// active in 'all' mode.
const PREFIX_ALIAS_TABLE: Readonly<Record<string, string>> = Object.freeze({
  "mod.": "mod.",
  "med.": "med.",
  "okt.": "okt.",
  "ahx.": "ahx.",
  "thx.": "ahx.",
  "xm.": "xm.",
  "it.": "it.",
  "s3m.": "s3m.",
  "mptm.": "mptm.",
  "stm.": "stm.",
  "mtm.": "mtm.",
  "669.": "669.",
  "ult.": "ult.",
});

type TableContext = {
  table: Readonly<Record<string, string>>;
  extensions: readonly string[];
  // Recognition prefixes active for this mode. Each entry pairs the
  // input-side prefix the algorithm matches on with the canonical
  // output-side prefix the algorithm emits — identical for most rows,
  // distinct only for the THX alias.
  aliasEntries: readonly { from: string; to: string }[];
};

function buildContext(
  table: Readonly<Record<string, string>>,
): TableContext {
  // Only include alias entries whose canonical output is one of THIS
  // mode's allowed output prefixes (so PC-era aliases don't leak into
  // 'native' mode).
  const allowedOutputs = new Set(Object.values(table));
  const aliasEntries = Object.entries(PREFIX_ALIAS_TABLE)
    .filter(([, to]) => allowedOutputs.has(to))
    .map(([from, to]) => ({ from, to }));
  return {
    table,
    extensions: Object.keys(table),
    aliasEntries,
  };
}

const NATIVE_CONTEXT = buildContext(NATIVE_PREFIX_TABLE);
const ALL_CONTEXT = buildContext(ALL_PREFIX_TABLE);

/**
 * Transform a basename to Amiga prefix form. Returns the input verbatim
 * for non-Amiga extensions, degenerate inputs, and names already in
 * canonical (lower-case) prefix form. Mixed/upper-case prefixes are
 * canonicalized to lower-case; the base portion preserves the input's
 * case verbatim. Double-form `mod.echoing.mod` collapses to `mod.echoing`.
 *
 * Algorithm (4 ordered steps; matches design.md Decision 3):
 *   1. Bail on a bare allow-list extension (`.mod`, `.MED`, ...).
 *   2. Strip an allow-list suffix if present; remember the implied prefix.
 *   3. If the working string already starts with an allow-list prefix
 *      (case-insensitive) plus a non-empty remainder, return
 *      `<lower-case-prefix>.<remainder-verbatim>`. This is where
 *      idempotency, case canonicalization, AND double-form collapse all
 *      live.
 *   4. Otherwise, if step 2 stripped a suffix, prepend the implied
 *      prefix. If step 2 didn't strip anything, return the input
 *      unchanged.
 */
export function toAmigaStyle(
  name: string,
  mode: AmigaStyleMode = "native",
): string {
  const ctx = mode === "all" ? ALL_CONTEXT : NATIVE_CONTEXT;
  const lower = name.toLowerCase();

  // Step 1: bare allow-list extension (e.g. `.mod`). Without this guard
  // step 4 would emit `mod.` (prefix + empty base).
  if (Object.prototype.hasOwnProperty.call(ctx.table, lower)) {
    return name;
  }

  // Step 2: strip an allow-list suffix if present.
  let working = name;
  let impliedPrefix: string | null = null;
  for (const ext of ctx.extensions) {
    if (lower.endsWith(ext)) {
      const candidate = name.slice(0, name.length - ext.length);
      const prefix = ctx.table[ext];
      // Idempotency guard: if stripping would leave a base whose lower
      // case equals the prefix's letter portion (e.g. `Mod.Mod` → base
      // `Mod` → lower `mod` matches the `mod.` prefix's letters), the
      // input is morally already in prefix form. Do NOT strip — let
      // step 3 handle it as already-prefixed so re-running the
      // transform is a no-op (would otherwise produce mod.Mod → mod.mod
      // → mod.mod on second pass, breaking idempotency).
      const prefixLetters = prefix.slice(0, -1);
      if (candidate.toLowerCase() === prefixLetters) {
        break;
      }
      working = candidate;
      impliedPrefix = prefix;
      break;
    }
  }

  // Step 3: working string already in prefix form? Iterate aliasEntries
  // so a recognized prefix (e.g. `thx.`) emits its canonical output
  // form (`ahx.`) rather than itself — see PREFIX_ALIAS_TABLE.
  const workingLower = working.toLowerCase();
  for (const { from, to } of ctx.aliasEntries) {
    if (
      workingLower.startsWith(from) &&
      workingLower.length > from.length
    ) {
      const remainder = working.slice(from.length);
      return to + remainder;
    }
  }

  // Step 4: prepend the implied prefix if step 2 fired, else unchanged.
  if (impliedPrefix !== null) {
    return impliedPrefix + working;
  }
  return name;
}

/**
 * Render a TFMX pair label. The label is style-independent: pair rows
 * always show `<base> (TFMX)` regardless of the filename-style setting.
 * Per product directive, TFMX is exempt from prefix-form display — the
 * `(TFMX)` suffix already conveys the format identity, and `mdat./smpl.`
 * pair-form labels mismatched on-disk file naming.
 */
export function renderTfmxPairLabel(base: string): string {
  return `${base} (TFMX)`;
}
