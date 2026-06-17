# CLE-01 — Design

> Reads against live code at 2026-06-16. All `file:line` are real.

---

## 1. System fit

The chat request pipeline (`app/api/chat/route.ts:610-638`):

```
buildAllChatTools(toolCtx)            // index.ts:29-55 — 24 modules, ~160 tools
  → resolveCapabilities(...)          // capability-resolver.ts — role/surface/destructive/plan gating
  → orchestrate(lastUserText, .tools) // orchestrator.ts:529 — if confidence≥0.8: getSpecialistTools()
      else routeTools(.tools, msg)    // tool-router.ts:417 — intent→groups→filterToolsByGroups()
```

Both `getSpecialistTools` (`orchestrator.ts:387-413`) and `filterToolsByGroups` (`tool-router.ts:461-479`) look each tool up in a **static name→group map** and **force-include any tool not found** (the fail-open net). CLE-01 makes those two maps total and mutually consistent over the live registry, and freezes that property with a test. No control-flow changes; only map contents, comments, and one new test file.

Key existing exports CLE-01 builds on (no signature changes):
- `tool-router.ts:484-486` `getToolGroup(toolName): string | undefined` — already exported; the test uses it.
- `tool-router.ts:37-218` `const TOOL_GROUPS: Record<string,string>` — module-private; the test reaches it via `getToolGroup`, not by importing the object.
- `orchestrator.ts:56-141` `const TOOL_GROUP_MAP: Record<string,string>` — module-private and **not** exported. To assert against it (AC-3), CLE-01 adds a tiny exported accessor (see §3.2).
- `lib/chat/tools/index.ts:29` `buildAllChatTools(ctx)` and `lib/chat/tools/context.ts:6-12` `ToolContext` — the test imports both.

---

## 2. Data model / types

No DB changes. No new persistent types. The only "type" introduced is the closed set of canonical group names, derived from what the consumers already accept:

- Consumed by `tool-router.ts`: `DEFAULT_GROUPS` = {query, intelligence, action, briefing} (`:402`), `ALWAYS_INCLUDED` = {query} (`:405`), plus every group named in `INTENT_PATTERNS` (`:229-395`): undo, memory, briefing, intelligence, create, update, action, skills, coaching, schema, query.
- Consumed by `orchestrator.ts`: `SPECIALIST_TOOL_GROUPS` (`:43-49`) = {query, skills, intelligence, briefing, memory, action, create, coaching, update, schema, undo}.

**Canonical group set (closed):**
`query, create, update, action, intelligence, coaching, skills, memory, briefing, schema, undo`.
Every mapped tool MUST resolve to one of these 11. The drift-guard validates this (rejects typo groups).

---

## 3. Contract changes

### 3.1 `tool-router.ts` — map additions + comment fixes
Add the missing entries from requirements §2.3 / AC-5 to `TOOL_GROUPS` (insert under the matching section comment so the file stays readable):

```ts
// intelligence (intelligence.ts) — analysis/read
getBuyerIntentScore: "intelligence",
getDealsAtRisk: "intelligence",
getWinLossAnalysis: "intelligence",
// research (research.ts)
buildCompanyDossier: "intelligence",
// forecast (forecast.ts) — NB: export name is misspelled "Forcast"; do not rename in CLE-01
getRevenueForcast: "intelligence",
// stakeholder (stakeholder.ts)
mapDealStakeholders: "intelligence",
// coaching (coaching.ts)
searchTranscripts: "coaching",
// workflow (workflow.ts) — automation config
createWorkflow: "update",
listWorkflows: "update",
deleteWorkflow: "update",
// skills (skills.ts) — proposal tooling added after the "126" comment
listProposalTemplates: "skills",
fillProposal: "skills",
```
`executeCode` is already mapped (`tool-router.ts:193`, `intelligence`) — leave as-is.
Fix comments: `:1-2`, `:401` remove/replace "126"; update the module-list comment `:33-35` to include research, forecast, stakeholder, workflow, brain, enrichment, calls, navigation, read-gaps, knowledge, code-execution, import (currently it lists only 11 of 24 modules).

The three phantom entries (`tool-router.ts:184-186`) stay (group `skills`) — they become real in CLE-02; see requirements §6.

