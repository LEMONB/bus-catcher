import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/server/setup.ts"],
    include: ["tests/server/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["server/**/*.ts"],
      exclude: ["server/index.ts"],
    },
  },
});
