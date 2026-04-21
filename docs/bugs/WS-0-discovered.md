# Bugs discovered during WS-0 — do NOT fix in WS-0

Source: `_reports/onboarding-audit-2026-04-21.md`. WS-0 is pure instrumentation (per master brief §3). Bugs listed here are captured for later workstreams to pick up. Each entry: id, severity (S1=critical / S2=material / S3=polish), file:line, description, target workstream.

Status legend: `open` (not touched), `fixed-in-WS-0` (the one exception — `AGENT_REGISTRY` gap covered by PR 1's T1.2, because its absence would silently break WS-0's own dashboard — documented in `WS-0-plan.md §1 Q2`).

---

## BUG-WS0-001 — `build-tam` and `onboarding-narrator` missing from `AGENT_REGISTRY`
- **Severity:** S2
- **File:** `app/apps/web/src/lib/observability.ts:42-319` (registry), consumers at `observability.ts:420-430`
- **Description:** Both agents fire `_trace: { agentId: ... }` via `tracedGenerateText`/`tracedGenerateObject`, which records to `agent_traces`. But `AGENT_REGISTRY` is consulted for alert thresholds (`maxLatencyMs`, `maxCostPerCall`, `qualityThreshold`). Without a registry entry, the alert logic at lines 420-430 silently no-ops because `agent` resolves to `undefined`.
- **Target workstream:** fixed-in-WS-0 (PR 1). Rationale in `WS-0-plan.md §1 Q2`.

---

## BUG-WS0-002 — `defaultDataVisibility = "team"` is a placeholder (UI claims feature that does nothing)
- **Severity:** S2
- **File:** `app/apps/web/src/lib/tenant-settings.ts:64`, wizard render at `onboarding-wizard.tsx` privacy step
- **Description:** The wizard presents "Team" as an option on step 3 (Privacy). `tenant-settings.ts:64` comment confirms "today behaves like everyone". The UI promises scoping that doesn't exist. Trust-damaging.
- **Target workstream:** WS-5 (cleanup — either implement team scoping or retire the option).

---

## BUG-WS0-003 — `confidenceGaps` panel is read-only (dead UI)
- **Severity:** S2
- **File:** `app/apps/web/src/components/onboarding-wizard.tsx` — ICP step render block (search `confidenceGaps`)
- **Description:** The LLM returns `confidenceGaps` — questions the AI would like the user to answer to refine targeting. Wizard renders them inside a blue panel but with no input controls. The user reads the questions and moves on; the answers go nowhere.
- **Target workstream:** WS-2 (confirmation card). Either wire inputs or delete the panel.

---

## BUG-WS0-004 — `aiTone` modified silently by `applyWebsiteAnalysis`
- **Severity:** S2 (violates master brief §2.1.1 criterion 3: "zero silent surprises")
- **File:** `app/apps/web/src/components/onboarding-wizard.tsx` `applyWebsiteAnalysis` function (search for `suggestedTone`)
- **Description:** When the user clicks Continue on step 4, the helper silently overwrites `aiTone` from `"Direct"` (default) to whatever the LLM suggested. No UI surfaces the change. The user's emails go out in a tone they didn't pick.
- **Target workstream:** WS-2 (either surface the tone in the confirmation card with an explicit toggle, or remove the silent override).

---

## BUG-WS0-005 — Progress bar shows X/7 when one step is skipped (connect)
- **Severity:** S3
- **File:** `app/apps/web/src/components/onboarding-wizard.tsx` — `<ProgressBar current={stepIndex} total={7} />`
- **Description:** `handleConnectContinue` skips the `privacy` step when `emailConnected === false`, so the user only sees 6 steps but the progress bar still shows 7. Minor deceit.
- **Target workstream:** WS-2.

---

## BUG-WS0-006 — `handleConnectSkip` is unused dead code
- **Severity:** S3
- **File:** `app/apps/web/src/components/onboarding-wizard.tsx:591` (`handleConnectSkip`)
- **Description:** Declared but never referenced. The actual skip-for-now flow goes through `handleConnectContinue`. WS-0 PR 2 instrumented the live path and left the dead function untouched.
- **Target workstream:** WS-5 (cleanup pass).

---

