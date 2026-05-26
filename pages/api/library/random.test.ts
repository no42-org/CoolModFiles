/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect } from "vitest";
import { isTruthyParam } from "./random";

describe("isTruthyParam (excludeRecordings query parsing)", () => {
  it("returns true for '1'", () => {
    expect(isTruthyParam("1")).toBe(true);
  });

  it("returns true for 'true'", () => {
    expect(isTruthyParam("true")).toBe(true);
  });

  it("returns true for 'yes' (any non-empty non-falsy string)", () => {
    expect(isTruthyParam("yes")).toBe(true);
  });

  it("is case-insensitive on 'TRUE'", () => {
    expect(isTruthyParam("TRUE")).toBe(true);
  });

  it("returns false for '0'", () => {
    expect(isTruthyParam("0")).toBe(false);
  });

  it("returns false for 'false'", () => {
    expect(isTruthyParam("false")).toBe(false);
  });

  it("is case-insensitive on 'FALSE'", () => {
    expect(isTruthyParam("FALSE")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isTruthyParam("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(isTruthyParam("   ")).toBe(false);
  });

  it("returns false for undefined (parameter absent)", () => {
    expect(isTruthyParam(undefined)).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isTruthyParam(1)).toBe(false);
    expect(isTruthyParam(null)).toBe(false);
    expect(isTruthyParam(["1"])).toBe(false);
  });

  it("trims surrounding whitespace before testing", () => {
    expect(isTruthyParam("  1  ")).toBe(true);
    expect(isTruthyParam("  0  ")).toBe(false);
  });
});
