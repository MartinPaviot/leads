# CLE-16 — Wire the autonomy level (real) through the unified plane + learned thresholds — Requirements

> Constitution: `_specs/chat-live-executor/README.md`. CLE-16 is the **M4** capstone: it makes the
> configured autonomy level produce *distinct, documented, enforced* behaviour, closes the
> outcome → threshold-learning loop, and turns `trustScore` from a UI hint into a server-side gate.
>
> **CLE-16 builds ON, and does NOT redefine:**
> - The `decideAction` core body, the `decide-action.ts` signature (README §3.5bis — FROZEN), the
>   `extra?: { actionKey, learnedThresholds }` optional second argument, `resolveEffectiveMode`,
>   `deriveApprovalModeFromLevel`, and the level→mode mapping — **all owned by CLE-10**
>   (`_specs/CLE-10-unified-approval-plane/design.md` §2.1, §4). CLE-16 must NOT duplicate or change them.
> - The audit/undo log `tool_call_events` + the outbound hold/cancel + `bounce`/reversal signals —
>   **owned by CLE-11** (`_specs/CLE-11-audit-undo-extension/design.md`). CLE-16 *reads* these as the
>   "was this action a good outcome?" signal; it does not change the log schema or the undo mechanism.
>
> One contract amendment is *proposed* (README §3.5bis note that `extra` may also carry an
> already-resolved `relaxThresholds`/bounds — see design §9); a spec cannot redefine a contract
> silently, so it is flagged for the M4 checkpoint, with a zero-amendment fallback documented.

---

## 1. User story

**As** a founder who has tuned Elevay's agent over weeks of approvals and outcomes,
**I want** the autonomy level I pick (Copilot / Guided / Autonomous / Strategic) to *actually* change
what the agent does for each kind of action — and I want the agent to need *less* of my confirmation on
the action classes it has repeatedly gotten right, and *more* on the ones it has gotten wrong — but
**never** to spend money or do something irreversible without me, and **never** to let me switch into a
higher level than my track record has earned,
**so that** autonomy is real and earned, not decorative, and the dial I see matches the behaviour I get.

Today (audit §1.3 / CLE-10 design §1 row D) the level is **decorative** for the action-decision axis:
`autonomyConfig.level` only feeds the campaign-engine send-policy; the chat/PAR/background decision runs
on `agentApprovalMode`. CLE-10 wired `level → mode` so the dial is load-bearing. CLE-16 finishes the
story: (a) learned per-action thresholds feed `decideAction`, (b) `trustScore` is enforced server-side as
the level gate, (c) every level yields a *documented, tested* disposition per action class with UI copy
that matches, (d) executed-action outcomes feed the learning with observability.

---

## 2. Definitions (so the EARS clauses are unambiguous)

- **Action class** — derived from action metadata exactly as `decideAction` derives it (CLE-10 §2.1):
  `read` (`!mutating && !outbound`), `reversible-mutation` (`mutating && reversible && !outbound`),
  `destructive` (`mutating && !reversible && !outbound`), `outbound` (`outbound === true`),
  `paid` (`cost === "money"`).
- **Level** — `autonomyConfig.level ∈ {copilot, guided, autonomous, strategic}` (`campaign-engine/types.ts:118`).
- **Effective mode** — `ApprovalModeV2` returned by CLE-10's `resolveEffectiveMode` for the tenant.
- **Static threshold** — `HIGH_CONFIDENCE_THRESHOLDS[action]` (`lib/guardrails/approval-mode.ts:88-98`).
- **Learned threshold** — `tenant_settings.learnedThresholds[action]`, produced by
  `recalculateThresholds` (`lib/guardrails/learned-trust.ts:53-80`) from F003 `action_outcomes`.
- **Good outcome** — for an executed action, an `action_outcomes` row that resolved with
  `positivity > 0.3` AND (per CLE-11 signal) was **not** undone/reverted/bounced. **Bad outcome** —
  resolved with low/negative positivity, OR undone/reverted, OR bounced.
