# CLE-02 — Custom-skill chat bridge (build the three real tools)

> Initiative: chat-live-executor. Constitution: `_specs/chat-live-executor/README.md`.
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§1.1 "Skills system", §5, §6.3 phantom-tools finding).
> Phase 0 / Milestone M0. `checkpoint: false`. Completeness target: 9/10.
> **Depends on: CLE-01** (`CLE-01-tool-routing-reconcile`). CLE-02 lands the tools whose names CLE-01 pre-mapped, then removes CLE-01's `PENDING_TOOLS` allowlist so the drift-guard becomes fully strict.

---

## 1. Decision (stated + justified)

**BUILD** `runCustomSkill`, `listCustomSkills`, and `forkSkill` as real chat tools that delegate to the already-implemented, DB-backed functions in `skills/custom/executor.ts`. **Do not** take the removal path unless the executor proves unfit (fallback in §2).

Justification:
- The capability already exists end-to-end except for the chat seam. `customSkillTemplates` is a real table (`db/schema/intelligence.ts:621-653`). The executor is real and tenant-scoped: `findSkill` (`executor.ts:52-100`), `executeCustomSkill` (`:102-204`), `listAvailableSkills` (`:279-324`), `forkSkill` (`:329-374`). A REST surface already drives them from Settings: `GET/POST /api/settings/skills` (`route.ts:8-135`) and `GET/PUT/DELETE /api/settings/skills/[id]` (`[id]/route.ts`). The ONLY missing piece is exposing them to the chat agent.
- The system prompt **already promises** these tools to the model (`chat-system-prompt.ts:92`: *"Run custom skills … (runCustomSkill), list available skills (listCustomSkills), fork and customize existing skills (forkSkill)"*) and `tool-router.ts:184-186` already routes the names. Today those are phantom: the model is told it can call tools that don't exist → wasted turns / hallucinated success. Building them turns an existing lie into a working feature.
- Effort is a **lake**, not an ocean: three thin `makeTool` wrappers over existing functions, one new module, one index line. No new DB, no new infra, no new LLM plumbing (the executor already does its own `generateText`).
- It directly serves the Mission's "schema-less skills / repeatable founder workflows" thread and the audit's parity principle (close the one named gap in the otherwise-solid headless layer, §5 row "Mutation headless 8/10 … bridge custom-skills fantôme").

Completeness 9/10 (not 10): the executor runs skills via its own one-shot `generateText` (`executor.ts:161-167`) — it does **not** give a skill access to the 160 chat tools mid-run. That deeper "skill-as-subagent-with-tools" is a separate, larger design (flagged §5 out-of-scope), so the bridge exposes today's executor faithfully rather than over-promising.

---

## 2. Fallback (removal) — only if the executor is unfit

If, during build, the executor turns out to be unsafe or broken (e.g. no tenant scoping — it has it; or it cannot run without paid model keys in a way that makes the tool useless — it degrades gracefully, returning `success:false, error:"No LLM configured"` at `executor.ts:110-120`), then **remove** the phantom surface instead:
- Delete `tool-router.ts:184-186` and the orchestrator mirror entries (added by CLE-01).
- Delete the three names from `chat-system-prompt.ts:92`.
- Remove CLE-01's `PENDING_TOOLS` allowlist (drift-guard goes strict; now asserting the names are absent).
The current code review finds the executor **fit**, so this branch is documented for completeness, not expected to be taken.

---

## 3. User story

**As** a founder who has saved repeatable workflows ("Qualify a Romand inbound", "Draft a Douablin opener") as custom skills in Settings,
**I want** to ask the chat to run, list, or fork those skills by name,
**so that** my codified playbook is reachable from the place I already work (chat) — not only from the Settings UI — with the same tenant/user scoping and the same business-knowledge grounding the executor already applies.

---

## 4. EARS acceptance criteria (GIVEN / WHEN / THEN)

