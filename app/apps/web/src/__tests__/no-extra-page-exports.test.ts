/**
 * Guard: an App Router page.tsx / layout.tsx may export ONLY the default component
 * plus Next's route-segment-config allowlist. Any other named export (a const, a
 * type, a helper) makes `next build` fail with "Page ... does not match the
 * required types of a Next.js Page" — which `tsc --noEmit` does NOT catch, so it
 * slips past CI (tsc + vitest) and only breaks on Vercel.
 *
 * This test closes that CI gap cheaply (no full build, no build-time env). It
 * caught the CLE regression where 5 pages exported *_EXCLUDED_IDS / SkillEntry.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(process.cwd(), "src", "app");

// Next route-segment config (App Router) + the page/layout default.
const ALLOWED = new Set([
  "default",
  "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime",
  "preferredRegion", "maxDuration", "experimental_ppr", "config",
  "metadata", "generateMetadata", "viewport", "generateViewport",
  "generateStaticParams",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/^(page|layout)\.(t|j)sx?$/.test(entry)) out.push(p);
  }
  return out;
}

/** Top-level named exports (not `export default`). Matches the forms our pages
 *  use; deliberately conservative — a false positive is a real smell to fix. */
function namedExports(src: string): string[] {
  const names: string[] = [];
  const re =
    /^export\s+(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) names.push(m[1]);
  // `export { A, B }` re-export lists.
  const reList = /^export\s*\{([^}]*)\}/gm;
  while ((m = reList.exec(src))) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

describe("App Router page/layout export hygiene (next build gate)", () => {
  const files = walk(APP_DIR);

  it("scans a non-trivial number of page/layout files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("no page.tsx / layout.tsx exports anything beyond default + route config", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const bad = namedExports(readFileSync(f, "utf8")).filter((n) => !ALLOWED.has(n));
      if (bad.length) {
        offenders.push(`${f.replace(APP_DIR, "src/app")} -> ${bad.join(", ")}`);
      }
    }
    expect(
      offenders,
      `These page/layout files have non-allowlisted exports that will fail \`next build\`. ` +
        `Move them to a router-private sibling (a "_"-prefixed module):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