- **Bound floor / ceiling** — `MIN_THRESHOLD = 0.5`, `MAX_THRESHOLD = 1.0`
  (`learned-trust.ts:18-19`). CLE-16 keeps these and adds per-class hard exclusions.
- **trustScore (the GATE one)** — `getTrustScore(tenantId).overall` ∈ [0,100], default 50,
  from `systemTrustScore` (`campaign-engine/trust-score.ts:69-98`). This is the one the autonomy route
  already uses (`autonomy/route.ts:42`) and the one CLE-10 `resolveEffectiveMode` consumes. (The
  separate 0–1 `tenant_settings.trustScore` drives nudges — `guardrails/trust-score.ts`; CLE-16 does NOT
  conflate them — see edge case EC-11 and design §4.4.)

---

## 3. EARS acceptance criteria

Format: GIVEN / WHEN / THEN. "the core" = CLE-10 `decideAction`. Each AC maps to a test in `tasks.md`.

### Learned thresholds → decideAction (scope a)

- **AC-1 (learned thresholds are loaded and passed).** GIVEN a tenant with
  `learnedThresholds = { "contact-update": 0.6 }`, WHEN a background loop evaluates a `contact-update`
  (reversible, `confirm:never`) under `auto-high-confidence` at confidence `0.65`, THEN the decision is
  `execute` (0.65 ≥ learned 0.6) and the reason cites `0.60`, proving the learned value — not the static
  `0.75` — reached the core via the `extra.learnedThresholds` path (CLE-10 §2.1 lines 195-197).

- **AC-2 (good outcomes lower the bar, within the floor).** GIVEN ≥10 resolved `contact-update`
  outcomes for a tenant of which ≥80% are good, WHEN `recalculateThresholds` runs, THEN the learned
  `contact-update` threshold is **lower** than its previous value but **never below `0.5`** (MIN_THRESHOLD).

- **AC-3 (bad outcomes raise the bar, within the ceiling).** GIVEN ≥10 resolved `contact-update`
  outcomes of which <50% are good, WHEN `recalculateThresholds` runs, THEN the learned threshold is
  **higher** than its previous value but **never above `1.0`** (MAX_THRESHOLD).

- **AC-4 (HARD RULE — money never auto-executes, regardless of learning or level).** GIVEN ANY learned
  threshold (even `0.0`), ANY level (including `strategic` with trust 100), and ANY confidence
  (including `1`), WHEN the core evaluates a `paid` action (`cost:"money"`), THEN the disposition is
  `confirm` (never `execute`, never `queue`). Learning MUST NOT be able to produce a paid auto-execute.

- **AC-5 (HARD RULE — destructive never auto-executes, regardless of learning or level).** GIVEN ANY
  learned threshold, ANY level, ANY confidence, WHEN the core evaluates a `destructive` action
  (`mutating && !reversible && !outbound`), THEN the disposition is `confirm` (never `execute`/`queue`).

- **AC-6 (HARD RULE — outbound never auto-executes, regardless of learning or level).** GIVEN ANY
  learned threshold, ANY level, ANY confidence, WHEN the core evaluates an `outbound` action, THEN the
  disposition is `confirm`. (This is CLE-10's existing posture, AC-11 there; CLE-16 re-asserts it as a
  learning-bounds invariant: the learner is forbidden from writing a learned key for an outbound/paid/
  destructive action class — design §3.3.)

- **AC-7 (learner excludes the hard-rule classes from its key set).** GIVEN `recalculateThresholds`
  observes outcomes whose `actionType` maps to an `outbound`/`paid`/`destructive` class, WHEN it writes
  `learnedThresholds`, THEN no learned key is written for those classes (so even a future code path that
  forgot AC-4..6 cannot read a lowered bar for them). `email-send`, `email-reply`, `sequence-enrollment`
  receive **no** learned key (or a sentinel ≥ ceiling).

