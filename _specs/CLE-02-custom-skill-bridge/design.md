# CLE-02 — Design

> Reads against live code at 2026-06-16. All `file:line` are real.

---

## 1. System fit

The bridge is three `makeTool` wrappers in a NEW module `lib/chat/tools/custom-skills.ts`, registered by `buildAllChatTools` (`lib/chat/tools/index.ts:29-55`), delegating to the already-tenant-scoped executor `skills/custom/executor.ts`. It mirrors exactly how `buildSkillsTools` (`lib/chat/tools/skills.ts:7-734`) wraps the built-in skill runner — except the delegate is `executeCustomSkill`/`listAvailableSkills`/`forkSkill` (DB custom skills) instead of `runSkill` (hardcoded skills).

Why a new module rather than appending to `skills.ts`: `skills.ts` is the curated *built-in* skill surface; custom (DB) skills are a distinct concern with their own executor and write semantics (fork). Keeping them in `custom-skills.ts` keeps `buildSkillsTools` focused and makes the drift-guard mapping obvious (whole module → group `skills`).

The `ToolContext` (`lib/chat/tools/context.ts:6-12`) already carries everything the executor needs:
- `ctx.tenantId` → executor `tenantId` arg.
- `ctx.userId` → executor `userId` arg.
- `ctx.authCtx.role` (`auth-utils.ts:13`) → the fork write gate (AC-6).

Request path is unchanged: `buildAllChatTools` → `resolveCapabilities` → `orchestrate`/`routeTools` (`route.ts:610-638`). Because CLE-01 maps the three names to group `skills`, they route in for the existing "skills/research/qualify/…" intent (`tool-router.ts:360-388`) and for the `research`/`outreach` specialists (`orchestrator.ts:44-45` include `skills`).

---

## 2. Data model / types

No schema change. Uses `customSkillTemplates` (`db/schema/intelligence.ts:621-653`) exclusively through the executor (no direct table access in the tool — the tool never imports `db`). Executor I/O types reused verbatim:

- Input: `CustomSkillInput` (`executor.ts:27-34`) — `{ skillId?, skillSlug?, skillName?, parameters?: Record<string,string>, entityContext?, targetEntityIds?: string[] }`.
- Output: `CustomSkillResult` (`executor.ts:36-44`) — `{ success, output, skillName, parametersUsed, knowledgeUsed, durationMs, error? }`.
- List item: the object shape returned by `listAvailableSkills` (`executor.ts:282-293`).
- `forkSkill` returns `string` (the new id) (`executor.ts:329-334`).

---

## 3. Tool contracts (zod schemas — exact)

All three use `makeTool` (`context.ts:14-26`): `{ description, inputSchema: z.ZodType, execute }`. Tenant/user are taken from `ctx`, NEVER from tool input (the model cannot spoof tenant).

### 3.1 `listCustomSkills`
```ts
listCustomSkills: makeTool({
  description:
    "List the user's saved CUSTOM skills (reusable workflows they created in Settings), " +
    "scoped to this workspace and user. Returns name, slug, description, scope, and usage. " +
    "Use when the user asks 'what skills do I have', 'list my playbooks', or before running one. " +
    "This is for user-created skills only — built-in capabilities have their own dedicated tools.",
  inputSchema: z.object({}), // no inputs; scope is always the caller's tenant+user
  execute: async () => {
    const skills = await listAvailableSkills(ctx.tenantId, ctx.userId);
    return { skills, count: skills.length };
  },
}),
```

### 3.2 `runCustomSkill`
```ts
const RunInput = z.object({
  skillId: z.string().optional().describe("Exact custom-skill id (preferred)"),
  skillSlug: z.string().optional().describe("Skill slug"),
  skillName: z.string().optional().describe("Fuzzy skill name (fallback resolution)"),
  parameters: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Parameter values for the skill; keys are the skill's declared parameter names"),
  entityContext: z.string().optional().describe("Free-text context about the current record/entity"),
  targetEntityIds: z.array(z.string()).optional().describe("Optional related entity ids (forward-compat)"),
})
.refine((v) => v.skillId || v.skillSlug || v.skillName, {
  message: "Provide one of skillId, skillSlug, or skillName",
});

runCustomSkill: makeTool({
  description:
    "Run one of the user's saved CUSTOM skills by id, slug, or name, grounded in the workspace's " +
    "business knowledge. Returns the skill's text output. Resolve the skill first with listCustomSkills " +
    "if unsure of the id. Note: a custom skill produces a written result; it does not itself call other tools.",
  inputSchema: RunInput,
  execute: async (input) => {
    // Coerce parameter values to strings (executor expects Record<string,string>).
    const parameters = input.parameters
      ? Object.fromEntries(Object.entries(input.parameters).map(([k, v]) => [k, String(v)]))
      : undefined;
    const skill = await findSkill(
      { skillId: input.skillId, skillSlug: input.skillSlug, skillName: input.skillName },
      ctx.tenantId,
      ctx.userId,
    );
    if (!skill) {
      const crit = input.skillId ?? input.skillSlug ?? input.skillName ?? "(none)";
      return { success: false, error: `No matching custom skill found for "${crit}"` };
    }
    return executeCustomSkill(
      skill,
      { ...input, parameters },
      ctx.tenantId,
      ctx.userId,
    );
  },
}),
```

