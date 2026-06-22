import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror the tsconfig `@web/*` -> `../web/src/*` path alias so tests that
    // import the shared web modules (e.g. the unsubscribe token builder) resolve.
    alias: {
      "@web": fileURLToPath(new URL("../web/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
