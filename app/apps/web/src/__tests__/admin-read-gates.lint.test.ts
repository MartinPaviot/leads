/**
 * CI LINT — admin-only GET reads must be role-gated IN THE HANDLER.
 *
 * Root cause this guards: the middleware only gates writes. capabilityForRoute
 * (lib/auth/permissions.ts) returns undefined for SAFE methods (GET/HEAD), so a
 * read's authorization MUST live in the handler. A GET under an admin-only
 * prefix that only checks getAuthContext() (authentication) leaks admin data to
 * any member — the bug class fixed in #391 (gdpr/export full-CRM export, billing,
 * spend, audit, ...). This test fails the PR that reintroduces it.
 *
 * PRECISION matters: only prefixes that are WHOLLY admin-read are listed. NOT
 * /api/settings broadly (members have settings:read), NOT /api/mcp broadly
 * (mcp/route is public-by-design), NOT /api/dashboard broadly (members read
 * their own dashboards). Add a prefix only when EVERY GET under it is admin-only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(here, "..", "app", "api");

/** Path fragments (relative to src/app/api, forward-slash) whose GET reads are admin-only. */
const ADMIN_READ_PREFIXES = [
  "billing/",
  "audit/",
  "gdpr/",
  "eval/",
  "admin/",
  "mcp/keys/",
  "settings/llm-budget/",
  "settings/workflows/",
  "settings/members/invites/",
  "dashboard/visitor-id-spend/",
];

/** Intentionally exempt files (justify each). Keep tiny. */
const ALLOWLIST = new Set<string>([]);

const ROLE_CHECK =
  /requireAdmin|requireCapability|requirePermission|role\s*!==\s*["']admin["']|role\s*===\s*["']admin["']/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

/** Slice from `export ... <NAME>` to the next exported HTTP handler (or EOF). */
function handlerSlice(src: string, name: string): string | null {
  const re = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const rest = src.slice(bodyStart);
  const next = rest.search(
    /\nexport\s+(?:async\s+)?(?:function|const)\s+(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/,
  );
  return rest.slice(0, next === -1 ? rest.length : next);
}

describe("admin-only GET reads are role-gated in the handler (CI lint)", () => {
  const inScope = walk(API_DIR).filter((f) => {
    const rel = relative(API_DIR, f).replace(/\\/g, "/");
    return ADMIN_READ_PREFIXES.some((p) => rel.startsWith(p)) && !ALLOWLIST.has(rel);
  });

  it("scans a non-trivial set of admin route files (sanity)", () => {
    expect(inScope.length).toBeGreaterThanOrEqual(8);
  });

  it("the detector is not vacuous — it flags an unguarded GET and clears a gated one", () => {
    const unguarded =
      "export async function GET() {\n" +
      "  const ctx = await getAuthContext();\n" +
      "  if (!ctx) return Response.json({}, { status: 401 });\n" +
      "  return Response.json({ secret: true });\n" +
      "}\n";
    const unguardedSlice = handlerSlice(unguarded, "GET");
    expect(unguardedSlice).not.toBeNull();
    expect(ROLE_CHECK.test(unguardedSlice as string)).toBe(false); // -> would be a violation

    const gated = unguarded.replace(
      "if (!ctx) return Response.json({}, { status: 401 });",
      "if (!ctx) return Response.json({}, { status: 401 });\n  const a = requireAdmin(ctx); if (a) return a;",
    );
    expect(ROLE_CHECK.test(handlerSlice(gated, "GET") as string)).toBe(true); // -> passes

    // And a role check that lives only in a SIBLING handler must NOT clear GET.
    const getUnguardedPutGated =
      unguarded +
      "export async function PUT() {\n  const a = requireAdmin(null); if (a) return a;\n  return Response.json({});\n}\n";
    expect(ROLE_CHECK.test(handlerSlice(getUnguardedPutGated, "GET") as string)).toBe(false);
  });

  it("every admin-prefixed GET/HEAD handler contains a role check", () => {
    const violations: string[] = [];
    for (const f of inScope) {
      const src = readFileSync(f, "utf8");
      const rel = relative(API_DIR, f).replace(/\\/g, "/");
      for (const method of ["GET", "HEAD"]) {
        const slice = handlerSlice(src, method);
        if (slice !== null && !ROLE_CHECK.test(slice)) {
          violations.push(`${rel} (${method})`);
        }
      }
    }
    expect(
      violations,
      "Unguarded admin GET read(s). Add requireAdmin / requireCapability to the " +
        "handler, or (if genuinely member-readable) move the route out of " +
        "ADMIN_READ_PREFIXES:\n  " + violations.join("\n  "),
    ).toEqual([]);
  });
});
