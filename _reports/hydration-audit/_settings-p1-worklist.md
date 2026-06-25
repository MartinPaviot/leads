# Settings (T2) P1 hydration worklist — verified 2026-06-25

## STATUS: COMPLETE (2026-06-25)

All confirmed P1 error-masking defects fixed across 14 settings pages, in 5 commits:
- batch 1 `c33d67d9`: S07 objects · S08 data-model · S10 plays
- batch 2 `73293cbf`: S34 privacy (+ 'team' visibility option) · S38 autonomy · S22 inbox-voice
- batch 3 `c1907293`: S24 inbox-autonomy · S26 inbox-notifications · S31 agent-memory
- batch 4 `24190141`: S01 profile · S21 writing-style · S09 workflows · S05 stages (route)
- batch 5 (this commit): S14 evals (dev-only, minimal) · S20 mail-calendar (post-PUT re-sync)

S33 security = verified write-only-by-design (no on-mount load; handleSubmit checks
res.ok + toasts) — no fix. S18 mailboxes = redirect to S20. The deferred P2s below
(skeletons, gdprRegion-from-env architectural change, audit-log entry, no-refresh
polish) are NOT done — flagged, lower severity than the error-masking class.

---


Source: `verify-settings-hydration` workflow (17 Explore agents, hostile-verify
against CURRENT code). All pages confirmed `usesSafeFetch: false` UNLESS noted.
The repo standard `safeFetch`/`useSafeFetch` (`src/lib/infra/safe-fetch.ts`)
surfaces failures via toast — the fix for most is to route loads/saves through it
or add an explicit `res.ok`/error-state guard. Only P1 listed here; P2 polish
(skeletons, refresh buttons, post-PUT re-fetch) noted briefly per page.

Status legend: [ ] todo · [x] done · [~] deferred/by-design.

## Confirmed P1 defects (fix order = highest user-impact first)

- [ ] **S07 settings/objects** — GET error-as-empty (page.tsx:99-103); POST/PUT
  swallowed-save, modal closes on failure (171-197); DELETE false success (199-213).
  Fix: guard `res.ok` on each; toast on failure; don't close modal / don't mutate
  list on failure. P2: no refresh after mount.
- [ ] **S08 settings/data-model** — GET coerces 500→empty (page.tsx:52-56);
  save ignores 403/404/500 → false success across add/remove/rename/options/aiMode
  (157-168). Fix: `res.ok` guards + error surface.
- [ ] **S10 settings/plays** — list fetch error-as-empty (49-61); handleToggle no
  status check (123-134); handleDelete false success (136-144). Fix: `res.ok` + toast.
- [ ] **S34 settings/privacy** — compliance fetch swallows all errors (page.tsx:80-92);
  visibility selector missing 'team' option so a stored 'team' shows NO active button
  (52-70,278) — unwired-load. Fix: safeFetch + add 'team' to VISIBILITY_OPTIONS
  (import Users icon). P2: gdprRegion from env not tenant (architectural — skip);
  audit-log defaultDataVisibility (workspace/route.ts ~175).
- [ ] **S38 settings/autonomy** — fetchConfig swallow, no error (page.tsx (rest)/...:93-94);
  guardrail defaults (40/25/5) indistinguishable from stored on failure (66-71,84-86).
  Fix: errorMessage state + toast + banner "values are defaults, not your saved config".
- [ ] **S22 settings/inbox-voice** — auto-draft toggle save not reflected back (72);
  voice GET swallow (46); auto-draft GET swallow (57-62). Fix: read both Promise.all
  responses; error state on GET failures.
- [ ] **S24 settings/inbox-autonomy** — GET swallow no error (50); save fail-soft no
  error (84-85). Fix: useSafeFetch on load + save.
- [ ] **S26 settings/inbox-notifications** — GET swallow (page.tsx:58); PUT save swallow
  (94-95). Fix: useSafeFetch / res.ok + error state.
- [ ] **S31 settings/agent-memory** — GET swallow → snapshot null no error (79-80);
  no error/empty body state when snapshot null after fail (143-221). Fix: safeFetch +
  error Card with Retry.
- [ ] **S01 settings (profile)** — GET swallow → empty inputs (page.tsx:23-33). Fix:
  safeFetch + setError + don't render empty form on failure. P2: tz browser-default
  when unset (route.ts:96); no loading skeleton (page.tsx:59 returns null).
- [ ] **S21 settings/writing-style** — fetch swallow error-as-empty (60,72); Promise.all
  blocks whole page on writing-style error while voice/derive degrade (59-62). Fix:
  safeFetch on writing-style + Promise.allSettled (or split fetches). P2: voice/derive
  silent fallback.
- [ ] **S09 settings/workflows** — optimistic toggle/delete never reverts on persist
  error → silent-stale (260-270); NL builder falls back to hardcoded sample on parse
  failure → error-as-empty (296-311). Fix: await persist + revert on error; NL error
  state instead of sample. P2: no per-row pending.
- [ ] **S14 settings/evals** (dev-only, 404 in prod via EVALS_PAGE_ENABLED) — dataset/run
  fetch swallow (evals-client.tsx:35-36); loadCases swallow (46); loadRun swallow (52-56).
  Fix: safeFetch + toast. P2: loading + empty states for cases/results. LOWER priority
  (dev-only page).
- [ ] **S05 settings/stages** (ROUTE-only) — PipelineStage type missing aiFillMode/wipLimit
  (route.ts:7-12); DEFAULT_STAGES omits them (14-23) so new tenants load without them.
  Fix: add optional fields to the type + defaults. Mechanical.

## Lower-value / already-handled

- [~] **S18 / S20 mail-calendar** — already `usesSafeFetch: true`. Only P1: save doesn't
  re-fetch server-sanitized values after PUT (add `await loadData()` after the PUT).
  Lower impact (errors already toast). P2: connectCustom raw fetch (S20:173).
- [?] **S33 settings/security** — verifier didn't emit a structured finding (the 1 failed
  agent). Rollup says password is write-only-by-design (POST verifies via bcrypt). Likely
  no real hydration defect — VERIFY before assuming, then mark [~] if by-design.

## Pattern for the fix (consistent, low-risk)

1. Loads: replace raw `fetch` (or `.then(r=>r.ok?...:null)`) with `useSafeFetch`/`safeFetch`
   (toasts on failure) OR add an explicit `loadError` state + check `res.ok`; render an
   error branch (retry) BEFORE the empty/default render so a 500 ≠ empty/defaults.
2. Saves/toggles/deletes: check `res.ok` (or use sfetch's `error`) BEFORE showing success /
   closing the modal / mutating local state; toast the failure; for optimistic updates,
   revert local state on error.
3. No new test harness for these client pages (precedent: heavy client pages → inline fix +
   tsc + existing-suite regression). Commit per page with the audit note.
