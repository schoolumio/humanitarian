import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "server-only": path.resolve(__dirname, "tests/helpers/empty.ts"),
  "@": path.resolve(__dirname, "src"),
};

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "node",
          alias,
          setupFiles: ["tests/helpers/unit-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          alias,
          globalSetup: ["tests/helpers/integration-global-setup.ts"],
          setupFiles: ["tests/helpers/integration-setup.ts"],
          pool: "forks",
          // Integration test files share one database: run them one at a time.
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
