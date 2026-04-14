import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Default environment stays node for speed. Tests that need a DOM
    // (hooks, components) declare `@vitest-environment happy-dom` at
    // the top of the file.
    environment: "node",
    environmentMatchGlobs: [
      ["src/**/*.dom.test.ts", "happy-dom"],
      ["src/**/*.dom.test.tsx", "happy-dom"],
      ["src/**/*.test.tsx", "happy-dom"],
    ],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/app/api/**/*.ts", "src/lib/**/*.ts", "src/hooks/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
      reporter: ["text", "text-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
