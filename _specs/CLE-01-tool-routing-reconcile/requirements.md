# CLE-01 — Reconcile tool-router / orchestrator maps with the real tool set (+ drift-guard)

> Initiative: chat-live-executor. Constitution: `_specs/chat-live-executor/README.md`.
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§0 verdict, §1.1, §6.3, §5 table).
> Phase 0 / Milestone M0. `checkpoint: false`. Completeness target: 10/10.
> Depends on: nothing. **Blocks / is depended on by: CLE-02** (CLE-02 lands the three custom-skill tools that CLE-01's drift-guard test is written to require).

---

## 1. User story

**As** the engineer responsible for the chat agent's reliability,
**I want** the two tool-group maps (`lib/chat/tool-router.ts` and `lib/agents/orchestrator.ts`) to describe the *actual* tool set produced by `buildAllChatTools`, with a test that fails the build if they ever drift apart again,
**so that** every server tool is deliberately routed (not silently passed through a fail-open escape hatch every turn), no phantom tool names mislead the model or future maintainers, and the per-turn tool budget the maps are supposed to enforce is real.

This is a correctness/observability fix, not a behavior change for the end user. The end user benefit is indirect: the model receives a deliberately scoped, honest tool set, which is the precondition for every later CLE feature.

---

## 2. Background — the drift, sourced to `file:line`

### 2.1 The "126" lie
- `tool-router.ts:1-2` header comment: *"instead of sending all 126 tools on every request"*.
- `tool-router.ts:401` comment: *"~40-50 tools instead of 126"*.
- `orchestrator.ts:6-7,22` comments: *"dumping 126 tools"*, *"reduces per-request tool count from 126 to ~15-25"*.
- Reality: `buildAllChatTools` (`lib/chat/tools/index.ts:29-55`) spreads **24** builder modules. Enumerated by real exported names (`grep '^\s{4}\w+: makeTool('` per module), the registry holds **160** tools as of 2026-06-16 (the audit's "158" predates the two proposal tools `listProposalTemplates`/`fillProposal` added to `skills.ts:664,716`). The exact integer is volatile; this spec does **not** hardcode it anywhere except as a sanity floor in the test — the drift-guard derives the live count.

### 2.2 Phantom tools (mapped/referenced, do not exist)
- `tool-router.ts:184-186` maps `runCustomSkill`, `listCustomSkills`, `forkSkill` to group `skills`.
- `chat-system-prompt.ts:92` advertises all three in `<capabilities>`.
- None of them is produced by `buildAllChatTools`. `buildSkillsTools` (`lib/chat/tools/skills.ts:7-734`) exports no such tools. They are dead names. (The DB-backed implementations `executeCustomSkill`/`listAvailableSkills`/`forkSkill` live in `skills/custom/executor.ts` but are never wired as chat tools — that wiring is **CLE-02**.)

### 2.3 Unmapped real tools (exist, absent from BOTH maps → fail-open every turn)
`filterToolsByGroups` (`tool-router.ts:461-479`) and `getSpecialistTools` (`orchestrator.ts:387-413`) both contain the same escape hatch: *"Unknown tools (not in the group map) are always included"* (`tool-router.ts:470-473`, `orchestrator.ts:406-407`). Any tool absent from the map is therefore force-included on **every** turn, defeating routing. The following real tools are absent from **at least one** map (verified against the module greps; this is the authoritative gap list):

| Tool | Module / exporter (file:line) | In tool-router map? | In orchestrator map? |
|---|---|---|---|
| `getBuyerIntentScore` | `intelligence.ts:389` | No | No |
| `getDealsAtRisk` | `intelligence.ts:424` | No | No |
| `getWinLossAnalysis` | `intelligence.ts:453` | No | No |
| `searchTranscripts` | `coaching.ts:135` | No | No |
| `buildCompanyDossier` | `research.ts:9` | No | No |
| `getRevenueForcast` *(sic — typo is in the real export name)* | `forecast.ts:17` | No | No |
| `mapDealStakeholders` | `stakeholder.ts:9` | No | No |
| `createWorkflow` | `workflow.ts:16` | No | No |
| `listWorkflows` | `workflow.ts:99` | No | No |
| `deleteWorkflow` | `workflow.ts:132` | No | No |
| `executeCode` | `code-execution.ts:8` | Yes (`tool-router.ts:193`, group `intelligence`) | No |
| `listProposalTemplates` | `skills.ts:664` | No | No |
| `fillProposal` | `skills.ts:716` | No | No |

Note two distinct failure shapes the test must catch:
1. **Absent from both maps** (e.g. the intelligence/forecast/stakeholder/workflow group).
2. **Present in one map, absent from the mirror** (e.g. `executeCode` is in `tool-router.ts` but missing from `orchestrator.ts`'s `TOOL_GROUP_MAP`; `orchestrator.ts:51-54` itself warns *"Keep in sync"* — it isn't). The orchestrator map also omits `listSharedPrompts`/`deleteSharedPrompt`? — verify during build via the diff the test prints; the test is the source of truth, not this prose.

### 2.4 Why fail-open is the wrong default for a known tool
Fail-open is correct as a safety net for a *brand-new* tool added before someone updates the router. It is wrong as the steady state for ~13+ tools indefinitely: it silently inflates every turn's tool list (cost + model confusion), and it means the routing maps no longer describe the system. CLE-01 keeps the fail-open net (do not remove it) but adds a test so the net is never load-bearing for an existing tool.

---

## 3. EARS acceptance criteria (GIVEN / WHEN / THEN)

### AC-1 — Counts corrected
- **GIVEN** the reconciled `tool-router.ts` and `orchestrator.ts`,
- **WHEN** a reader inspects the header/inline comments,
- **THEN** no comment asserts the literal "126"; comments either state the live count is derived at runtime or cite the count as "≈160 as of 2026-06-16, see drift-guard test" — and no comment contradicts the drift-guard.

### AC-2 — Every real tool is mapped in tool-router
- **GIVEN** `buildAllChatTools(ctx)` for any valid `ctx`,
- **WHEN** the drift-guard test enumerates `Object.keys(buildAllChatTools(ctx))`,
- **THEN** **every** key has a defined `getToolGroup(name)` (i.e. exists in `TOOL_GROUPS`) whose value is one of the known group names.

### AC-3 — Every real tool is mapped in orchestrator
- **GIVEN** the same registry keys,
- **WHEN** the test consults `orchestrator.ts`'s `TOOL_GROUP_MAP`,
- **THEN** every key is present in `TOOL_GROUP_MAP` with a known group value, and its group **equals** the group assigned by `tool-router.ts` (the two maps agree per-tool).

### AC-4 — No phantom names remain in the maps
- **GIVEN** the reconciled maps,
- **WHEN** the test compares every map key against the live registry keys,
- **THEN** **after CLE-02 lands**, every key in `TOOL_GROUPS` and in `TOOL_GROUP_MAP` corresponds to a real tool in `buildAllChatTools(ctx)` (no extra/phantom keys). See §6 for the CLE-01-only interim assertion.

### AC-5 — Unrouted analysis tools land in sensible groups
- **GIVEN** the tools listed in §2.3,
- **WHEN** routed,
- **THEN** they belong to groups consistent with their effect and with the existing routing prompt vocabulary:
  - `getBuyerIntentScore`, `getDealsAtRisk`, `getWinLossAnalysis`, `buildCompanyDossier`, `getRevenueForcast`, `mapDealStakeholders` → `intelligence` (read/analysis; surfaced by the "analyze/coach/forecast/pipeline" intent at `tool-router.ts:340-357`).
  - `searchTranscripts` → `coaching` (sibling of `searchExactWords`, `coaching.ts:200`).
  - `createWorkflow`, `listWorkflows`, `deleteWorkflow` → `update` (workspace automation config; reuses the "configure/settings" intent at `tool-router.ts:300-316`).
  - `listProposalTemplates`, `fillProposal` → `skills` (they live in `buildSkillsTools` and run via `runSkill`).
  - `executeCode` → `intelligence` (keep tool-router's existing choice; add the same entry to the orchestrator mirror).

### AC-6 — Drift-guard test exists and is green
- **GIVEN** the new test file (§ design + tasks),
- **WHEN** `vitest` runs it,
- **THEN** it passes; **and WHEN** a developer later adds a 161st tool without mapping it, **THEN** this test fails with a message naming the unmapped tool and which map is missing it.

### AC-7 — No runtime behavior regression
- **GIVEN** the existing routing tests (`lib/chat/__tests__/new-tools-routing.test.ts`, `command-layer-routing.test.ts`, `knowledge-tool-routing.test.ts`, `call-sprint-routing.test.ts`),
- **WHEN** they run against the reconciled maps,
- **THEN** they still pass unchanged (groups for already-mapped tools are not silently re-homed in a way that breaks their intent routing). `tsc` reports 0 errors.

---

## 4. Edge cases

1. **`ctx` shape for the test.** `buildAllChatTools` registers tools without touching the DB (each `makeTool` only wraps `description`/`inputSchema`/`execute`; DB access is inside `execute`, invoked lazily). The test must construct a minimal stub `ToolContext` (`tenantId`, `userId`, `authCtx`, `settings`, `agentApprovalMode`) — registration must not throw. If any builder dereferences `ctx` at registration time and throws on the stub, that is itself a finding to fix (builders should be pure at registration).
2. **The intentional typo `getRevenueForcast`.** Do not "fix" the export name in CLE-01 — renaming a tool is a separate, riskier change (the model's prompt and any callers reference the current name). Map the name as-is; note the typo in a code comment.
3. **Group names must be a closed set.** The test validates each mapped group is one of the canonical groups consumed by `DEFAULT_GROUPS`/`ALWAYS_INCLUDED`/`SPECIALIST_TOOL_GROUPS`. A typo'd group ("inteligence") would route nowhere — the test must reject unknown group strings.
4. **Phantom-name timing (the CLE-01↔CLE-02 seam).** CLE-01 must leave the maps in a state where, the moment CLE-02 adds the three tools, AC-4's "no extra keys" assertion is true. Concretely: CLE-01 keeps the three phantom entries **only if** CLE-02 is landing in the same milestone batch; otherwise CLE-01's interim test asserts "maps ⊆ registry ∪ {the 3 known-pending names}". See §6 and tasks.md T-6.
5. **Two maps, one truth.** `executeCode` proves the maps already disagree. The test asserts agreement (AC-3) so the orchestrator mirror can never again silently lag tool-router.
6. **Orchestrator fallback path.** Some tools are only reachable via `routeTools` (when orchestrator confidence < 0.8, `orchestrator.ts:536`). The reconciliation must keep both paths able to surface every tool for at least one plausible message; AC-5 group choices preserve this.

---

## 5. Out of scope

- Building `runCustomSkill`/`listCustomSkills`/`forkSkill` (that is **CLE-02**).
- Renaming `getRevenueForcast` or any other tool.
- Changing intent regexes' *wording* beyond what's needed to surface a newly-grouped tool (no broad re-tuning).
- Removing the fail-open escape hatch (keep it as a net; the test makes it non-load-bearing).
- Any Page Action Registry work (CLE-03+).
- Touching `resolveCapabilities` / `capability-resolver.ts` gating (CLE-04/CLE-12).

---

## 6. CLE-01 ↔ CLE-02 dependency (explicit)

The three phantom names are shared state between the two specs:
- **CLE-02 decides build-vs-remove** for `runCustomSkill`/`listCustomSkills`/`forkSkill`. Recommendation (see CLE-02): **build** them as real tools.
- **CLE-01 must not delete them blindly.** If CLE-01 removed the map entries and CLE-02 then added the tools, the tools would be unmapped (fail-open) until someone re-mapped them — re-introducing the exact drift this spec kills.
- **Resolution:** CLE-01 maps all three to group `skills` (they belong there once built) and ships a drift-guard whose strict "no extra map keys" assertion (AC-4) is **gated to pass once CLE-02 lands**. Until CLE-02 lands, the test treats the three names as a known-pending allowlist (a single constant `PENDING_TOOLS` in the test). CLE-02's final task deletes that allowlist, flipping the test to fully strict. This is stated in tasks.md T-6 and in CLE-02 tasks.md.
- Because M0's checkpoint is *after* CLE-02, the milestone exits with the maps fully strict and green.

---

## 7. Evaluation steps (Phase 6 hostile QA)

1. `cd app/apps/web && pnpm tsc --noEmit` → 0 errors.
2. `pnpm vitest run src/lib/chat/__tests__/tool-routing-drift-guard.test.ts` → green.
3. **Negative test (manual):** temporarily add a dummy `zzTestTool: makeTool({...})` to any builder, re-run the drift-guard → it must FAIL naming `zzTestTool` and the missing map(s). Revert.
4. **Negative test (manual):** temporarily add `zzPhantom: "skills"` to `TOOL_GROUPS` → the "no extra keys" assertion must FAIL naming `zzPhantom`. Revert.
5. Re-run the four pre-existing routing tests → all still green.
6. Grep the repo for the literal `126` in `tool-router.ts` and `orchestrator.ts` → 0 hits.
7. Confirm `getToolGroup` returns a defined value for each of the §2.3 tools and that `tool-router` and `orchestrator` agree for a 10-name spot sample.