### AC-1 — listCustomSkills returns the caller's skills
- **GIVEN** a tenant with active custom skills (workspace-scoped + the user's own user-scoped),
- **WHEN** the model calls `listCustomSkills()`,
- **THEN** it returns the same set `listAvailableSkills(tenantId, userId)` returns (`executor.ts:279-324`): id, slug, name, description, category, scope, isEditable, useCount, lastUsedAt, hasSteps — scoped to `tenantId` and (for user-scoped) `userId`, ordered by recently-used. Built-in/system skills are **not** included (those are the curated `buildSkillsTools` tools; this tool is for DB custom skills only — see §6 edge case).

### AC-2 — runCustomSkill executes by id/slug/name
- **GIVEN** a custom skill resolvable by `skillId`, `skillSlug`, or fuzzy `skillName`,
- **WHEN** the model calls `runCustomSkill({ skillId?|skillSlug?|skillName?, parameters?, entityContext?, targetEntityIds? })`,
- **THEN** the tool resolves it via `findSkill` (`executor.ts:52-100`), runs `executeCustomSkill` (`:102-204`), and returns `{ success, output, skillName, parametersUsed, knowledgeUsed, durationMs, error? }`.

### AC-3 — runCustomSkill: skill not found
- **GIVEN** none of id/slug/name resolves a skill in the tenant,
- **WHEN** `runCustomSkill` is called,
- **THEN** it returns `{ success:false, error:"No matching custom skill found for <criteria>" }` (no throw, no other tenant's data).

### AC-4 — runCustomSkill: missing required parameter
- **GIVEN** the skill declares a required parameter with no value and no default,
- **WHEN** run without it,
- **THEN** it returns the executor's structured error `Missing required parameter: <name> (<description>)` (`executor.ts:140-151`) — surfaced verbatim so the model can ask the user for it.

### AC-5 — forkSkill copies a skill (write, gated)
- **GIVEN** a source skill id in the tenant and a caller permitted to write,
- **WHEN** the model calls `forkSkill({ sourceSkillId, name?, scope? })`,
- **THEN** it calls `forkSkill(sourceSkillId, tenantId, userId, { name, scope })` (`executor.ts:329-374`), returns `{ ok:true, newSkillId, name }`, and the new row is owned by `createdByUserId = userId` with `forkedFromId = sourceSkillId`.

### AC-6 — forkSkill respects role + scope (write gate)
- **GIVEN** the caller's role and the requested fork scope,
- **WHEN** `forkSkill` is invoked,
- **THEN** a **workspace**-scoped fork requires `admin` (mirrors REST `route.ts:86-90`, which calls `requireAdmin` for workspace-scope creates); a **user**-scoped fork (default) is allowed for any writer (`member`/`admin`); a `viewer` is refused (viewers are read-only system-wide). On refusal: `{ ok:false, error:"<role> cannot fork a <scope> skill" }`, no DB write.

### AC-7 — Tenant isolation
- **GIVEN** a `sourceSkillId` belonging to a DIFFERENT tenant,
- **WHEN** `forkSkill`/`runCustomSkill` is called with it,
- **THEN** it is treated as not-found (the executor's queries already AND `tenantId` — `executor.ts:60,90,338`), returning a not-found error and writing nothing. No cross-tenant read or copy is possible.

### AC-8 — Tools are routed, not phantom
- **GIVEN** CLE-01's drift-guard,
- **WHEN** CLE-02 lands and removes `PENDING_TOOLS`,
- **THEN** all three names are real keys of `buildAllChatTools(ctx)`, each mapped to group `skills` in BOTH maps, and the drift-guard is fully strict and green.

### AC-9 — Degraded LLM
- **GIVEN** no `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (`executor.ts:46-50` returns null model),
- **WHEN** `runCustomSkill` runs,
- **THEN** it returns `{ success:false, error:"No LLM configured" }` (passed through from `executor.ts:110-120`) — the tool never throws; `listCustomSkills`/`forkSkill` still work (they don't need a model).

---

## 5. Out of scope

- Giving custom skills access to the chat tool registry mid-execution (skill-as-subagent). The executor is one-shot `generateText`; deepening it is a separate feature. The tool description must NOT imply the skill can call other tools.
- Creating/editing/deleting custom skills from chat beyond fork (create/PUT/DELETE stay in the Settings REST + UI). Fork is included because it is the natural "give me my own copy to run" chat verb and is low-risk.
- Surfacing system/built-in skills through these tools (they already have dedicated `buildSkillsTools` tools; double-exposure would confuse routing).
- Page Action Registry / actionned execution (CLE-03+).
- Unifying approval/`decideAction` (CLE-10) — fork's gate here is a local role check consistent with the existing REST gate; it will be folded into `decideAction` later but is NOT a blocker for CLE-02.

---

## 6. Edge cases

1. **id vs slug vs name precedence.** `findSkill` already prioritises `skillId` > `skillSlug`, then fuzzy `skillName` fallback (`executor.ts:69-97`). The tool passes all three through; it does not re-implement resolution.
2. **`scope` validation.** `forkSkill` executor defaults scope to `"user"` (`executor.ts:359`). The tool zod-validates `scope` ∈ {"user","workspace"} and applies the role gate (AC-6) BEFORE calling the executor.
3. **`parameters` typing.** Executor expects `Record<string,string>` (`CustomSkillInput.parameters`, `executor.ts:31`). The tool schema must coerce/validate values to strings (numbers/bools the model emits → string) to avoid a runtime mismatch.
4. **System skills name collision.** A user could name a custom skill identically to a built-in (e.g. "buildTAM"). `runCustomSkill` only ever queries `customSkillTemplates` — it cannot trigger a built-in. Document this so the model uses the built-in tool for built-in behavior.
5. **useCount side-effect.** `executeCustomSkill` increments `useCount`/`lastUsedAt` fire-and-forget (`executor.ts:170-178`). Acceptable; not part of the tool's return contract.
6. **Large output.** Skill output is free-form text (`executor.ts:180-187`). The tool returns it as-is; the chat layer already handles large tool results. No truncation added (would hide content).
7. **`targetEntityIds`/`entityContext`.** Pass-through to the executor (`CustomSkillInput`), which only uses `entityContext` in the prompt (`executor.ts:158,231`). `targetEntityIds` is accepted for forward-compat but currently unused by the executor — document, don't drop.

---

## 7. Evaluation steps (Phase 6 hostile QA)

1. `pnpm tsc --noEmit` → 0 errors.
2. `pnpm vitest run src/lib/chat/tools/__tests__/custom-skills.test.ts` → green (unit tests mock the executor; see tasks).
3. `pnpm vitest run src/lib/chat/__tests__/tool-routing-drift-guard.test.ts` → green **with `PENDING_TOOLS` removed** (proves the three are real + mapped, AC-8).
4. Grep `chat-system-prompt.ts` → the three names still advertised (now truthfully); no dangling claim about tool-access-within-skills.
5. Manual live (mint a Pilae session per `reference_dev-session-mint`): in chat, "list my custom skills" → returns the tenant's skills; "run <skill> with param X" → returns output; "fork <skill> for me" as member → user-scoped fork succeeds; as member request workspace scope → refused; "fork <other-tenant-id>" → not found. Screenshot each per CLAUDE.md.
6. Confirm no cross-tenant leak: fork with a known other-tenant skill id → not-found, no row written (check DB).