### 3.2 `orchestrator.ts` — mirror the same map + one accessor
- Add the **same** entries to `TOOL_GROUP_MAP` (`:56-141`) with identical groups (intelligence/coaching/update/skills), plus the entries tool-router already had that the mirror is missing — at minimum `executeCode: "intelligence"` (tool-router `:193` has it; orchestrator does not). The drift-guard's per-tool agreement assertion (AC-3) will enumerate any others; add whatever it names.
- Add the three (future-real) custom-skill names to keep the mirrors identical: `runCustomSkill: "skills", listCustomSkills: "skills", forkSkill: "skills"`.
- Export an accessor so the test can read the private map without exporting the mutable object directly:

```ts
/** Group for a tool in the orchestrator's mirror map. Exported for the
 *  drift-guard test (CLE-01) so the two maps can be asserted in sync. */
export function getOrchestratorToolGroup(name: string): string | undefined {
  return TOOL_GROUP_MAP[name];
}
```
- Fix the "126" comments at `:6-7,22`.

### 3.3 No change to
`route.ts`, `capability-resolver.ts`, `chat-system-prompt.ts` (the system-prompt phantom reference at `:92` is CLE-02's to resolve — CLE-01 only touches routing maps). `makeTool`/`ToolContext` unchanged.

---

## 4. Data flow (unchanged at runtime)

Identical to today. The only observable difference: for the ~13 newly-mapped tools, `routeTools`/`getSpecialistTools` now *include them by group membership* instead of by the fail-open branch. For a turn whose intent doesn't select their group, they are now correctly **excluded** (smaller, honest tool list) instead of force-included. AC-7 + the four existing tests guard that no previously-reachable tool becomes unreachable for the phrases users actually say.

---

## 5. Failure handling

- **Test can't build the registry:** if `buildAllChatTools(stubCtx)` throws at registration, the test fails loudly — that is a real defect (a builder doing work at registration time). Mitigation in the test: build the stub `ctx` with benign non-null values for every `ToolContext` field (§ test below). Fallback option documented: if a builder genuinely needs a live `ctx` at registration, the test falls back to a checked-in `TOOL_NAME_MANIFEST` array (generated once via the snippet in tasks.md T-2) and asserts maps cover it; but the primary, preferred path is the dynamic `buildAllChatTools` enumeration so the manifest can't itself go stale.
- **Map disagreement at runtime:** impossible to ship — caught at CI by the drift-guard before merge.

---

## 6. Security

No auth/tenant surface touched. Routing maps are static name→string. No new data read or written. Tenant isolation untouched (this layer runs after `resolveCapabilities`, which is unchanged).

---

## 7. Test strategy

One new file: `app/apps/web/src/lib/chat/__tests__/tool-routing-drift-guard.test.ts`. Mirrors the existing convention in that folder (vitest, `@/` alias, import from `../tool-router`). It is the executable embodiment of AC-2/3/4/5/6. **Exact contents:**

```ts
import { describe, it, expect } from "vitest";
import { buildAllChatTools, type ToolContext } from "@/lib/chat/tools";
import { getToolGroup, getToolsInGroup } from "@/lib/chat/tool-router";
import { getOrchestratorToolGroup } from "@/lib/agents/orchestrator";

/**
 * DRIFT-GUARD (CLE-01).
 * Asserts the two routing maps (tool-router.ts TOOL_GROUPS and
 * orchestrator.ts TOOL_GROUP_MAP) stay total and mutually consistent
 * over the LIVE tool registry produced by buildAllChatTools.
 *
 * Why: filterToolsByGroups (tool-router.ts:461) and getSpecialistTools
 * (orchestrator.ts:387) FAIL-OPEN on unmapped tools — so an unmapped
 * tool is force-included every turn and silently defeats routing.
 * This test makes that fail-open net non-load-bearing for known tools.
 */

// Canonical, closed set of group names the routing consumers understand.
// (tool-router DEFAULT_GROUPS/ALWAYS_INCLUDED/INTENT_PATTERNS +
//  orchestrator SPECIALIST_TOOL_GROUPS.)
const KNOWN_GROUPS = new Set([
  "query", "create", "update", "action", "intelligence",
  "coaching", "skills", "memory", "briefing", "schema", "undo",
]);

// Names mapped on purpose ahead of their implementation. CLE-02 builds
// these as real tools and DELETES this allowlist (flipping the strict
// "no extra map keys" assertion fully on). See _specs/CLE-02.
const PENDING_TOOLS = new Set([
  "runCustomSkill", "listCustomSkills", "forkSkill",
]);

/** Minimal ToolContext — builders only wrap metadata at registration;
 *  DB access happens inside execute(), which we never call here. */
function stubCtx(): ToolContext {
  return {
    tenantId: "t_test",
    userId: "u_test",
    // authCtx/settings are only read inside execute(); a shallow stub is safe.
    authCtx: { tenantId: "t_test", appUserId: "u_test", role: "admin" } as unknown as ToolContext["authCtx"],
    settings: {} as unknown as ToolContext["settings"],
    agentApprovalMode: "review-each",
  };
}

const REGISTRY = buildAllChatTools(stubCtx());
const TOOL_NAMES = Object.keys(REGISTRY).sort();

describe("tool-routing drift-guard", () => {
  it("registry is non-trivially large (sanity floor)", () => {
    // Not an exact count (that drifts by design). A floor that would
    // catch a builder silently dropping out of buildAllChatTools.
    expect(TOOL_NAMES.length).toBeGreaterThanOrEqual(150);
  });

  it("every live tool has a tool-router group (AC-2)", () => {
    const unmapped = TOOL_NAMES.filter((n) => getToolGroup(n) === undefined);
    expect(unmapped, `unmapped in tool-router.ts: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("every live tool has an orchestrator group (AC-3)", () => {
    const unmapped = TOOL_NAMES.filter((n) => getOrchestratorToolGroup(n) === undefined);
    expect(unmapped, `unmapped in orchestrator.ts TOOL_GROUP_MAP: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("every mapped group is a known group (AC-5 — no typo groups)", () => {
    const bad = TOOL_NAMES
      .map((n) => ({ n, g: getToolGroup(n) }))
      .filter(({ g }) => g !== undefined && !KNOWN_GROUPS.has(g as string));
    expect(bad, `tools mapped to unknown group: ${bad.map((b) => `${b.n}→${b.g}`).join(", ")}`).toEqual([]);
  });

  it("the two maps agree per tool (AC-3 — orchestrator mirror is in sync)", () => {
    const mismatched = TOOL_NAMES
      .map((n) => ({ n, a: getToolGroup(n), b: getOrchestratorToolGroup(n) }))
      .filter(({ a, b }) => a !== b);
    expect(
      mismatched,
      `group mismatch tool-router vs orchestrator: ${mismatched
        .map((m) => `${m.n} (${m.a} vs ${m.b})`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("neither map has phantom keys beyond the live registry + pending allowlist (AC-4)", () => {
    const live = new Set(TOOL_NAMES);
    // Union of all keys present in either map, reconstructed group-by-group
    // from tool-router's public getToolsInGroup() + the orchestrator accessor.
    const mapKeys = new Set<string>();
    for (const g of KNOWN_GROUPS) for (const n of getToolsInGroup(g)) mapKeys.add(n);
    // Cross-check orchestrator side for any key tool-router lacks.
    for (const n of [...live, ...PENDING_TOOLS]) {
      if (getOrchestratorToolGroup(n) !== undefined) mapKeys.add(n);
    }
    const phantom = [...mapKeys].filter((n) => !live.has(n) && !PENDING_TOOLS.has(n));
    expect(phantom, `phantom map keys (mapped, not in registry): ${phantom.join(", ")}`).toEqual([]);
  });

  it("the §2.3 formerly-unrouted tools landed in their intended groups (AC-5)", () => {
    const expected: Record<string, string> = {
      getBuyerIntentScore: "intelligence",
      getDealsAtRisk: "intelligence",
      getWinLossAnalysis: "intelligence",
      buildCompanyDossier: "intelligence",
      getRevenueForcast: "intelligence",
      mapDealStakeholders: "intelligence",
      searchTranscripts: "coaching",
      createWorkflow: "update",
      listWorkflows: "update",
      deleteWorkflow: "update",
      listProposalTemplates: "skills",
      fillProposal: "skills",
      executeCode: "intelligence",
    };
    for (const [name, group] of Object.entries(expected)) {
      expect(getToolGroup(name), `${name} tool-router group`).toBe(group);
      expect(getOrchestratorToolGroup(name), `${name} orchestrator group`).toBe(group);
    }
  });
});
```

Notes on the test:
- It relies on `getToolsInGroup` (already exported, `tool-router.ts:491-495`) to reconstruct tool-router's key set for the phantom check — no need to export the raw `TOOL_GROUPS` object.
- The AC-4 phantom check is the one gated by `PENDING_TOOLS`. **CLE-02's final task removes the three names from this `PENDING_TOOLS` set** (they become live registry entries), leaving the assertion fully strict.
- The stub `ctx` cast is deliberately shallow; if a builder throws on it, that's a finding (requirements §4 edge case 1).

Also run, unchanged, the four existing routing tests (regression).
