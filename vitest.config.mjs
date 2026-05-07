import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.{js,mjs,ts,mts,tsx}"],
    exclude: ["node_modules", ".next", "out", "build"],
  },
});