- **AC-8 (relaxation is bounded by trust, not just learning).** GIVEN a tenant at `strategic` with trust
  ≥ 80, WHEN thresholds are resolved, THEN the relaxed (strategic) thresholds apply; GIVEN the same
  tenant drops below trust 80, WHEN thresholds are resolved, THEN strategic relaxation is withdrawn
  (CLE-10 `deriveApprovalModeFromLevel` `relaxThresholds = trustOverall >= 80`, design §4.4).

### trustScore enforcement (scope b)

- **AC-9 (trustScore is computed — confirmed, not specified-new).** The gate trustScore already exists
  (`getTrustScore`, `campaign-engine/trust-score.ts:69`). CLE-16 does NOT invent a new score; it
  enforces the existing one and documents its computation (design §4). [This AC is a documentation/
  no-regression check: `getTrustScore` is unchanged.]

- **AC-10 (strategic refused below trust 80, server-side).** GIVEN a tenant with trust `< 80`, WHEN a
  `PUT /api/settings/autonomy` requests `level:"strategic"`, THEN the route responds `403` and the level
  is **not** persisted (this already exists at `autonomy/route.ts:40-48`; CLE-16 adds a regression test
  locking it and extends it to **all** higher levels per AC-11).

- **AC-11 (every higher level is trust-gated, not just strategic).** GIVEN a tenant whose
  `getTrustScore().overall` is below the level's required floor, WHEN a `PUT` requests that level, THEN
  the route refuses with `403` and a reason naming the required floor. Floors (design §4.3):
  `copilot: 0`, `guided: 50`, `autonomous: 65`, `strategic: 80` (mirrors `suggestedLevel` thresholds at
  `trust-score.ts:110-112` so "suggested" and "allowed" never contradict).

- **AC-12 (gate is server-side, independent of the UI).** GIVEN a crafted `PUT` that bypasses the UI
  (e.g. curl) requesting a level above the trust floor, WHEN it hits the route, THEN it is refused — the
  gate is enforced in the route, not only disabled in the button (design §4.2).

- **AC-13 (a forged/stale level cannot unlock relaxed thresholds).** GIVEN an `autonomy_config.level`
  of `strategic` written before the gate (or by a direct DB edit) for a tenant now at trust `< 80`, WHEN
  the core resolves the mode, THEN `deriveApprovalModeFromLevel` independently returns
  `relaxThresholds:false` (CLE-10 §4.4 belt-and-braces) — relaxed bars require live trust ≥ 80.

### Level × action-class table (scope c)

- **AC-14 (each level yields a distinct, documented disposition per action class).** GIVEN the level
  × action-class table (design §3.1), WHEN the core is exercised for every (level, class) cell, THEN the
  observed disposition equals the table cell, for all four levels and all five classes. The table is
  normative and every cell is a test.

- **AC-15 (the four levels are behaviourally distinct).** GIVEN `copilot`, `guided`, `autonomous`,
  `strategic`, WHEN compared on the `reversible-mutation (confirm:never)` class at a fixed confidence,
  THEN at least the auto-running levels (`autonomous`/`strategic`) differ from the carding levels
  (`copilot`/`guided`) in disposition, and `strategic` differs from `autonomous` in the *threshold*
  applied (relaxed vs static) for a trust-≥80 tenant — i.e. no two adjacent levels are identical across
  the whole table.

- **AC-16 (UI copy matches actual behaviour).** GIVEN the autonomy settings page level descriptions
  (`settings/autonomy/page.tsx:23-28`), WHEN compared to the table (design §3.1), THEN each level's copy
  accurately describes its real dispositions (no "auto-send cold emails after 2h" unless the table makes
  cold email auto-send under that level — it does not; outbound always confirms, AC-6). A test asserts
  the shipped copy strings match a single SSOT description map derived from the table (design §3.4).

- **AC-17 (copy SSOT is the source for both UI and tests).** GIVEN one exported
  `LEVEL_BEHAVIOR` description map (design §3.4), WHEN the UI renders and the test asserts, THEN both
  read the same map — the copy cannot drift from the documented behaviour without failing the test.

### Outcome → learning loop + observability (scope d)

