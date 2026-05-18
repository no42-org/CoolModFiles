/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { toAmigaStyle, renderTfmxPairLabel } from "./amiga-style.js";

describe("toAmigaStyle", () => {
  describe("Amiga-native extensions are mapped to prefix form", () => {
    it(".mod → mod.", () => {
      expect(toAmigaStyle("echoing.mod")).toBe("mod.echoing");
    });

    it(".med → med.", () => {
      expect(toAmigaStyle("space.med")).toBe("med.space");
    });

    it(".okt → okt.", () => {
      expect(toAmigaStyle("quartet.okt")).toBe("okt.quartet");
    });

    it(".ahx → ahx.", () => {
      expect(toAmigaStyle("dexter.ahx")).toBe("ahx.dexter");
    });

    it(".thx → ahx. (THX is AHX's earlier extension, same engine)", () => {
      expect(toAmigaStyle("dexter.thx")).toBe("ahx.dexter");
    });
  });

  describe("PC-era extensions are returned unchanged", () => {
    it(".xm (FastTracker II)", () => {
      expect(toAmigaStyle("dreamland.xm")).toBe("dreamland.xm");
    });

    it(".it (Impulse Tracker)", () => {
      expect(toAmigaStyle("groove.it")).toBe("groove.it");
    });

    it(".s3m (Scream Tracker 3)", () => {
      expect(toAmigaStyle("rush.s3m")).toBe("rush.s3m");
    });

    it(".mptm (OpenMPT-native)", () => {
      expect(toAmigaStyle("experiment.mptm")).toBe("experiment.mptm");
    });

    it(".stm (Scream Tracker)", () => {
      expect(toAmigaStyle("classic.stm")).toBe("classic.stm");
    });

    it(".mtm (MultiTracker)", () => {
      expect(toAmigaStyle("tune.mtm")).toBe("tune.mtm");
    });

    it(".669 (Composer 669)", () => {
      expect(toAmigaStyle("retro.669")).toBe("retro.669");
    });

    it(".ult (UltraTracker)", () => {
      expect(toAmigaStyle("rave.ult")).toBe("rave.ult");
    });

    it("non-module extension (.txt)", () => {
      expect(toAmigaStyle("readme.txt")).toBe("readme.txt");
    });

    it("no extension at all", () => {
      expect(toAmigaStyle("echoing")).toBe("echoing");
    });
  });

  describe("degenerate inputs are returned unchanged", () => {
    it("bare .mod extension (would otherwise emit prefix + empty base)", () => {
      expect(toAmigaStyle(".mod")).toBe(".mod");
    });

    it("bare .ahx extension", () => {
      expect(toAmigaStyle(".ahx")).toBe(".ahx");
    });

    it("bare .thx extension (same guard applies)", () => {
      expect(toAmigaStyle(".thx")).toBe(".thx");
    });

    it("empty string", () => {
      expect(toAmigaStyle("")).toBe("");
    });
  });

  describe("already-prefixed canonical names are idempotent", () => {
    it("mod.echoing is unchanged", () => {
      expect(toAmigaStyle("mod.echoing")).toBe("mod.echoing");
    });

    it("med.space is unchanged", () => {
      expect(toAmigaStyle("med.space")).toBe("med.space");
    });

    it("okt.quartet is unchanged", () => {
      expect(toAmigaStyle("okt.quartet")).toBe("okt.quartet");
    });

    it("ahx.dexter is unchanged", () => {
      expect(toAmigaStyle("ahx.dexter")).toBe("ahx.dexter");
    });
  });

  describe("double-form names have the redundant suffix stripped", () => {
    it("mod.echoing.mod → mod.echoing", () => {
      expect(toAmigaStyle("mod.echoing.mod")).toBe("mod.echoing");
    });

    it("med.space.med → med.space", () => {
      expect(toAmigaStyle("med.space.med")).toBe("med.space");
    });

    it("ahx.dexter.ahx → ahx.dexter", () => {
      expect(toAmigaStyle("ahx.dexter.ahx")).toBe("ahx.dexter");
    });

    it("ahx.dexter.thx → ahx.dexter (THX suffix also stripped, ahx prefix kept)", () => {
      expect(toAmigaStyle("ahx.dexter.thx")).toBe("ahx.dexter");
    });
  });

  describe("uppercase / mixed-case prefixes are canonicalized to lower-case", () => {
    it("MOD.echoing → mod.echoing", () => {
      expect(toAmigaStyle("MOD.echoing")).toBe("mod.echoing");
    });

    it("Mod.Echoing → mod.Echoing (base preserved)", () => {
      expect(toAmigaStyle("Mod.Echoing")).toBe("mod.Echoing");
    });

    it("AHX.Dexter → ahx.Dexter", () => {
      expect(toAmigaStyle("AHX.Dexter")).toBe("ahx.Dexter");
    });
  });

  describe("base case is preserved verbatim when transform applies", () => {
    it("Echoing.MOD → mod.Echoing", () => {
      expect(toAmigaStyle("Echoing.MOD")).toBe("mod.Echoing");
    });

    it("ECHOING.mod → mod.ECHOING", () => {
      expect(toAmigaStyle("ECHOING.mod")).toBe("mod.ECHOING");
    });

    it("mIxEdCaSe.ahx → ahx.mIxEdCaSe", () => {
      expect(toAmigaStyle("mIxEdCaSe.ahx")).toBe("ahx.mIxEdCaSe");
    });

    it("double-form Mod.Echoing.MOD → mod.Echoing (suffix stripped, prefix canonicalized, base preserved)", () => {
      expect(toAmigaStyle("Mod.Echoing.MOD")).toBe("mod.Echoing");
    });
  });

  describe("basename-only contract", () => {
    // The transform itself does not split paths. Callers must split the
    // basename off on `/` before calling. These cases document the
    // contract — passing a path with `/` produces a result where the `/`
    // is treated as part of the "base" only when the transform fires.
    it("returns the input unchanged when it contains a slash AND has no allow-list extension", () => {
      expect(toAmigaStyle("Hippel/Apidya/readme.txt")).toBe(
        "Hippel/Apidya/readme.txt",
      );
    });

    it("treats slash as part of the base if a caller forgets to split (transform still applies the extension rule, demonstrating why callers must split first)", () => {
      // Callers using this output verbatim would render
      // `mod.Hippel/Apidya/echoing` which is wrong. This test pins the
      // current behavior so the contract violation is visible — fix the
      // call-site, not the transform.
      expect(toAmigaStyle("Hippel/Apidya/echoing.mod")).toBe(
        "mod.Hippel/Apidya/echoing",
      );
    });
  });
});

