#!/usr/bin/env node
/**
 * CHAT-09: Coverage drift detector.
 *
 * Walks app/apps/web/src/app/api recursively for route.ts files and
 * finds every exported POST / PUT / PATCH / DELETE handler
 * (= "mutating endpoint"). Then walks app/apps/web/src/lib/chat/tools/
 * for *.ts files and extracts tool names.
 * Finally diffs against _specs/CHAT-00-coverage-audit/coverage-matrix
 * .md and prints:
 *   - endpoints not in the matrix (NEW — need classification)
 *   - matrix rows whose endpoint no longer exists (STALE)
 *   - tool count vs matrix summary
 *
 * Exit code 0 = clean. 1 = drift detected.
 *
 * Meant to run via Inngest weekly (CHAT-09 acceptance criteria) but
 * can also be invoked manually:
 *   node _tools/coverage-audit.js
 */

const fs = require("fs");
const path = require("path");

const WEB_ROOT = path.resolve(__dirname, "..", "app", "apps", "web");
const API_DIR = path.join(WEB_ROOT, "src", "app", "api");
const TOOLS_DIR = path.join(WEB_ROOT, "src", "lib", "chat", "tools");
const MATRIX_PATH = path.resolve(
  __dirname,
  "..",
  "_specs",
  "CHAT-00-coverage-audit",
  "coverage-matrix.md"
);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

function scanEndpoints() {
  const files = walk(API_DIR).filter((f) => f.endsWith("route.ts"));
  const endpoints = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path
      .relative(API_DIR, file)
      .replace(/\\/g, "/")
      .replace(/\/route\.ts$/, "");
    const routePath = "/" + rel;
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const re = new RegExp(`export\\s+async\\s+function\\s+${method}\\b`);
      if (re.test(src)) {
        endpoints.push({ routePath, method });
      }
    }
  }
  return endpoints;
}

function scanToolNames() {
  const files = fs.existsSync(TOOLS_DIR)
    ? fs
        .readdirSync(TOOLS_DIR)
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => path.join(TOOLS_DIR, f))
    : [];
  const names = new Set();
  // Match lines like:  toolName: makeTool({
  const re = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*makeTool\s*\(/gm;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    let m;
    while ((m = re.exec(src)) !== null) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

function parseMatrixEndpoints() {
  if (!fs.existsSync(MATRIX_PATH)) return [];
  const src = fs.readFileSync(MATRIX_PATH, "utf8");
  const endpoints = [];
  // Table rows have the shape:
  //   | id | `/api/<path>` | METHOD | ... |
  const re = /\|\s*[^|\s]+\s*\|\s*`(\/api\/[^`]+)`\s*\|\s*([A-Z,]+)\s*\|/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const routePath = m[1].replace(/^\/api/, "").replace(/\*\*/g, "");
    const methods = m[2].split(",").map((s) => s.trim());
    for (const method of methods) {
      endpoints.push({ routePath, method });
    }
  }
  return endpoints;
}

function key(ep) {
  return `${ep.method} ${ep.routePath}`;
}

function main() {
  const live = scanEndpoints();
  const matrix = parseMatrixEndpoints();
  const tools = scanToolNames();

  const liveSet = new Set(live.map(key));
  const matrixSet = new Set(matrix.map(key));

  const newInCode = live.filter((e) => !matrixSet.has(key(e)));
  const staleInMatrix = matrix.filter((e) => !liveSet.has(key(e)));

  console.log(`\nCHAT-09 coverage-audit\n======================`);
  console.log(`Live mutating endpoints: ${live.length}`);
  console.log(`Matrix-listed endpoints: ${matrix.length}`);
  console.log(`Chat tools defined:      ${tools.length}`);

  if (newInCode.length > 0) {
    console.log(`\n[DRIFT] ${newInCode.length} endpoint(s) in code but NOT in matrix:`);
    for (const e of newInCode) console.log(`   + ${e.method} ${e.routePath}`);
  }
  if (staleInMatrix.length > 0) {
    console.log(`\n[STALE] ${staleInMatrix.length} endpoint(s) in matrix but NOT in code:`);
    for (const e of staleInMatrix) console.log(`   - ${e.method} ${e.routePath}`);
  }

  if (newInCode.length === 0 && staleInMatrix.length === 0) {
    console.log(`\n[OK] No drift. Matrix is in sync with code.\n`);
    process.exit(0);
  }
  console.log(
    `\n[ACTION] Update _specs/CHAT-00-coverage-audit/coverage-matrix.md:\n` +
      `  — add new rows for the [DRIFT] endpoints with tier classification.\n` +
      `  — remove [STALE] rows if the endpoint was deleted, or fix the path.\n`
  );
  process.exit(1);
}

main();
