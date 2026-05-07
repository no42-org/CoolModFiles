// Server-side helpers for the library feature.
// Path traversal protection, extension allowlist, env var handling.
//
// All filesystem-touching code paths MUST go through resolveSafe() before
// reading. Direct fs.* calls on user-provided paths are forbidden.

import path from "path";
import fs from "fs/promises";

export { MODULE_EXTENSIONS, isModuleFile } from "../../components/sources";

export const LIBRARY_ROOT: string | null = process.env.LIBRARY_ROOT || null;

export const MAX_DEPTH = 32;
export const MAX_LISTING = 1000;
export const MAX_SEARCH_RESULTS = 100;
export const MAX_RANDOM_SCAN = 50000;

/**
 * Resolve a user-supplied path against the configured library root, follow
 * symlinks via realpath, and verify the result is within the root.
 *
 * Throws an Error with .code:
 *   - "ENOENT"  → path does not exist (caller should 404)
 *   - "EACCES"  → resolved path is outside the root (caller should 403)
 *   - other     → underlying filesystem error
 *
 * Returns the resolved real absolute path.
 */
export async function resolveSafe(
  userPath: string,
  root: string | null
): Promise<string> {
  if (!root) {
    const err: NodeJS.ErrnoException = new Error("library_root_unset");
    err.code = "ENOENT";
    throw err;
  }
  // Realpath the root too — required so the prefix check below compares
  // both sides post-symlink resolution. Without this, a LIBRARY_ROOT that
  // happens to traverse a symlink (e.g. /tmp → /private/tmp on macOS, or
  // any symlinked mount point) would falsely reject every legitimate
  // request as "outside root".
  let rootResolved: string;
  try {
    rootResolved = await fs.realpath(path.resolve(root));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      const err: NodeJS.ErrnoException = new Error("library_root_unset");
      err.code = "ENOENT";
      throw err;
    }
    throw e;
  }
  // Treat absolute userPath as relative to root by stripping leading slashes.
  const cleaned = String(userPath || "").replace(/^[/\\]+/, "");
  const requested = path.resolve(rootResolved, cleaned);

  let real: string;
  try {
    real = await fs.realpath(requested);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      const err: NodeJS.ErrnoException = new Error("not_found");
      err.code = "ENOENT";
      throw err;
    }
    throw e;
  }

  if (real !== rootResolved && !real.startsWith(rootResolved + path.sep)) {
    const err: NodeJS.ErrnoException = new Error("path_outside_root");
    err.code = "EACCES";
    throw err;
  }
  return real;
}