describe("renderTfmxPairLabel", () => {
  it("renders '<base> (TFMX)' (style-independent)", () => {
    expect(renderTfmxPairLabel("apidya_inflight")).toBe(
      "apidya_inflight (TFMX)",
    );
  });

  it("base case is preserved exactly", () => {
    expect(renderTfmxPairLabel("Apidya_InFlight")).toBe(
      "Apidya_InFlight (TFMX)",
    );
  });
});

describe("toAmigaStyle in 'all' mode (Amiga-everywhere)", () => {
  describe("PC-era extensions now transform", () => {
    it(".xm → xm.", () => {
      expect(toAmigaStyle("dreamland.xm", "all")).toBe("xm.dreamland");
    });

    it(".it → it.", () => {
      expect(toAmigaStyle("groove.it", "all")).toBe("it.groove");
    });

    it(".s3m → s3m.", () => {
      expect(toAmigaStyle("rush.s3m", "all")).toBe("s3m.rush");
    });

    it(".mptm → mptm.", () => {
      expect(toAmigaStyle("experiment.mptm", "all")).toBe("mptm.experiment");
    });

    it(".stm → stm.", () => {
      expect(toAmigaStyle("classic.stm", "all")).toBe("stm.classic");
    });

    it(".mtm → mtm.", () => {
      expect(toAmigaStyle("tune.mtm", "all")).toBe("mtm.tune");
    });

    it(".669 → 669.", () => {
      expect(toAmigaStyle("retro.669", "all")).toBe("669.retro");
    });

    it(".ult → ult.", () => {
      expect(toAmigaStyle("rave.ult", "all")).toBe("ult.rave");
    });
  });

  describe("Amiga-native formats still transform identically in 'all' mode", () => {
    it(".mod still → mod.", () => {
      expect(toAmigaStyle("echoing.mod", "all")).toBe("mod.echoing");
    });

    it(".thx still → ahx. (same engine identity)", () => {
      expect(toAmigaStyle("dexter.thx", "all")).toBe("ahx.dexter");
    });
  });

  describe("THX → AHX alias canonicalization", () => {
    it("`thx.` prefix form (no extension) is canonicalized to `ahx.`", () => {
      expect(toAmigaStyle("thx.dexter")).toBe("ahx.dexter");
    });

    it("`THX.` mixed-case prefix is canonicalized to lower-case `ahx.`", () => {
      expect(toAmigaStyle("THX.dexter")).toBe("ahx.dexter");
    });

    it("`Thx.Dexter` → `ahx.Dexter` (prefix rewritten, base preserved)", () => {
      expect(toAmigaStyle("Thx.Dexter")).toBe("ahx.Dexter");
    });

    it("`thx.something.ahx` (double-form with thx prefix) → `ahx.something`", () => {
      expect(toAmigaStyle("thx.something.ahx")).toBe("ahx.something");
    });

    it("`thx.dexter.thx` (thx prefix + thx suffix) → `ahx.dexter`", () => {
      expect(toAmigaStyle("thx.dexter.thx")).toBe("ahx.dexter");
    });

    it("alias applies in 'all' mode too", () => {
      expect(toAmigaStyle("thx.dexter", "all")).toBe("ahx.dexter");
    });
  });

  describe("format-identity gate: step 3 alias does not override step 2 suffix", () => {
    // When a name carries an unrelated allow-list suffix, the file's
    // actual extension is the format identity. Step 3's alias match
    // must not override it.

    it("thx.foo.mod preserves .mod identity → mod.thx.foo (NOT ahx.foo)", () => {
      expect(toAmigaStyle("thx.foo.mod")).toBe("mod.thx.foo");
    });

    it("med.foo.mod preserves .mod identity → mod.med.foo (NOT med.foo)", () => {
      expect(toAmigaStyle("med.foo.mod")).toBe("mod.med.foo");
    });

    it("mod.echoing.med (mismatched prefix and suffix) → med.mod.echoing", () => {
      expect(toAmigaStyle("mod.echoing.med")).toBe("med.mod.echoing");
    });

    it("Thx.Foo.Mod (mixed case, same class) → mod.Thx.Foo", () => {
      expect(toAmigaStyle("Thx.Foo.Mod")).toBe("mod.Thx.Foo");
    });

    it("matching prefix+suffix still collapses normally", () => {
      expect(toAmigaStyle("mod.echoing.mod")).toBe("mod.echoing");
    });

    it("alias still fires when no suffix was stripped (thx.dexter → ahx.dexter)", () => {
      expect(toAmigaStyle("thx.dexter")).toBe("ahx.dexter");
    });

    it("thx.foo.ahx (alias agrees with suffix) → ahx.foo", () => {
      expect(toAmigaStyle("thx.foo.ahx")).toBe("ahx.foo");
    });

    it("idempotent under repeat application for thx.foo.mod", () => {
      const once = toAmigaStyle("thx.foo.mod");
      const twice = toAmigaStyle(once);
      expect(once).toBe("mod.thx.foo");
      expect(twice).toBe(once);
    });

    it("idempotent under repeat application for med.foo.mod", () => {
      const once = toAmigaStyle("med.foo.mod");
      const twice = toAmigaStyle(once);
      expect(once).toBe("mod.med.foo");
      expect(twice).toBe(once);
    });
  });

  describe("idempotency guard for base-equals-prefix-letters inputs", () => {
    // Without the step-2 guard, Mod.Mod would yield mod.Mod on first
    // pass and mod.mod on second pass — losing strict idempotency.

    it("`Mod.Mod` round-trips to `mod.Mod` and stays there", () => {
      const once = toAmigaStyle("Mod.Mod");
      const twice = toAmigaStyle(once);
      expect(once).toBe("mod.Mod");
      expect(twice).toBe(once);
    });

    it("`mod.Mod` is stable on repeat application", () => {
      const once = toAmigaStyle("mod.Mod");
      const twice = toAmigaStyle(once);
      expect(once).toBe("mod.Mod");
      expect(twice).toBe(once);
    });

    it("`mod.mod` is stable on repeat application", () => {
      const once = toAmigaStyle("mod.mod");
      const twice = toAmigaStyle(once);
      expect(once).toBe("mod.mod");
      expect(twice).toBe(once);
    });

    it("`Ahx.Ahx` round-trips correctly", () => {
      const once = toAmigaStyle("Ahx.Ahx");
      const twice = toAmigaStyle(once);
      expect(once).toBe("ahx.Ahx");
      expect(twice).toBe(once);
    });

    it("same guard works in 'all' mode for PC formats", () => {
      const once = toAmigaStyle("Xm.Xm", "all");
      const twice = toAmigaStyle(once, "all");
      expect(once).toBe("xm.Xm");
      expect(twice).toBe(once);
    });
  });

  describe("non-module extensions are still left unchanged", () => {
    it(".txt is not in the table even in 'all' mode", () => {
      expect(toAmigaStyle("readme.txt", "all")).toBe("readme.txt");
    });
  });

  describe("idempotency and case rules carry over to 'all' mode", () => {
    it("already-prefixed PC name is unchanged", () => {
      expect(toAmigaStyle("xm.dreamland", "all")).toBe("xm.dreamland");
    });

    it("uppercase PC prefix canonicalizes", () => {
      expect(toAmigaStyle("XM.dreamland", "all")).toBe("xm.dreamland");
    });

    it("double-form PC name collapses", () => {
      expect(toAmigaStyle("xm.dreamland.xm", "all")).toBe("xm.dreamland");
    });

    it("bare PC extension stays bare", () => {
      expect(toAmigaStyle(".xm", "all")).toBe(".xm");
    });
  });
});
