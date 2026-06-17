# CLE-01 — Tasks

> Branch: `feat/CLE-01-tool-routing-reconcile`. Commit trailer: `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> Execute in order. Each task: action → file(s) → verify → test. Merge to main only on Phase 6 PASS.
> Working dir for all commands: `app/apps/web`.

---

## T-0 — Branch + baseline green
- **Action:** create `feat/CLE-01-tool-routing-reconcile` off `main`. Capture a baseline.
- **Verify:** `pnpm tsc --noEmit` (0 errors) and `pnpm vitest run src/lib/chat/__tests__` (existing routing tests green) BEFORE any change, so regressions are attributable.
- **Test:** none (baseline).

## T-1 — Pin the authoritative tool inventory (throwaway)
- **Action:** temporarily add to any test a `console.log(Object.keys(buildAllChatTools(stubCtx())).sort())` (stub from design §7) and run it; OR run a one-off `pnpm tsx` script. Record the live list + count. This is the ground truth the maps must cover.
- **File:** scratch only — do not commit.
- **Verify:** the printed count is ~160 and includes every name in requirements §2.3.
- **Test:** none. Delete the scratch.

## T-2 — Reconcile `tool-router.ts` map + comments
- **Action:** add the 12 missing entries (requirements AC-5 / design §3.1) to `TOOL_GROUPS` under the right section comments. Replace every "126" comment (`:1-2`, `:401`) with a derived-count note. Expand the module list comment (`:33-35`) to all 24 modules. Leave the 3 phantom entries (`:184-186`) in place (CLE-02 makes them real). Leave `executeCode` (`:193`) as-is.
- **File:** `app/apps/web/src/lib/chat/tool-router.ts`.
- **Verify:** `pnpm tsc --noEmit` 0 errors; grep `tool-router.ts` for `126` → 0 hits; `getToolGroup("mapDealStakeholders")` returns `"intelligence"` via a quick REPL/scratch.
- **Test:** covered by the drift-guard (T-5); the four existing routing tests must still pass after this edit.

## T-3 — Reconcile `orchestrator.ts` mirror + add accessor
- **Action:** add the identical entries to `TOOL_GROUP_MAP` (`:56-141`), including the ones tool-router already had but the mirror lacked (at minimum `executeCode: "intelligence"`; add any others the drift-guard names in T-5). Add the 3 phantom names (`runCustomSkill`/`listCustomSkills`/`forkSkill` → `skills`) to keep the mirrors identical. Add the exported `getOrchestratorToolGroup(name)` accessor (design §3.2). Replace "126" comments (`:6-7,22`).
- **File:** `app/apps/web/src/lib/agents/orchestrator.ts`.
- **Verify:** `pnpm tsc --noEmit` 0 errors; grep `orchestrator.ts` for `126` → 0 hits; `getOrchestratorToolGroup` is exported.
- **Test:** drift-guard (T-5).

## T-4 — (Only if T-1 surfaced a builder that throws at registration)
- **Action:** if `buildAllChatTools(stubCtx())` throws, make the offending builder pure at registration (move the `ctx` dereference into `execute`). This keeps registration side-effect-free, which the test depends on.
- **File:** the offending `lib/chat/tools/<module>.ts`.
- **Verify:** stub build no longer throws.
- **Test:** drift-guard (T-5). Add a one-line regression note in the test comment.
- **Note:** expected to be a no-op — current builders only destructure `ctx` fields and wrap them; DB calls are inside `execute`. Skip if T-1 built cleanly.

## T-5 — Write the drift-guard test (the heart of CLE-01)
- **Action:** create `tool-routing-drift-guard.test.ts` with the EXACT contents in design §7 (7 `it` blocks: sanity floor, tool-router totality AC-2, orchestrator totality AC-3, known-group AC-5, per-tool agreement AC-3, phantom-key AC-4 gated by `PENDING_TOOLS`, intended-groups AC-5).
- **File:** `app/apps/web/src/lib/chat/__tests__/tool-routing-drift-guard.test.ts`.
- **Verify:** `pnpm vitest run src/lib/chat/__tests__/tool-routing-drift-guard.test.ts` → all green. If "every live tool has an orchestrator group" or "the two maps agree" fails, it prints the exact missing/mismatched names → return to T-3 and add them. Iterate until green.
- **Test:** this IS the test.

## T-6 — Prove the guard bites (negative checks) + document the CLE-02 seam
- **Action:**
  1. Temporarily add `zzTestTool: makeTool({ description:"x", inputSchema: z.object({}), execute: async()=>({}) })` to one builder → run drift-guard → confirm AC-2/AC-3 FAIL naming `zzTestTool`. Revert.
  2. Temporarily add `zzPhantom: "skills"` to `TOOL_GROUPS` → run → confirm AC-4 FAILs naming `zzPhantom`. Revert.
  3. Add a comment block atop the test stating: "`PENDING_TOOLS` is removed by CLE-02 once runCustomSkill/listCustomSkills/forkSkill are real tools; do not add other names here."
- **File:** test file + scratch edits (reverted).
- **Verify:** both negative cases fail as expected; after revert, suite green.
- **Test:** the guard itself.

## T-7 — Full regression + drift check
- **Action:** run the whole chat test folder + tsc.
- **Verify:** `pnpm tsc --noEmit` 0 errors; `pnpm vitest run src/lib/chat/__tests__ src/lib/agents` all green (drift-guard + the four pre-existing routing tests: `new-tools-routing`, `command-layer-routing`, `knowledge-tool-routing`, `call-sprint-routing`). Run repo `regression.sh` if present.
- **Test:** all of the above.

## T-8 — Commit
- **Action:** commit the two map files + the new test. Message: `fix(CLE-01): reconcile tool-router/orchestrator maps with the 160-tool registry + drift-guard`.
- **Verify:** `git status` clean except intended files; trailer present.
- **Test:** CI green on the branch.

---

## Definition of done (maps to requirements ACs)
- [ ] No "126" literal in either map file (AC-1).
- [ ] Drift-guard: every `buildAllChatTools` key has a group in BOTH maps (AC-2, AC-3) and the maps agree per tool (AC-3).
- [ ] No phantom map keys except the gated `PENDING_TOOLS` trio (AC-4).
- [ ] §2.3 tools land in intended groups (AC-5).
- [ ] Drift-guard green; bites on injected drift (AC-6).
- [ ] Four pre-existing routing tests still green; `tsc` 0 (AC-7).
- [ ] `PENDING_TOOLS` allowlist + comment left for CLE-02 to remove (requirements §6).

## Hand-off to CLE-02
CLE-02 must, as its final task: add the three real tools, then **delete the `PENDING_TOOLS` set** from this test (and its two uses), making AC-4 fully strict. After that deletion the drift-guard requires the three tools to exist in `buildAllChatTools` — which is exactly CLE-02's deliverable. If CLE-02 instead chooses the *removal* fallback, it deletes the three map entries (T-2/T-3) AND the `PENDING_TOOLS` set AND the system-prompt reference together.
