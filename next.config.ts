import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import "dotenv/config";

// Resolve at build time. Prefer the latest git tag; fall back to "dev"
// if no tags exist or git isn't available (e.g. inside a Docker build
// without a .git directory). Environments that build without git can
// override by setting APP_VERSION before `next build`.
function resolveVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execSync("git describe --tags --abbrev=0", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev";
  }
}

const config: NextConfig = {
  output: "standalone",
  env: {
    DOMAIN: process.env.DOMAIN,
    APP_VERSION: resolveVersion(),
  },
};

export default config;
