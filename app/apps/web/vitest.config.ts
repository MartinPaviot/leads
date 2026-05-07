import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync, existsSync } from "fs";

function loadDotenv(dir: string): Record<string, string> {
  const envPath = path.join(dir, ".env.local");
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, "utf-8");
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export default defineConfig(() => {
  const env = loadDotenv(__dirname);
  return {
    plugins: [react()],
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      globals: true,
      testTimeout: 60_000,
      env: Object.fromEntries(
        Object.entries(env).filter(([k]) => k.startsWith("ANTHROPIC_") || k.startsWith("OPENAI_")),
      ),
      coverage: {
        provider: "v8" as const,
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
  };
});