## BUG-WS0-007 — `find-contacts` hardcodes seniorities, ignoring user selection
- **Severity:** S2 (user-selected targeting ignored)
- **File:** `app/apps/web/src/app/api/onboarding/find-contacts/route.ts:47`
- **Description:** The seniority filter is hardcoded to `["c_suite", "vp", "director"]`. The user's `targetSeniorities` selection (collected on step 5) is applied to the LLM prompt context but NOT to the Apollo people search that actually finds the contacts. Pre-built "Founder" / "Manager" / "Senior" picks are silently dropped.
- **Target workstream:** WS-4 (TAM + contacts). Wire `settings.targetSeniorities` through to `person_seniorities` in the Apollo call.

---

## BUG-WS0-008 — `targetRoles` derived-but-persisted creates desync risk
- **Severity:** S2
- **File:** `app/apps/web/src/app/api/onboarding/save/route.ts:83-85`, `app/apps/web/src/app/(dashboard)/settings/icp/page.tsx`
- **Description:** `targetRoles` is stored as a string joined from `targetSeniorities + targetDepartments` at save time, but if the user later edits seniorities/departments on the settings/icp page, `targetRoles` is NOT re-derived. Every downstream prompt (sequences, chat, find-contacts) reads the stale `targetRoles`.
- **Target workstream:** WS-5. Preferred fix: drop the stored `targetRoles` column entirely and re-derive on read.

---

## BUG-WS0-009 — Wizard's `DEFAULT_IGNORED_DOMAINS` list (15) diverges from `buildIgnoredDomains` (20)
- **Severity:** S3
- **Files:** `app/apps/web/src/components/onboarding-wizard.tsx` (`DEFAULT_IGNORED_DOMAINS`), `app/apps/web/src/lib/tenant-settings.ts:263-277` (`buildIgnoredDomains`)
- **Description:** Wizard pre-populates 15 providers; the helper used during email sync has 20. A tenant whose onboarding ran first would have 5 providers silently added on first sync without ever seeing them in the UI.
- **Target workstream:** WS-5. Single source of truth. Move the list to a shared constant.

---

## BUG-WS0-010 — `identifyUser` never called with `salesMotion` / `primaryChallenge` / `onboardingRole`
- **Severity:** S3
- **Files:** `app/apps/web/src/lib/analytics.ts` (`identifyUser` function), no current call sites set these properties
- **Description:** The PostHog dashboard spec's "Founder-led OAuth users" cohort (WS-0-posthog-dashboard.md §7) would natively filter on `salesMotion`, but we never set it on the PostHog user via `identifyUser`. WS-0 worked around this with a provider-only cohort, but the interim loses specificity.
- **Target workstream:** WS-1 (while adding guardrail settings, call `identifyUser` with the full profile bundle).

---

## BUG-WS0-011 — Over-promised `primaryChallenge = "Expanding accounts"` home subtitle references missing feature
- **Severity:** S3
- **File:** `app/apps/web/src/app/(dashboard)/home/page.tsx:279-281`
- **Description:** When the user picks "Expanding accounts" on step 4, the home page sub-header reads "Expansion signals across your accounts" — but no expansion signals feature exists. Broken promise.
- **Target workstream:** WS-2 (either implement or rewrite the copy — `primaryChallenge` is also a deletion candidate per master brief §2.3 Category E).

---

## BUG-WS0-012 — `fullName` split at first whitespace breaks compound names
- **Severity:** S3
- **File:** `app/apps/web/src/app/api/onboarding/save/route.ts:45-48`
- **Description:** `data.fullName.trim().split(/\s+/)` sets `firstName = parts[0]`, `lastName = rest`. "Jean-Marie de la Tour" → first: "Jean-Marie", last: "de la Tour" (OK here but wrong for many European naming conventions). Mononymic cultures broken entirely.
- **Target workstream:** WS-2 (stop splitting — use `fullName` verbatim for display).

---

## What this list is NOT

- A feature backlog. Legitimate v2 redesign choices (e.g., "delete `role` and `salesMotion` questions") are described in the master brief §2.3. This file only captures **bugs** — behaviors that are wrong relative to what the current UI promises.
- A priority-ordered queue. Each entry's "Target workstream" tag is where the bug naturally belongs; the workstream owner decides the order.

## Next actions

- When each target workstream opens its Plan phase (per brief §9.2), it pulls the bugs tagged for it from this file and incorporates them into its task list.
- Close each entry by marking `status: fixed-in-WS-N` with the PR link when merged.
