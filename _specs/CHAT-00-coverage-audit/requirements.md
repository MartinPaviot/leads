# CHAT-00 — Requirements

## User story

> As a **LeadSens user**, I want the chat to be able to trigger **any CRM action** I can do from the UI, so that I never hit "I can't help with that" for routine operations and I can work entirely from the chat if I want to.

> As a **LeadSens developer**, I want a **canonical matrix** of which UI/API actions are chat-reachable today so that every new backend mutation either extends the chat registry or is consciously excluded.

## Acceptance criteria (GIVEN / WHEN / THEN)

### AC1 — Audit completeness
- **GIVEN** the repo at commit `HEAD` of `feat/CHAT-00-coverage-audit`
- **WHEN** I open `_specs/CHAT-00-coverage-audit/coverage-matrix.md`
- **THEN** every `route.ts` under `app/apps/web/src/app/api/**` exporting `POST | PUT | PATCH | DELETE` appears exactly once in the matrix
- **AND** each row has a status in `{covered, gap-A, gap-B, gap-C, excluded}` with a reason field

### AC2 — Gap tiers are prioritized
- **GIVEN** the matrix
- **WHEN** I filter rows by `status = gap-A`
- **THEN** rows represent mutations the user hits daily (contacts/merge, notes create, sequences enroll, meetings book, emails send, settings ICP write, ...) — total ≤ 30
- **AND** `gap-B` represents admin/settings operations (knowledge base, mailbox config, custom fields, workflows, views) — total ≤ 30
- **AND** `gap-C` represents power-user / low-frequency ops (GDPR, cron, eval, billing portal) — total ≤ 25
- **AND** `excluded` covers webhooks, cron, test-e2e, auth/password-reset with explicit rationale

### AC3 — Destructive operations are flagged
- **GIVEN** the matrix
- **WHEN** I filter by `destructive = true`
- **THEN** I see all 14 DELETE endpoints plus merge/purge/cleanup
- **AND** each is flagged "requires approval + undo support from CHAT-04"

### AC4 — Tasks file is actionable
- **GIVEN** `tasks.md`
- **WHEN** a developer picks task N
- **THEN** the task specifies: tool name, zod schema, backing endpoint, target file (`app/apps/web/src/app/api/chat/route.ts` line range), test file, acceptance steps
- **AND** tasks are topologically ordered (schema introspection before CRUD, CRUD before bulk, bulk before agentic)

### AC5 — feature_list.json is populated
- **GIVEN** `_specs/feature_list.json` exists
- **WHEN** I parse it
- **THEN** entries `CHAT-00` through `CHAT-09` are present with `id, title, dependencies, milestone, status`
- **AND** `CHAT-00` has `status: completed` once this PR merges

### AC6 — Each chat-only tool (no backing endpoint) is preserved and documented
- **GIVEN** the 18 tools in category "chat-only" (getDealCoaching, analyzePipeline, scanSignals, detectChurnRisk, etc.)
- **WHEN** we review the matrix
- **THEN** each appears under "Higher-order compositions" with note "intentionally has no 1:1 endpoint; synthesizes N reads"

## Edge cases the matrix must account for

1. **Duplicate endpoints**: `deals/[id]` and `opportunities/[id]` do the same thing (legacy alias). Matrix marks one canonical, notes alias.
2. **Multi-method routes**: single `route.ts` exporting both POST and PATCH (e.g., `outbound/review`) needs a row per method.
3. **Polymorphic routes**: `custom-objects/[type]/[id]` serves all custom types — matrix treats as one row with note "dispatches by type".
4. **Internal-only routes**: `cron/*`, `webhooks/*`, `inngest/*`, `test-e2e/*` → `excluded` tier with reason "automated trigger, not user-facing".
5. **Admin-only routes**: `admin/purge-fake-data`, `gdpr/delete`, `eval/*` → `excluded` unless Martin approves chat exposure (default exclude, flag for review).
6. **Read endpoints with side effects**: `accounts/[id]/summarize` POSTs but is semantically a read — classify as "compute" tier.

## Out of scope for CHAT-00

- Actually building any new tools (that's CHAT-01).
- Writing capability resolver (that's CHAT-02).
- UI changes (no surface work in this ticket).
- Deciding exclusion policy for destructive ops in shared settings (flag for Martin, default to per-tool approval).

## Evaluation steps (manual QA at end of CHAT-00)

1. Open `coverage-matrix.md`. Scroll to a random endpoint I know exists (e.g., `sequences/[id]/enroll`). Verify row is present with correct status.
2. Count rows with `status = covered`; must equal ~28 (matches audit finding).
3. Count rows with `status = gap-A/B/C`; must sum to ~85 (129 mutations − 28 covered − ~16 excluded).
4. Open `tasks.md` task #1. Verify file paths and line refs are valid.
5. Parse `feature_list.json` with `node -e` to confirm valid JSON.
