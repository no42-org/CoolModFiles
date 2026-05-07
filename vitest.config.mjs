import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.{js,mjs}"],
    exclude: ["node_modules", ".next", "out", "build"],
  },
});