### 3.3 `forkSkill` (write — gated)
```ts
const ForkInput = z.object({
  sourceSkillId: z.string().describe("Id of the skill to copy"),
  name: z.string().optional().describe("Name for the new copy (default: '<source> (custom)')"),
  scope: z.enum(["user", "workspace"]).optional().describe("Visibility of the copy; default 'user'"),
});

forkSkill: makeTool({
  description:
    "Create the user's own editable copy of a skill so they can customize it. Writes a new skill. " +
    "Workspace-scoped copies require admin; user-scoped copies are personal. Use when the user says " +
    "'fork this skill', 'make my own version', or 'copy and let me tweak it'.",
  inputSchema: ForkInput,
  execute: async (input) => {
    const scope = input.scope ?? "user";
    const role = ctx.authCtx.role; // "admin" | "member" | "viewer"
    // Write gate — mirrors REST route.ts:86-90 (workspace create requires admin)
    if (role === "viewer") {
      return { ok: false, error: "Viewers cannot fork skills" };
    }
    if (scope === "workspace" && role !== "admin") {
      return { ok: false, error: "Only admins can fork a workspace-scoped skill" };
    }
    try {
      const newSkillId = await forkSkillImpl(input.sourceSkillId, ctx.tenantId, ctx.userId, {
        name: input.name,
        scope,
      });
      return { ok: true, newSkillId, name: input.name ?? null };
    } catch (e) {
      // executor throws "Source skill not found" when id is absent OR cross-tenant (executor.ts:346)
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  },
}),
```
Import alias to avoid the tool name shadowing the executor export:
```ts
import { findSkill, executeCustomSkill, listAvailableSkills, forkSkill as forkSkillImpl } from "@/skills/custom/executor";
```

### 3.4 Builder signature
```ts
export function buildCustomSkillTools(ctx: ToolContext) {
  return { listCustomSkills: ..., runCustomSkill: ..., forkSkill: ... };
}
```
Registered in `index.ts` by adding `import { buildCustomSkillTools } from "./custom-skills";` and `...buildCustomSkillTools(ctx),` inside `buildAllChatTools` (`index.ts:29-55`).

---

## 4. Tenant scoping (precise)

- **Read (`listCustomSkills`, `runCustomSkill`):** scoping is enforced *inside the executor*, not in the tool. `listAvailableSkills` ANDs `eq(tenantId)` + active + (workspace OR user-owned) (`executor.ts:296-309`). `findSkill` ANDs `eq(tenantId)` + active + scope predicate (`executor.ts:58-67`) and its fuzzy fallback also ANDs `eq(tenantId)` (`executor.ts:88-94`). The tool passes `ctx.tenantId`/`ctx.userId` only — the model supplies neither. Therefore no `tenantId`/`userId` field appears in any zod schema (AC-7).
- **Write (`forkSkill`):** `forkSkillImpl` selects the source with `and(eq(id), eq(tenantId))` (`executor.ts:336-343`) → cross-tenant source = "Source skill not found" → `{ ok:false }`, no insert. The inserted row sets `tenantId: ctx.tenantId`, `createdByUserId: ctx.userId` (`executor.ts:352-370`). Role gate runs in the tool before the call (§3.3).
- **No raw `db` import in the tool module** — all access is through the executor, so there is exactly one tenant-scoping implementation to audit.

---

## 5. Contract changes elsewhere

