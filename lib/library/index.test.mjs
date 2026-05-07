import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { resolveSafe } from "./index.js";

describe("resolveSafe", () => {
  let temp;
  let root;

  beforeEach(async () => {
    // Fixture layout:
    //   <temp>/
    //   ├─ outside.mod                  (real file, outside root)
    //   └─ root/
    //      ├─ inside.mod                (real file inside root)
    //      ├─ sub/
    //      │  └─ nested.mod
    //      ├─ symlink-to-outside  →  ../outside.mod
    //      └─ symlink-to-inside   →  inside.mod
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "resolveSafe-"));
    root = path.join(temp, "root");
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, "inside.mod"), "INSIDE");
    await fs.mkdir(path.join(root, "sub"));
    await fs.writeFile(path.join(root, "sub", "nested.mod"), "NESTED");
    await fs.writeFile(path.join(temp, "outside.mod"), "OUTSIDE");
    await fs.symlink(
      path.join(temp, "outside.mod"),
      path.join(root, "symlink-to-outside")
    );
    await fs.symlink(
      path.join(root, "inside.mod"),
      path.join(root, "symlink-to-inside")
    );
  });

  afterEach(async () => {
    await fs.rm(temp, { recursive: true, force: true });
  });

  it("resolves a simple path inside root", async () => {
    const real = await resolveSafe("inside.mod", root);
    expect(real).toBe(await fs.realpath(path.join(root, "inside.mod")));
  });

  it("returns the root realpath for an empty path", async () => {
    const real = await resolveSafe("", root);
    expect(real).toBe(await fs.realpath(root));
  });

  it("resolves a nested path", async () => {
    const real = await resolveSafe("sub/nested.mod", root);
    expect(real).toBe(
      await fs.realpath(path.join(root, "sub", "nested.mod"))
    );
  });

  it("rejects parent-directory traversal to an existing outside file", async () => {
    await expect(resolveSafe("../outside.mod", root)).rejects.toMatchObject({
      code: "EACCES",
    });
  });

  it("rejects multi-level parent-directory traversal", async () => {
    // root = <temp>/root; "../" lands on <temp>, which exists and is outside root
    await expect(resolveSafe("../", root)).rejects.toMatchObject({
      code: "EACCES",
    });
  });

  it("treats an absolute-style path as relative to root (leading slash stripped)", async () => {
    const real = await resolveSafe("/inside.mod", root);
    expect(real).toBe(await fs.realpath(path.join(root, "inside.mod")));
  });

  it("throws ENOENT for a non-existent path inside root", async () => {
    await expect(
      resolveSafe("does-not-exist.mod", root)
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a symlink that resolves outside root", async () => {
    await expect(
      resolveSafe("symlink-to-outside", root)
    ).rejects.toMatchObject({ code: "EACCES" });
  });

  it("follows a symlink that stays inside root", async () => {
    const real = await resolveSafe("symlink-to-inside", root);
    expect(real).toBe(await fs.realpath(path.join(root, "inside.mod")));
  });

  it("throws ENOENT when root is unset", async () => {
    await expect(resolveSafe("anything", "")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