- **AC-18 (executed-action outcomes feed threshold learning).** GIVEN an action `decideAction` returned
  `execute` for, WHEN it runs and an `action_outcomes` row is created/resolved for it (F003 path), THEN
  the next `recalculateThresholds` run reflects that outcome in the learned threshold for its class
  (positively if good, negatively if bad) — the loop is closed end to end.

- **AC-19 (CLE-11 reversal/bounce is a bad-outcome signal).** GIVEN an executed action that CLE-11's
  `tool_call_events` records as `reverted` (undo), or an outbound that bounced/was canceled, WHEN
  outcomes are computed, THEN that action counts as a **bad** outcome for its class (so undoing the
  agent's work teaches it to ask more — design §5.2). [Composes with CLE-11; does not change its log.]

- **AC-20 (the learning loop is observable).** GIVEN a threshold recalculation, WHEN it changes a
  tenant's learned threshold, THEN the change is observable: (i) a structured log line
  `{ tenantId, actionType, oldThreshold, newThreshold, sampleSize, goodRate }`, and (ii) the per-action
  current vs static threshold is exposed via a read endpoint/field the autonomy settings page can render
  (design §5.3) so the user can see *why* the agent is asking more or less.

- **AC-21 (cold start is safe).** GIVEN a tenant with `< 10` resolved outcomes for a class (or none),
  WHEN thresholds are resolved, THEN the **static** `HIGH_CONFIDENCE_THRESHOLDS` value is used for that
  class (no adjustment from a tiny sample) — `MIN_OUTCOMES_FOR_ADJUSTMENT = 10` (`learned-trust.ts:20`).

### Fail-safe / regression (cross-cutting)

- **AC-22 (fail-safe: low trust ⇒ more confirmation, never less).** GIVEN any failure to load trust,
  learned thresholds, or the autonomy row, WHEN the core resolves a decision, THEN it defaults toward
  **more** control (static thresholds, no relaxation, mode falls back to `readApprovalMode` /
  `review-each`), never toward a silent execute (CLE-10 §9 fail-safe doctrine, preserved).

- **AC-23 (decideAction signature unchanged).** GIVEN CLE-16's changes, WHEN `decide-action.ts` is
  diffed, THEN its exported `decideAction` **signature** (the §3.5bis first argument + the CLE-10
  optional `extra`) is byte-unchanged; CLE-16 only *supplies* `extra.learnedThresholds` from new caller
  wiring and (if the amendment is accepted) reads an additional optional field on `extra` — it does not
  change the frozen first-argument shape (design §9). A `satisfies` compile check + a `git diff` guard.

- **AC-24 (CLE-11 and capture-approvals untouched).** GIVEN CLE-16's changes, WHEN `tool_call_events`
  schema, `lib/chat/tool-call-log.ts`, the undo mechanism, and `lib/capture/approval.ts` are diffed,
  THEN they are unmodified (CLE-16 reads CLE-11's signals via a query; it does not edit CLE-11/the
  capture plane). `regression.sh` grep/`git diff --stat`.

---

## 4. Edge cases

- **EC-1 (cold start, no outcomes).** Tenant with zero `action_outcomes` → `learnedThresholds` empty →
  `computeEffectiveThresholds` returns the static map (`learned-trust.ts:40`) → core uses static bars.
  No NaN, no division by zero (guarded by `MIN_OUTCOMES_FOR_ADJUSTMENT`). (AC-21.)

- **EC-2 (oscillation / hysteresis).** A class hovering around the 0.5/0.8 good-rate boundaries could
  flip the threshold ±0.05 every week. CLE-16 keeps the ±0.05 step small and adds a **dead-band**: no
  adjustment when `0.5 ≤ goodRate < 0.8` (the current code already only moves outside this band —
  `learned-trust.ts:65-67`); CLE-16 documents and tests the dead-band so a borderline class stays put
  rather than oscillating (design §3.2).

- **EC-3 (gaming the learner).** A user who reflexively approves everything would push good-rate up and
  lower bars. Mitigations: (i) the hard rules (AC-4..6) cap the blast radius to reversible non-outbound
  non-paid work; (ii) the floor `0.5` means even a "perfect" class still needs ≥0.5 confidence;
  (iii) CLE-11 reversal/bounce is a *bad* signal (AC-19) so approving-then-undoing nets negative;
  (iv) trust decay (`guardrails/trust-score.ts` decay) and `MIN_OUTCOMES_FOR_ADJUSTMENT` slow swings.
  Documented as defense-in-depth, not a single silver bullet (design §8).

- **EC-4 (trust decay).** The gate trustScore (`systemTrustScore`) has no time-decay today; the nudge
  trustScore (`tenant_settings.trustScore`) does (`applyTrustDecay`, `guardrails/trust-score.ts:204`).
  CLE-16 does NOT add decay to the gate score (out of scope — would change `getTrustScore` semantics),
  but documents the asymmetry and ensures the **strategic relaxation** re-checks live trust on every
  resolve (AC-13) so a tenant who stops earning trust loses relaxation as soon as `overall` drops,
  regardless of decay policy (design §4.4).

- **EC-5 (learned-vs-static conflict).** If a learned value exists for a class, it overrides the static
  one (`getEffectiveThreshold`, `learned-trust.ts:43-51`); CLE-16 keeps that precedence but clamps the
  learned value into `[floor, ceiling]` at *read* time too (not only at write) so a hand-edited or
  legacy out-of-range learned value can never widen autonomy beyond the bounds (design §3.3, AC-2/AC-3).

- **EC-6 (level downgrade).** Downgrading (e.g. strategic→copilot) must *immediately* tighten behaviour:
  CLE-10's write-side sync rewrites the cached `agentApprovalMode` and `resolveEffectiveMode` prefers the
  row, so the next decision uses the tighter mode (CLE-10 §4.3). CLE-16 adds a test that a downgrade
  flips a previously-`execute` reversible decision to `confirm` (design §4.2). Downgrade is **never**
  trust-gated (lowering autonomy is always allowed).

- **EC-7 (the two trust scores).** `getTrustScore().overall` (0–100, gate) vs
  `tenant_settings.trustScore` (0–1, nudge). CLE-16 uses **only** the 0–100 gate score for the level
  gate and the strategic relaxation (consistent with the route and CLE-10). It does not read or write
  the 0–1 score. The asymmetry is flagged as a contract tension (design §4.4 / §10) with a recommended
  consolidation, deferred (out of scope to merge them).

- **EC-8 (learned key for a class that later becomes hard-ruled).** If a learned key was written for a
  class before CLE-16's exclusion (legacy data, e.g. an old `email-send` learned key), the read path
  (EC-5 clamp + AC-6 hard rule in the core) makes it inert: the core refuses to auto-execute
  outbound/paid/destructive regardless of any threshold (design §3.3). A one-shot cleanup prunes stale
  excluded keys (tasks).

- **EC-9 (missing confidence under an auto level).** No confidence signal → core treats it as `0` →
  below any threshold ≥ floor → `confirm` (CLE-10 §2.1 `?? 0`). Autonomy never executes a no-confidence
  action.

- **EC-10 (recalc concurrency / partial failure).** The weekly recalc iterates tenants in isolated
  `step.run`s (`trust-recalculator.ts:25-31`); one tenant's failure does not block others. CLE-16
  preserves this and makes the per-tenant write idempotent (re-running yields the same clamped values).

- **EC-11 (relax flag plumbing).** CLE-10 returns `relaxThresholds` from `resolveEffectiveMode` but the
  core's `extra.learnedThresholds` is a *map*, not a flag. CLE-16 resolves this composition: when
  `relaxThresholds` is true, the caller passes the **strategic (relaxed) threshold map** as
  `extra.learnedThresholds`; when false, the static-or-learned map. The flag never reaches the core as a
  flag (keeps the signature) — it selects *which map* the caller injects (design §9, AC-8).

---

## 5. Out of scope (owned elsewhere)

- **The `decideAction` core body + the level→mode mapping + `resolveEffectiveMode` +
  `deriveApprovalModeFromLevel`** — CLE-10. CLE-16 consumes them unchanged.
- **The `tool_call_events` audit log, the undo mechanism, the outbound hold/cancel + bounce signal** —
  CLE-11. CLE-16 reads them as outcome signal; it does not modify the log or undo.
- **The F003 outcome-detection pipeline itself** (`inngest/outcome-detector.ts`, `lib/outcomes/resolve.ts`,
  the `action_outcomes` table) — pre-existing. CLE-16 *consumes* its resolved rows and *extends the
  signal* with CLE-11 reversal/bounce; it does not rebuild outcome detection.
- **capture-approvals (ingestion/data-trust)** — separate plane (CLE-10 §8). Untouched.
- **The permission matrix (role × action)** — CLE-12. CLE-16 keeps CLE-10's viewer floor only.
- **Send-policy axis (campaign-engine `PermissionsMap`/`execution-gate.ts`)** — the campaign engine's
  own downstream policy (CLE-10 §4.4). CLE-16 does not unify it; it only governs the approval/disposition
  axis.
- **Merging the two trust scores** — flagged (EC-7), deferred.
- **Adding time-decay to the gate trustScore** — flagged (EC-4), deferred.

---

## 6. Evaluation steps (Phase 6 — hostile QA on the live app)

1. **Hard-rule learning bound (money/destructive/outbound).** Unit + live: set a learned threshold to
   `0.0` for a paid/destructive/outbound class (or force one), pick `strategic` (trust 100), confidence
   `1` → assert the decision is `confirm`, never `execute`. (AC-4/AC-5/AC-6.) Confirm the learner never
   wrote a key for those classes (AC-7).
2. **Good → lower, bad → higher, bounded.** Seed ≥10 good `contact-update` outcomes → learned threshold
   drops but stays ≥0.5; seed ≥10 bad → rises but stays ≤1.0. (AC-2/AC-3.) Cold start (<10) → static
   value, no NaN (AC-21/EC-1).
3. **Learned value reaches the core.** With `learnedThresholds={contact-update:0.6}` and confidence
   0.65 under an auto level → `execute` with reason citing `0.60` (AC-1). Remove the learned key →
   confidence 0.65 < static 0.75 → `confirm` (EC-5).
4. **trustScore gate (server-side).** `PUT /api/settings/autonomy {level:"strategic"}` for a trust-79
   tenant → `403`, level unchanged; raise trust to 80 → `PUT` succeeds (AC-10). Repeat for
   `autonomous` at trust 64 vs 65 (AC-11). Bypass the UI with curl → still `403` (AC-12). Forge a DB
   `strategic` level for a trust-50 tenant → `resolveEffectiveMode` yields `relaxThresholds:false`
   (AC-13).
5. **Level × class table.** Drive every (level, class) cell through `decideAction` and assert it equals
   the design §3.1 table (AC-14); assert adjacent levels differ somewhere (AC-15).
6. **UI copy matches.** Diff the four shipped level descriptions against the `LEVEL_BEHAVIOR` SSOT;
   assert no claim contradicts the table (AC-16/AC-17). Open `/settings/autonomy` in Playwright and read
   the rendered copy back.
7. **Loop closes with observability.** Run the recalc; assert the structured log line and the
   per-action current-vs-static field on the autonomy GET (AC-18/AC-20). Simulate a CLE-11 reversal on
   an executed action → assert it lands as a bad outcome (AC-19).
8. **Downgrade tightens immediately.** Strategic→copilot → a previously-`execute` reversible decision
   becomes `confirm` on the next call (EC-6).
9. **Fail-safe.** Force `getTrustScore`/`computeEffectiveThresholds` to throw → decisions fall back to
   static bars + `review-each`, never a silent execute (AC-22).
10. **No regression.** `decide-action.ts` signature byte-unchanged (AC-23); `tool_call_events`/undo/
    `capture/approval.ts` unmodified (AC-24); `regression.sh` green; `tsc --noEmit` 0 errors.