- `lib/chat/tools/index.ts` — +1 import, +1 spread (the only edit to existing chat-tools wiring).
- `lib/chat/tool-router.ts` / `lib/agents/orchestrator.ts` — **no new edits**: CLE-01 already added the three names to both maps (group `skills`). CLE-02 only removes the `PENDING_TOOLS` allowlist in the drift-guard test.
- `lib/prompts/chat-system-prompt.ts:92` — **no change needed**: the line already advertises the three tools accurately for the BUILD path. (If the fallback removal path were taken instead, this line would be edited; not the case here.) Add nothing about tool-access-within-skills (requirements §5).
- `skills/custom/executor.ts` — **no change** (consumed as-is).

---

## 6. Data flow

```
user: "run my Romand-inbound skill on this contact"
 → model calls runCustomSkill({ skillName:"Romand inbound", entityContext:"<contact summary>" })
 → tool.execute: findSkill(..., ctx.tenantId, ctx.userId)         [executor.ts:52]
 → executeCustomSkill(skill, {parameters,entityContext}, tenantId, userId)  [executor.ts:102]
     → retrieveKnowledge(...) + validate params + generateText(...)  [executor.ts:133-167]
 → returns { success, output, knowledgeUsed, ... } to the model
 → model relays output to user
```
`forkSkill` flow: model → tool.execute → role gate → `forkSkillImpl` → `{ ok, newSkillId }`.

---

## 7. Failure handling

| Failure | Source | Tool behavior |
|---|---|---|
| Skill not found | `findSkill` → null (`executor.ts:99`) | `{ success:false, error:"No matching custom skill found for …" }` (AC-3) |
| Missing required param | `executeCustomSkill` (`executor.ts:140-151`) | structured error passed through (AC-4) |
| No LLM key | `getLLMModel` null (`executor.ts:46-50,110-120`) | `{ success:false, error:"No LLM configured" }` (AC-9) |
| LLM throws | try/catch in executor (`executor.ts:188-203`) | `{ success:false, error:<msg> }` |
| Fork cross-tenant / bad id | `forkSkillImpl` throws "Source skill not found" (`executor.ts:346`) | caught → `{ ok:false, error }` (AC-7) |
| Fork role refused | tool gate (§3.3) | `{ ok:false, error }`, no DB write (AC-6) |

No tool ever throws to the agent loop — all paths return a structured object (consistent with the rest of `buildSkillsTools`, which returns `result.data ?? { error }`).

---

## 8. Security

- **Tenant isolation:** §4 — single enforcement point (executor), no `tenantId` in tool input. Consistent with the tenant-isolation audit (`project_tenant-isolation-audit`: isolation = app-layer `WHERE tenantId`).
- **Write authorization:** fork is the only mutation. Gated by `ctx.authCtx.role` in the tool, mirroring REST `route.ts:86-90`. This is a *local* gate now; CLE-10 will route it through `decideAction` — noted, not blocking. Viewer is refused (system-wide read-only invariant, `project_workspace-roles`).
- **No prompt injection escalation:** a skill's prompt is built server-side from the stored template (`executor.ts:206-273`); the tool doesn't let the model inject arbitrary system instructions beyond `entityContext` (already how the executor works via REST). No new surface.
- **No new external send / no money / no PII export.** `cost: free` semantically (the skill may call the model, but that's existing executor behavior, not a new outbound action).

---

## 9. Test strategy

New file `app/apps/web/src/lib/chat/tools/__tests__/custom-skills.test.ts` (or under `lib/chat/__tests__/` to match the existing folder — pick the latter for consistency with the drift-guard). Mock `@/skills/custom/executor` so no DB/LLM is needed:

- `listCustomSkills` returns `{ skills, count }` from a mocked `listAvailableSkills`; asserts `ctx.tenantId`/`ctx.userId` are forwarded (spy on the mock args) (AC-1, AC-7).
- `runCustomSkill` with no resolver fields → zod `.refine` rejects (input invalid) — assert the schema, OR (since `makeTool` validates upstream) assert `findSkill` not called; with a name that mocks to null → `{ success:false, error: /No matching/ }` (AC-3); happy path forwards coerced string params and returns the executor result (AC-2); numeric param coerced to string (edge case 3).
- `forkSkill`: member + user scope → calls `forkSkillImpl`, returns `{ ok:true, newSkillId }` (AC-5); member + workspace scope → `{ ok:false }`, `forkSkillImpl` NOT called (AC-6); viewer → refused (AC-6); executor throws → `{ ok:false, error:"Source skill not found" }` (AC-7).
- Drift-guard (CLE-01) re-run **after** removing `PENDING_TOOLS` → green, proving the three are real registry keys mapped to `skills` in both maps (AC-8).

`tsc` 0 errors. Run `regression.sh` if present.
