# CLE-02 — Tasks

> Branch: `feat/CLE-02-custom-skill-bridge`. Commit trailer: `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> **Prerequisite: CLE-01 merged** (the three names are mapped to `skills` in both routing maps; the drift-guard ships with a `PENDING_TOOLS` allowlist that CLE-02 will remove). Execute in order. Working dir: `app/apps/web`.

---

## T-0 — Branch off main (post-CLE-01) + baseline
- **Action:** create `feat/CLE-02-custom-skill-bridge` off the post-CLE-01 `main`. Confirm CLE-01 landed: `tool-router.ts:184-186` maps the three names and the drift-guard exists with `PENDING_TOOLS`.
- **Verify:** `pnpm tsc --noEmit` 0 errors; `pnpm vitest run src/lib/chat/__tests__/tool-routing-drift-guard.test.ts` green (with allowlist still present).
- **Test:** baseline.

## T-1 — Fitness check on the executor (build-vs-fallback gate)
- **Action:** read `skills/custom/executor.ts` and confirm: tenant scoping on all queries (`:60,90,296-309,338`), graceful no-LLM degradation (`:110-120`), fork sets owner+tenant (`:352-370`). Decision: BUILD (requirements §1). If any check fails, switch to the removal fallback (requirements §2) and skip T-2/T-3/T-5, doing T-6 removal-style instead.
- **Verify:** all three checks pass → proceed BUILD.
- **Test:** none (decision gate).

## T-2 — Create the tools module
- **Action:** create `lib/chat/tools/custom-skills.ts` with `buildCustomSkillTools(ctx)` exporting `listCustomSkills`, `runCustomSkill`, `forkSkill` exactly per design §3 (zod schemas, string-coercion of params, fork role gate using `ctx.authCtx.role`, executor import aliased `forkSkill as forkSkillImpl`). No `db` import in this file.
- **File:** `app/apps/web/src/lib/chat/tools/custom-skills.ts` (new).
- **Verify:** `pnpm tsc --noEmit` 0 errors.
- **Test:** unit tests in T-5.

## T-3 — Register in buildAllChatTools
- **Action:** add `import { buildCustomSkillTools } from "./custom-skills";` and `...buildCustomSkillTools(ctx),` inside `buildAllChatTools` (`lib/chat/tools/index.ts:29-55`).
- **File:** `app/apps/web/src/lib/chat/tools/index.ts`.
- **Verify:** `pnpm tsc --noEmit` 0 errors; in a scratch REPL, `Object.keys(buildAllChatTools(stubCtx()))` now includes the three names.
- **Test:** T-4 (drift-guard).

## T-4 — Flip the drift-guard to strict (the CLE-01 hand-off)
- **Action:** in `lib/chat/__tests__/tool-routing-drift-guard.test.ts`, DELETE the `PENDING_TOOLS` constant and its two usages (the AC-4 phantom check no longer needs an allowlist). The three tools are now real registry keys.
- **File:** `app/apps/web/src/lib/chat/__tests__/tool-routing-drift-guard.test.ts`.
- **Verify:** `pnpm vitest run src/lib/chat/__tests__/tool-routing-drift-guard.test.ts` → green, fully strict (every map key now corresponds to a real tool; the three are mapped to `skills` in both maps). (AC-8.)
- **Test:** the drift-guard itself.

## T-5 — Unit tests for the three tools
- **Action:** create `lib/chat/__tests__/custom-skills.test.ts`. `vi.mock("@/skills/custom/executor")` so no DB/LLM. Cover, per design §9 / requirements ACs:
  - `listCustomSkills` forwards `ctx.tenantId`+`ctx.userId`, returns `{ skills, count }` (AC-1, AC-7).
  - `runCustomSkill`: not-found → `{ success:false, error:/No matching/ }` (AC-3); happy path returns executor result + forwards coerced string params (AC-2); numeric param → string (edge case 3); missing-required-param error passed through (AC-4); no-LLM → `{ success:false, error:"No LLM configured" }` (AC-9).
  - `forkSkill`: member+user → `forkSkillImpl` called, `{ ok:true, newSkillId }` (AC-5); member+workspace → `{ ok:false }`, impl NOT called (AC-6); viewer → refused (AC-6); impl throws → `{ ok:false, error:"Source skill not found" }` (AC-7).
- **File:** `app/apps/web/src/lib/chat/__tests__/custom-skills.test.ts` (new).
- **Verify:** `pnpm vitest run src/lib/chat/__tests__/custom-skills.test.ts` → green.
- **Test:** this IS the test.

## T-6 — System-prompt check (no edit expected)
- **Action:** confirm `chat-system-prompt.ts:92` still advertises the three tools accurately for the BUILD path. Do NOT add any claim that a skill can call other tools (requirements §5). No edit unless wording implies tool-access-within-skills (it doesn't today).
- **File:** `app/apps/web/src/lib/prompts/chat-system-prompt.ts` (read-only check).
- **Verify:** line reads truthfully; grep for "runCustomSkill" → still present, now backed by a real tool.
- **Test:** none.

## T-7 — Full regression + drift check
- **Action:** run the chat + agents test folders + tsc.
- **Verify:** `pnpm tsc --noEmit` 0 errors; `pnpm vitest run src/lib/chat src/lib/agents` all green (drift-guard strict, custom-skills unit tests, the four pre-existing routing tests). Run `regression.sh` if present.
- **Test:** all of the above.

## T-8 — Live verification (Playwright, Pilae session)
- **Action:** mint a session for `martin.paviot@pilae.ch` per `reference_callmode-local-verify` / `reference_dev-session-mint`. In chat: (1) "list my custom skills" → tenant skills; (2) "run <a skill>" → output; (3) "fork <skill> for me" as member → user-scoped fork OK; (4) request workspace-scope fork as member → refused; (5) "fork <known other-tenant id>" → not found. Screenshot before/after each per CLAUDE.md; save to the spec folder or `_research/raw/`.
- **Verify:** behaviors match AC-1/2/5/6/7. Confirm no row written for the cross-tenant fork (DB read).
- **Test:** evidence screenshots.

## T-9 — Commit
- **Action:** commit `custom-skills.ts`, `index.ts`, the two test files (new unit test + the drift-guard edit). Message: `feat(CLE-02): bridge custom skills to chat (runCustomSkill/listCustomSkills/forkSkill) + drift-guard strict`.
- **Verify:** `git status` clean except intended files; trailer present.
- **Test:** CI green.

---

## Definition of done (maps to requirements ACs)
- [ ] `custom-skills.ts` exports the three tools delegating to the executor (AC-1/2/5).
- [ ] Tenant scoping via executor only; no `tenantId` in any tool input (AC-7).
- [ ] Fork role-gated (viewer refused; workspace needs admin) (AC-6).
- [ ] Not-found / missing-param / no-LLM all return structured errors, never throw (AC-3/4/9).
- [ ] Registered in `buildAllChatTools`; drift-guard strict + green with `PENDING_TOOLS` removed (AC-8).
- [ ] System prompt truthful; no tool-access-within-skills claim.
- [ ] Unit tests green; `tsc` 0; live-verified.

## Dependency note (CLE-01 ↔ CLE-02)
CLE-02 is the partner that makes CLE-01's pre-mapping honest. The single shared artifact is the drift-guard's `PENDING_TOOLS` allowlist: CLE-01 ships it (so its strict phantom-check passes before the tools exist), CLE-02 removes it in T-4 (so the strict check now requires the tools to exist). Do not merge CLE-02 without T-4, or the drift-guard would still tolerate phantoms.
