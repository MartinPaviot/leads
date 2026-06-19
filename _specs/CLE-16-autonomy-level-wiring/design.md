# CLE-16 — Autonomy level wiring + learned thresholds + trust gate — Design

> Constitution `_specs/chat-live-executor/README.md` (§1 "un seul plan de contrôle"; §3.5bis frozen
> `decideAction`; CLE-16 row "Câbler réellement le niveau d'autonomie … + seuils appris").
> **Builds ON CLE-10** (`_specs/CLE-10-unified-approval-plane/design.md`): the `decideAction` body, the
> `extra?: { actionKey, learnedThresholds }` second argument (CLE-10 §2.1 lines 97-113, 193-208),
> `deriveApprovalModeFromLevel` (CLE-10 §4.2), `resolveEffectiveMode` (CLE-10 §4.3), the level→mode
> mapping and the trust-≥80 strategic gate (CLE-10 §4.4). **CLE-16 does NOT redefine any of them.**
> **Builds ON CLE-11** (`_specs/CLE-11-audit-undo-extension/design.md`): reads `tool_call_events`
> `status:"reverted"` + the outbound `canceled`/bounce signals as a *bad outcome* input.
> No frozen contract is redefined; one optional, additive note to README §3.5bis is *proposed* (§9, §10).

---

## 1. System fit (file:line) — what exists, what CLE-16 wires

CLE-16 is mostly **wiring + bounding + enforcing** existing parts. The parts already in the tree:

| Piece | Where (file:line) | State today | CLE-16 |
|---|---|---|---|
| The decision core | `lib/guardrails/decide-action.ts` (created by CLE-04 stub / CLE-10 body) | reads `extra.learnedThresholds` at `auto-high-confidence` (CLE-10 §2.1:195-197); has the **paid floor** (confirm), **destructive→confirm**, **outbound→confirm** arms (CLE-10 §2.1:142-188) | **No body change.** Verify the three hard-rule arms exist; CLE-16's invariant tests lock them. Supply `extra.learnedThresholds` from new caller wiring (§9). |
| Static thresholds | `lib/guardrails/approval-mode.ts:88-98` `HIGH_CONFIDENCE_THRESHOLDS` | per-`GuardedAction`; `sequence-enrollment:1.1` ("never auto") | Source of the floor map; CLE-16 adds the **strategic relaxed map** + the **hard-exclusion set** next to it (§3.3). |
| Learned thresholds (F005) | `lib/guardrails/learned-trust.ts` | `recalculateThresholds` (`:53-80`) reads F003 `action_outcomes`, ±0.05 with dead-band (`:64-68`), clamps `[0.5,1.0]` (`:70`), writes `tenant_settings.learnedThresholds` (`:74-77`); `computeEffectiveThresholds` (`:30-41`) merges static+learned; `getEffectiveThreshold` (`:43-51`) | **Extend, not replace:** add the hard-class exclusion to the write (AC-7), the clamp+exclusion to the read (EC-5/EC-8), the CLE-11 bad-outcome signal (§5.2), and observability (§5.3). |
| Learned storage field | `lib/config/tenant-settings.ts` — read via untyped cast `(settings as Record<string, unknown>).learnedThresholds` (`learned-trust.ts:34`); `trustScore` typed at `:261`, `trustStatsUpdatedAt` written `:76` | `learnedThresholds` is **not a declared field** on `TenantSettings` | Add a typed `learnedThresholds?: Record<string, number>` + `trustStatsUpdatedAt?: string` to `TenantSettings` so the cast disappears and `tsc` checks it (§3.5). No DB migration (settings is a jsonb config object). |
| Recalc cron | `inngest/trust-recalculator.ts:13-35` | weekly Mon 04:00 UTC, per-tenant isolated `step.run` | Keep cadence; thread the new bad-outcome signal + observability; add an **on-resolve** lighter trigger is OUT (weekly is enough; §5.1). |
| Outcome detection (F003) | `inngest/outcome-detector.ts` (`*/15`), `lib/outcomes/resolve.ts`, `action_outcomes` (`db/schema/agent.ts:397-431`) | resolves watching outcomes → `positivity` | **Consumed unchanged**; CLE-16 adds a query that also counts CLE-11 reversals/bounces as bad (§5.2). |
| Gate trustScore | `lib/campaign-engine/trust-score.ts:69-98` `getTrustScore→overall` 0–100 (default 50), `suggestedLevel` (`:110-112`), from `systemTrustScore` | already used by the route gate (`autonomy/route.ts:42`) and CLE-10 `resolveEffectiveMode` | **The gate.** CLE-16 extends the route gate from strategic-only to **all** levels (§4.3). No change to `getTrustScore`. |
| Level↔mode + strategic relax | `lib/guardrails/approval-mode.ts` (CLE-10 adds `deriveApprovalModeFromLevel`, `resolveEffectiveMode`) | CLE-10 §4.2-4.3 | **Consumed.** CLE-16 uses `relaxThresholds` to pick which map it injects (§9). |
| Autonomy route | `app/api/settings/autonomy/route.ts:30-91` | PUT validates strategic≥80 (`:40-48`), persists level; CLE-10 adds the derived-mode write-side sync | **Generalize the gate** to all levels (§4.3) + return per-action threshold state for observability (§5.3). |
| Autonomy UI | `app/(dashboard)/(rest)/settings/autonomy/page.tsx:23-28` `LEVELS[]` copy | copy describes behaviour that does NOT match the core (e.g. "Auto-send cold emails after 2h" — outbound always confirms) | **Replace copy with the SSOT `LEVEL_BEHAVIOR` map** derived from the table (§3.4); render current-vs-static thresholds. |

**CLE-16 touches:** `learned-trust.ts` (bounds/exclusion/read-clamp/signal/observability), a new
`lib/guardrails/level-behavior.ts` (the table + SSOT copy + the relaxed map + the hard-exclusion set),
`tenant-settings.ts` (typed fields), `autonomy/route.ts` (generalized gate + observability field),
`autonomy/page.tsx` (copy from SSOT + threshold display), the two background callers'
threshold-injection (`agent-reactor.ts`, `autonomous-pipeline.ts` — pass `extra.learnedThresholds`), and
`trust-recalculator.ts` (signal + logging). It does **NOT** touch `decide-action.ts` body,
`tool_call_events`/`tool-call-log.ts`, the undo mechanism, `capture/approval.ts`, or
`getTrustScore`/`systemTrustScore`.

---

## 2. The composition principle (read this first)

CLE-16 adds **zero new decision logic to the core**. Everything routes through three seams CLE-10 already
built:

1. **`resolveEffectiveMode(...)` → `{ mode, relaxThresholds }`** (CLE-10 §4.3). CLE-16 calls it; it does
   not change it.
2. **`decideAction(input, extra?)`** where `extra.learnedThresholds` is an optional map (CLE-10 §2.1).
   CLE-16 *supplies* that map; it does not change the body. The core's existing line
   `(key && extra?.learnedThresholds?.[key]) ?? HIGH_CONFIDENCE_THRESHOLDS[key]` (CLE-10 §2.1:195-197)
   is the single place the learned value takes effect.
3. **The three hard-rule arms already in the core** (paid→confirm, destructive→confirm, outbound→confirm
   — CLE-10 §2.1:142-188) are *above* the threshold gate, so **no threshold (learned or static, however
   low) can ever produce an auto-execute for those classes.** CLE-16's job for the HARD RULE is therefore
   (a) verify those arms exist and lock them with invariant tests, and (b) make sure the *learner* never
   even writes a low key for those classes (defense-in-depth — §3.3), so the property holds even if a
   future refactor reorders the core.

This is why CLE-16 is completeness-7, not a rewrite: the safety is structural in CLE-10; CLE-16 makes the
learning real, bounded, trust-gated, distinct-per-level, and observable.

---

## 3. Learned thresholds — the bounded update rule + hard exclusion + the level table

### 3.1 The level × action-class disposition table (NORMATIVE — AC-14)

Resolved through CLE-10's mapping: `level → (mode, relaxThresholds)` then `decideAction`. "thr(static)"
= confidence ≥ `HIGH_CONFIDENCE_THRESHOLDS[action]`; "thr(relaxed)" = ≥ the relaxed map value (§3.3);
"thr(learned)" = ≥ the tenant's learned value when present (clamped). Cells are the disposition the core
returns.

| Level (→ mode, relax) | read | reversible-mutation `confirm:never` | reversible-mutation `confirm:risky/always` | destructive | outbound | paid |
|---|---|---|---|---|---|---|
| **copilot** (→ review-each, relax=false) | execute | confirm | confirm | confirm | confirm | confirm |
| **guided** (→ review-each, relax=false) | execute | confirm | confirm | confirm | confirm | confirm |
| **autonomous** (→ auto-high-confidence, relax=false) | execute | **execute if thr(learned\|static), else confirm** | confirm | **confirm** | **confirm** | **confirm** |
| **strategic, trust≥80** (→ auto-high-confidence, relax=true) | execute | **execute if thr(relaxed), else confirm** | confirm | **confirm** | **confirm** | **confirm** |
| **strategic, trust<80** (→ auto-high-confidence, relax=false) | execute | execute if thr(static), else confirm | confirm | confirm | confirm | confirm |

Reading it:
- **copilot vs guided** are identical on this axis *by design* (CLE-10 §4.2: `guided → review-each`,
  conservative; the difference between them lives in the campaign-engine send-policy `PermissionsMap`
  — `autonomy-defaults.ts:15-25` — which is the *other* axis, out of scope). So AC-15's "distinctness"
  is satisfied by autonomous≠copilot and strategic≠autonomous (the threshold differs), NOT by
  copilot≠guided on the disposition axis. **This is the one product-intent line a reviewer should
  confirm** (see §10 tension 3): if Martin wants `guided` to auto-run reversible work after a delay, that
  is a one-line change to `deriveApprovalModeFromLevel` (CLE-10) — deferred, flagged.
- The three hard-rule columns (`destructive`, `outbound`, `paid`) are `confirm` for **every** level —
  this is the HARD RULE made visible: autonomy never auto-fires them.
- Only the `reversible-mutation confirm:never` column ever shows `execute`, and only under
  autonomous/strategic, and only above the threshold — which is exactly the column the learner is allowed
  to move (§3.3).

### 3.2 The bounded update rule (extends `recalculateThresholds`, `learned-trust.ts:53-80`)

Per class `c` with `n` resolved outcomes and good-rate `g = good(c)/n`:

```
base(c)   = HIGH_CONFIDENCE_THRESHOLDS[c]            // static floor map
if c ∈ HARD_EXCLUDED_CLASSES:  skip — write NO learned key            // AC-7 (§3.3)
if n < MIN_OUTCOMES_FOR_ADJUSTMENT (10):  skip — keep static          // AC-21 / EC-1 cold start
prev(c)   = current learned(c) ?? base(c)
delta     =  -STEP  if g >= 0.80            // good outcomes LOWER the bar      AC-2
             +STEP  if g <  0.50            // bad  outcomes RAISE the bar      AC-3
              0     if 0.50 <= g < 0.80     // DEAD-BAND: no move (anti-oscillation)  EC-2
next(c)   = clamp(prev(c) + delta, FLOOR=0.5, CEILING=1.0)            // AC-2/AC-3 bounds
```

`STEP = 0.05`, `FLOOR = MIN_THRESHOLD = 0.5`, `CEILING = MAX_THRESHOLD = 1.0` (existing constants,
`learned-trust.ts:18-20`). Two changes vs today: (i) the **hard-exclusion skip** (today the loop would
happily write an `email-send` learned key from `action_outcomes` rows whose `actionType` is `email-send`)
— CLE-16 filters those out; (ii) the delta is computed from `prev(c)` (the current learned value) rather
than always from `base(c)`, so learning is **incremental and converges** instead of being a single-step
function of the latest window (this also gives the bound real meaning over time). Re-running on the same
window is idempotent at the boundary (clamped). Observability is added (§5.3).

> Why incremental-from-prev and not re-from-base: the existing code recomputes from `base` every week
> (`learned-trust.ts:62`), so a class can only ever be `base ± 0.05` — the bound is never actually
> exercised and "weeks of good outcomes" never compound. CLE-16 accumulates from `prev` so sustained
> good outcomes walk the threshold down toward (but never past) the 0.5 floor, and a bad streak walks it
> back up toward the 1.0 ceiling. This is the change that makes "learned" mean something while keeping
> the bounds load-bearing.

### 3.3 The hard exclusion + read-time clamp (the HARD RULE, defense-in-depth)

```ts
// lib/guardrails/level-behavior.ts (NEW)
import { HIGH_CONFIDENCE_THRESHOLDS, type GuardedAction } from "@/lib/guardrails/approval-mode";

/** Classes the learner may NEVER lower the bar for. These map to action classes
 *  the core ALREADY refuses to auto-execute (paid / destructive / outbound) — CLE-10
 *  §2.1. Excluding them from learning is belt-and-braces: even if a future core
 *  refactor reordered the arms, no LOW learned key exists to be read. (AC-4..7) */
export const HARD_EXCLUDED_ACTIONS: ReadonlySet<GuardedAction> = new Set([
  "email-send",          // outbound
  "email-reply",         // outbound
  "sequence-enrollment", // outbound + irreversible (static 1.1 = never-auto already)
]);
// NB: "deal-stage-change" is reversible (CLE-10 metadata) → it MAY learn (it is the
// only confirm:"risky" reversible; the core cards risky anyway, so learning only
// affects it if a page action declares it confirm:"never"). Destructive/paid PAR
// actions never have a GuardedAction key, so they are unreachable by the learner.

/** Relaxed thresholds for strategic (trust>=80). Lower than static, but FLOOR-bounded.
 *  Only the non-excluded reversible classes appear; excluded classes are absent so
 *  even strategic cannot relax an outbound/paid bar. (AC-8) */
export const STRATEGIC_RELAXED_THRESHOLDS: Partial<Record<GuardedAction, number>> = {
  "contact-create": 0.6,
  "contact-update": 0.6,
  "task-create":    0.55,
  "deal-stage-change": 0.8, // still high; risky-class, cards anyway
};

const FLOOR = 0.5, CEILING = 1.0;
export function clampThreshold(v: number): number {
  if (!Number.isFinite(v)) return CEILING;            // fail-safe: bad value → hardest bar (AC-22)
  return Math.max(FLOOR, Math.min(CEILING, v));
}

/** The map CLE-16 INJECTS into decideAction's `extra.learnedThresholds`, per resolve.
 *  - excluded classes are forced to CEILING (so the core, even if it read them, would
 *    require confidence>=1.0 — and it won't, because outbound/paid/destructive short-
 *    circuit to confirm above the threshold gate). (AC-6/EC-8)
 *  - non-excluded classes: relaxed (if strategic+trust) else learned (clamped) else static. */
export function buildEffectiveThresholdMap(args: {
  learned?: Record<string, number>;       // tenant_settings.learnedThresholds
  relaxThresholds: boolean;               // from resolveEffectiveMode (CLE-10)
}): Record<GuardedAction, number> {
  const out = {} as Record<GuardedAction, number>;
  for (const action of Object.keys(HIGH_CONFIDENCE_THRESHOLDS) as GuardedAction[]) {
    if (HARD_EXCLUDED_ACTIONS.has(action)) { out[action] = CEILING; continue; }   // AC-6/AC-7
    const relaxed = args.relaxThresholds ? STRATEGIC_RELAXED_THRESHOLDS[action] : undefined;
    const learned = args.learned?.[action];
    const chosen = relaxed ?? learned ?? HIGH_CONFIDENCE_THRESHOLDS[action];
    out[action] = clampThreshold(chosen);                                          // EC-5 read-clamp
  }
  return out;
}
```

This is the crux of the HARD RULE. Three independent guarantees, any one of which is sufficient:
1. The core refuses paid/destructive/outbound *above* the threshold gate (CLE-10 §2.1) — primary.
2. The learner writes **no** low key for excluded classes (`recalculateThresholds` skip — §3.2/AC-7).
3. `buildEffectiveThresholdMap` forces excluded classes to the **ceiling** in the injected map, so even
   a stale/forged learned key (EC-8) or a future core reordering cannot read a low bar for them.

### 3.4 The SSOT copy map (AC-16/AC-17)

```ts
// lib/guardrails/level-behavior.ts (continued)
import type { AutonomyLevel } from "@/lib/campaign-engine/types";

/** ONE source of truth for what each level DOES, derived from the §3.1 table.
 *  The UI renders these strings; the copy-match test asserts the shipped UI uses
 *  THIS map — so marketing copy can never drift from real behaviour. (AC-16/AC-17) */
export const LEVEL_BEHAVIOR: Record<AutonomyLevel, { label: string; behavior: string }> = {
  copilot:    { label: "Copilot",    behavior: "I approve everything before it happens." },
  guided:     { label: "Guided",     behavior: "Same as Copilot for actions — every change and every send waits for your approval. (Send timing/policy is set under Guardrails.)" },
  autonomous: { label: "Autonomous", behavior: "Auto-runs safe, reversible changes it is confident about (e.g. updating a contact, creating a task). Always asks before sending email, anything irreversible, or anything that costs money." },
  strategic:  { label: "Strategic",  behavior: "Like Autonomous, but more willing to act on reversible changes once your trust score is 80+. Still always asks before sends, irreversible changes, or spending." },
};
```

The previous copy ("Auto-send cold emails after 2h", "Handle everything") is **false** against the
table (outbound always confirms) — CLE-16 replaces it. The page maps `LEVELS` → `LEVEL_BEHAVIOR`
(keeping the icons), and the test asserts string-equality between the rendered descriptions and
`LEVEL_BEHAVIOR[level].behavior`.

### 3.5 Typed settings field

`TenantSettings` gains `learnedThresholds?: Record<string, number>` and `trustStatsUpdatedAt?: string`
(`tenant-settings.ts`, near the `trustScore` field at `:261`). This deletes the untyped cast at
`learned-trust.ts:34` and lets `tsc` verify reads/writes. No DB migration (the settings object is
jsonb-backed config; follow how `trustScore` is stored — confirm in tasks T2).

---

## 4. trustScore — computation (confirmed) + server-side enforcement

### 4.1 It already exists (AC-9)

The gate trustScore is **computed today** by `getTrustScore(tenantId)` (`campaign-engine/trust-score.ts:69-98`):
- Backed by `systemTrustScore` (one row per tenant), `overall ∈ [0,100]`, default `50`.
- Moved by discrete events with deltas (`EVENT_DELTAS`, `:6-17`): `meeting_booked +10`,
  `email_positive_reply +5`, `approved_without_edit +2`, … `wrong_person -10`, `factual_error -5`,
  `rejected -3` — clamped `[0,100]` (`:46`).
- `suggestedLevel` (`:110-112`): `≥80 → autonomous`, `≥65 → guided`, else `copilot`; `readyForUpgrade`
  needs `≥80 && actionsCount≥10`; `shouldDowngrade` `<40 && actionsCount≥10`.
- It is the score the autonomy route already gates strategic on (`autonomy/route.ts:40-48`) and the one
  CLE-10 `resolveEffectiveMode` consumes for `relaxThresholds`.

**So CLE-16 does not specify a new score — it confirms and enforces the existing one.** (The separate
0–1 `tenant_settings.trustScore` from `guardrails/trust-score.ts` drives *nudges*, not the gate — EC-7,
§4.4.)

### 4.2 Enforcement point (server-side, not a UI hint) — AC-10/AC-12

The gate lives in **`PUT /api/settings/autonomy`** (`autonomy/route.ts`), the single server write path
for the level. Today it only blocks `strategic` (`:40-48`). CLE-16 generalizes it:

```ts
// autonomy/route.ts — replace the strategic-only block (:40-48)
import { requiredTrustForLevel } from "@/lib/guardrails/level-behavior";
// ...
if (level && level !== existing?.level) {
  const floor = requiredTrustForLevel(level as AutonomyLevel);     // §4.3
  if (floor > 0) {
    const trust = await getTrustScore(authCtx.tenantId);
    if (trust.overall < floor) {
      return Response.json(
        { error: `Trust score must be >= ${floor} to enable ${level} mode`, currentScore: trust.overall, requiredScore: floor },
        { status: 403 },
      );
    }
  }
}
```

Because the gate is in the route (the only server mutation of `level`), a UI that wrongly enables the
button, or a direct `curl`, is still refused (AC-12). The button SHOULD also be disabled client-side
(progressive disclosure), but that is cosmetic; the route is authoritative.

> **Downgrades are never gated** (the `floor>0` check only refuses *raising* above an unearned floor;
> moving to a level whose floor ≤ current trust, including any downgrade, passes). EC-6.

### 4.3 The floor map (AC-11) — consistent with `suggestedLevel`

```ts
// lib/guardrails/level-behavior.ts (continued)
const TRUST_FLOOR: Record<AutonomyLevel, number> = {
  copilot: 0, guided: 50, autonomous: 65, strategic: 80,
};
export function requiredTrustForLevel(level: AutonomyLevel): number {
  return TRUST_FLOOR[level] ?? 0;
}
```

`guided:50 / autonomous:65 / strategic:80` deliberately mirror `suggestedLevel`'s thresholds
(`trust-score.ts:110-112`: 65→guided, 80→autonomous) and the route's existing strategic-80, so
"suggested" and "allowed" can never contradict (a level the engine suggests is always a level the gate
permits). `strategic:80` matches the pre-existing rule (`autonomy/route.ts:42`) verbatim — no behaviour
change for strategic, only the addition of floors for guided/autonomous.

### 4.4 The two-trust-scores tension + how the relaxation re-checks live trust

- **The gate score** (`systemTrustScore.overall`, 0–100) is used for: the level gate (§4.2) and the
  strategic `relaxThresholds` (CLE-10 §4.4: `deriveApprovalModeFromLevel(level, trustOverall)` relaxes
  only at `>=80`). Both read it live, so a tenant who slips below 80 loses both the ability to *re-enter*
  strategic and the relaxed bars *while in* strategic (AC-13/EC-4): `resolveEffectiveMode` recomputes
  `relaxThresholds` from current `getTrustScore` on every decision, so a stale `strategic` level with
  trust now <80 yields `relaxThresholds:false` → `buildEffectiveThresholdMap` falls back to static.
- **The nudge score** (`tenant_settings.trustScore`, 0–1, with decay + nudges) is used only by
  `guardrails/trust-score.ts` to *offer* mode upgrades. CLE-16 does not read or write it for any gate.
- **Tension (flag at checkpoint, §10):** two scores on two scales is confusing. Recommended future
  consolidation: make the nudge layer read `getTrustScore().overall/100`, or vice-versa. **Deferred**
  (merging them risks regressing the nudge UX and the route gate at once). CLE-16 documents the boundary
  with a comment at both call sites.

---

## 5. The outcome → learning loop + observability (scope d)

### 5.1 The loop (end to end)

```
decideAction = execute  ──▶  action runs (chat write / PAR / background)
        │
        ├─ F003: an action_outcomes row is created/resolved (existing outcome-detector */15)   AC-18
        │        positivity > 0.3 ⇒ good ; else bad
        ├─ CLE-11: if the action was reverted/canceled/bounced (tool_call_events.status="reverted",
        │          outbound_emails.status="canceled" or a bounce) ⇒ counted BAD                AC-19
        ▼
  weekly recalc (trust-recalculator.ts, Mon 04:00)  ──▶  recalculateThresholds(tenant)         §3.2
        │   per non-excluded class: good-rate ⇒ ±0.05 from prev, clamped [0.5,1.0]
        ▼
  tenant_settings.learnedThresholds  +  structured log line                                     AC-20
        │
        ▼
  next decision: caller loads learnedThresholds → buildEffectiveThresholdMap → extra.learnedThresholds
        → decideAction reads the (clamped, exclusion-safe) bar                                   AC-1
```

Cadence stays weekly (the existing cron) — outcomes accrue over a 7-day observation window
(`action_outcomes.observationWindowHours` default 168, `agent.ts:409`), so a weekly recalc is the natural
beat; an on-every-resolve recalc would be noisy and is out of scope.

### 5.2 Folding CLE-11 reversal/bounce into the good/bad signal (AC-19)

Today `recalculateThresholds`'s good-count is purely `positivity > 0.3` (`learned-trust.ts:87`). CLE-16
extends `getOutcomeStats` to subtract a **bad-outcome** signal sourced from CLE-11's audit + the outbound
lifecycle, **by reading, not modifying, those tables**:

```ts
// learned-trust.ts getOutcomeStats — additional bad signal (read-only joins)
//   reverted PAR/chat actions:   tool_call_events WHERE status='reverted'   (CLE-11)
//   canceled/bounced outbound:   outbound_emails  WHERE status IN ('canceled','bounced')
// Map each to its actionType/class; count as a BAD outcome (decrements good-rate).
```

This makes "the user undid what the agent did" teach the agent to ask more for that class — the whole
point of closing the loop with CLE-11. The join is read-only (AC-24): CLE-16 never writes
`tool_call_events`. Outcomes whose class is hard-excluded are still computed (for observability) but
produce no learned key (§3.2).

> Composition note: an action that was both resolved good in F003 *and* later reverted in CLE-11 nets to
> bad (reversal dominates) — the user's explicit undo is a stronger signal than an automated positivity
> heuristic. Documented; tested.

### 5.3 Observability (AC-20)

1. **Structured log** in `recalculateThresholds`, one line per changed class:
   `logger.info("learned-threshold.update", { tenantId, actionType, oldThreshold, newThreshold, sampleSize, goodRate })`.
   (Uses the existing `lib/observability/logger`, as `guardrails/trust-score.ts:32` does.)
2. **Read surface** on `GET /api/settings/autonomy`: add `thresholds: { [action]: { static, current, source: "static"|"learned"|"relaxed", excluded } }` computed via `buildEffectiveThresholdMap` +
   the static map, so the autonomy page can show *"Updating a contact: asks above 60% confidence
   (learned, was 75%)"*. This turns the loop from invisible to legible (req AC-20). No write; read-only
   derivation.
3. The autonomy page renders that block under the level selector (small, secondary; the founder can see
   *why* the agent asks more/less). This also satisfies the "UI matches behaviour" spirit beyond just
   the level copy.

---

## 6. Data flow (after CLE-16)

```
                getTrustScore(tenant).overall (0-100, systemTrustScore)   ← the GATE score (§4.1)
                        │                                   │
   PUT /api/settings/autonomy: requiredTrustForLevel gate   │ (live, every resolve)
        (refuse level above floor — §4.2/§4.3, AC-10..12)   │
                        │                                   ▼
                  autonomy_config.level ──▶ resolveEffectiveMode(settings, level, trustOverall)  [CLE-10]
                                                   │  → { mode, relaxThresholds }
                            ┌──────────────────────┼───────────────────────────────┐
   tenant_settings         ▼                       ▼                                ▼
   .learnedThresholds  chat create/update     invokePageAction (CLE-04)        background loops
        │ (load)            │                       │ (no learned bar; user-present)   │ (load learnedThresholds)
        ▼                   ▼                       ▼                                ▼
  buildEffectiveThresholdMap(learned, relaxThresholds)  ─────────────────────────────┤   §3.3
        │   excluded→CEILING ; relaxed?? learned?? static ; clamp[0.5,1.0]           │
        └──────────────▶ decideAction(input, { actionKey, learnedThresholds: MAP }) ◀┘   [CLE-10 core, UNCHANGED]
                                   │  hard rules (paid/destructive/outbound→confirm) ABOVE the bar  (HARD RULE)
                        execute │ confirm │ queue │ refuse
                                   │
                          action runs ──▶ action_outcomes (F003)  +  tool_call_events reverted / outbound canceled|bounced (CLE-11)
                                   │
                          weekly recalc ──▶ ±0.05 from prev, clamped, exclusion-skip ──▶ learnedThresholds + log   (loop closes, §5)
```

One gate score, one effective-mode resolver, one core, one learned map builder, one loop. CLE-16 adds the
*map builder*, the *gate generalization*, the *loop's bad-signal + observability*, and the *SSOT copy* —
nothing inside the core.

---

## 7. Failure handling (fail-safe = low trust = more confirmation)

| Failure | Where caught | Outcome |
|---|---|---|
| `getTrustScore` throws / no row | `trust-score.ts:76-89` returns `overall:50` | Level gate uses 50 ⇒ strategic/autonomous refused unless earned; relaxation off. More confirmation (AC-22). |
| `computeEffectiveThresholds`/load throws | caller try/catch → pass `undefined` learned map | `buildEffectiveThresholdMap` falls back to static (relaxed only if relax flag) ⇒ static bars. Never lowers (AC-22). |
| `learnedThresholds` has a bad/out-of-range value | `clampThreshold` (`level-behavior.ts`) | NaN→CEILING; <0.5→0.5; >1.0→1.0. A hand-edited 0.1 cannot widen autonomy (EC-5). |
| Stale learned key for an excluded class | `buildEffectiveThresholdMap` forces CEILING + core hard-rule | inert (EC-8). |
| Recalc fails for one tenant | `trust-recalculator.ts:26` per-tenant `step.run` | isolated; others proceed; that tenant keeps last good learned map (EC-10). |
| Good-rate on tiny sample | `MIN_OUTCOMES_FOR_ADJUSTMENT` skip (§3.2) | static value, no swing (AC-21/EC-1). |
| Borderline good-rate (0.5–0.8) | dead-band (§3.2) | no move, no oscillation (EC-2). |
| Forged/stale `strategic` level, trust<80 | `deriveApprovalModeFromLevel` relax=false (CLE-10 §4.4) | static bars; relaxed bars require live trust (AC-13/EC-4). |
| Missing confidence under auto level | core `?? 0` (CLE-10 §2.1) | below any ≥0.5 bar ⇒ confirm (EC-9). |
| Downgrade | CLE-10 write-side sync + `resolveEffectiveMode` prefers row | next decision uses tighter mode immediately (EC-6). |

**Fail-safe direction throughout:** every defaulting path resolves toward *more* confirmation (static
bars, no relaxation, `review-each` fallback) — never a silent execute. This is the load-bearing property
the HARD RULE depends on.

---

## 8. Security

- **The HARD RULE is structurally enforced, triple-guarded** (§3.3): core arm (CLE-10), learner
  exclusion, injected-map ceiling. No learned/relaxed/forged threshold can auto-execute money,
  irreversible, or outbound actions (AC-4/AC-5/AC-6).
- **The trust gate is server-side** in the only write path for the level (§4.2); UI cannot bypass it
  (AC-12). The strategic relaxation is gated twice (route + `deriveApprovalModeFromLevel`) on the **live**
  gate score, so stale/forged levels cannot unlock relaxed bars (AC-13).
- **`buildEffectiveThresholdMap`, `clampThreshold`, the table, the copy map are pure** (no DB, no IO, no
  PII — enums, numbers, the static map). Trivially testable; no tenant surface.
- **Gaming resistance** (EC-3): floor 0.5 + hard rules cap blast radius to reversible non-outbound
  non-paid work; CLE-11 reversal is a *negative* signal so approve-then-undo nets bad; dead-band +
  `MIN_OUTCOMES` + weekly cadence slow swings. Defense-in-depth, documented as such.
- **Read-only consumption of CLE-11/F003** (§5.2): CLE-16 never writes `tool_call_events` or
  `action_outcomes`; it only aggregates them, so it cannot corrupt the audit/outcome stores (AC-24).
- **No new model surface.** Learned thresholds, the gate score, and the table never enter a prompt; the
  agent cannot read or forge its own bars. (Consistent with CLE-11 §9.)

---

## 9. How CLE-16 composes with CLE-10 WITHOUT changing the §3.5bis signature

This is the contract-critical section.

- **The frozen surface (README §3.5bis):** `decideAction({ action, approvalMode, role, confidence })`.
  CLE-10 already added an **optional second argument** `extra?: { actionKey?, learnedThresholds? }`
  (CLE-10 §2.1:97-113) that keeps every frozen call a valid one-argument subset. CLE-16 uses **exactly
  that** seam: it supplies `extra.learnedThresholds = buildEffectiveThresholdMap(...)` and
  `extra.actionKey = <GuardedAction>`. **No change to `decide-action.ts`'s body or signature** (AC-23).
- **`relaxThresholds` never reaches the core as a flag.** CLE-10's `resolveEffectiveMode` returns
  `{ mode, relaxThresholds }`. CLE-16 consumes the flag *in the caller* to decide *which map* to build
  (relaxed vs learned-vs-static — §3.3), then injects the resulting **map** into `extra.learnedThresholds`.
  The core still sees only a `Record<string, number>` (its existing type). This is the key trick: the
  level/trust/relax richness is resolved *before* the core and collapses into the one map the core
  already knows how to read (EC-11). Signature untouched.
- **Where the wiring lives** (callers, not the core):
  - **Background loops** (`agent-reactor.ts`, `autonomous-pipeline.ts`): they already call
    `enforceAgentApprovalMode`, which CLE-10 made delegate to `decideAction` and which already accepts
    `learnedThresholds` (`approval-mode.ts:112,164`; CLE-10 §6.1 forwards it as `extra`). CLE-16 loads
    `tenant_settings.learnedThresholds`, runs it through `buildEffectiveThresholdMap` with the
    `relaxThresholds` from `resolveEffectiveMode`, and passes the result as `learnedThresholds`. One
    added load + one transform per tenant evaluation; no new core path.
  - **Chat create/update** (`create.ts`): creates pass `confidence:1` (CLE-10 §5.1) so they execute
    under auto regardless of the learned bar — learning does not change chat-create UX. No wiring needed
    there beyond what CLE-10 ships (documented; no edit).
  - **PAR (`invokePageAction`)**: the user is present on the page; CLE-04 calls `decideAction` with one
    argument. CLE-16 leaves it one-argument (no learned bar for user-present page actions) — the learned
    relaxation is for *background* autonomy, not for actions the user is watching. (If desired later,
    the same map can be injected here; deferred, noted.)
- **Proposed README §3.5bis note (amendment, not a redefinition).** The cleanest home for the
  relax-vs-learned selection is documented as: "`extra.learnedThresholds` is the **already-resolved**
  effective bar map; callers fold level/trust/relaxation into it before calling." This is *already true*
  of CLE-10's design; CLE-16 only asks README to **note** it so a future reader does not try to pass a
  raw `relaxThresholds` flag into the core. **Zero-amendment fallback:** if the constitution forbids
  even a clarifying note, nothing changes in code — the behaviour is identical; only the doc note is
  skipped. Flagged at the M4 checkpoint (§10). Either way, **the signature does not change** (AC-23).

---

## 10. Test strategy + contract tension

**Test strategy** (vitest; pure helpers + fakes, no Playwright for logic — matches CLE-10/CLE-11):

- **`level-behavior.test.ts`** — the table (§3.1): for every `(level, class)` cell assert the disposition
  via `resolveEffectiveMode`→`buildEffectiveThresholdMap`→`decideAction` (AC-14); assert adjacent-level
  distinctness (autonomous≠copilot disposition; strategic≠autonomous threshold) (AC-15);
  `buildEffectiveThresholdMap` forces excluded classes to ceiling (AC-6/AC-7/EC-8); `clampThreshold`
  arms (NaN→1.0, 0.1→0.5, 1.5→1.0) (EC-5/AC-22); `requiredTrustForLevel` floors (AC-11).
- **`learning-bounds.test.ts` (REQUIRED — money/destructive/outbound never auto).** With a learned/
  injected threshold of `0.0` for a paid action, a destructive action, and an outbound action, across
  ALL levels (incl. strategic+trust100) and confidence `1`, assert `decideAction` returns `confirm`
  every time (AC-4/AC-5/AC-6). Assert `recalculateThresholds` writes NO key for excluded classes given
  outcome rows for them (AC-7).
- **`learned-trust.update.test.ts`** — good-rate ≥0.8 over ≥10 ⇒ threshold drops from prev, floored at
  0.5 (AC-2); <0.5 ⇒ rises, ceilinged at 1.0 (AC-3); dead-band 0.5–0.8 ⇒ no move (EC-2); <10 ⇒ static,
  no NaN (AC-21/EC-1); incremental-from-prev convergence over repeated windows; idempotent at the bound
  (EC-10); a CLE-11 `reverted`/`canceled` row counts as bad and a good-then-reverted action nets bad
  (AC-19/§5.2) using fake `tool_call_events`/`outbound_emails` rows.
- **`trust-gate.test.ts` (REQUIRED — the trustScore gate).** `PUT /api/settings/autonomy` with trust 79
  → strategic `403`, level unchanged; trust 80 → 200 (AC-10); trust 64 → autonomous `403`; 65 → 200
  (AC-11); curl-style direct call still `403` (AC-12); downgrade always allowed (EC-6); forged strategic
  level + trust 50 → `resolveEffectiveMode.relaxThresholds === false` (AC-13/EC-4).
- **`autonomy-copy.test.ts`** — the four shipped `LEVELS[].description` equal `LEVEL_BEHAVIOR[id].behavior`
  (AC-16/AC-17); a guard asserting no description contains a claim the table contradicts (e.g. regex for
  "auto-send" under copilot/guided).
- **`autonomy-observability.test.ts`** — recalc logs the structured line on change (AC-20); the GET
  returns the `thresholds` block with `{static,current,source,excluded}` (AC-20/§5.3).
- **Composition / no-regression** — `satisfies` check that `DecideActionInput` still equals README
  §3.5bis (AC-23); `git diff --stat` guard that `decide-action.ts`, `tool-call-log.ts`, the undo files,
  `capture/approval.ts`, and `campaign-engine/trust-score.ts` are unmodified (AC-23/AC-24); existing
  `approval-mode-learned.test.ts` + CLE-10/CLE-11 suites pass; `tsc --noEmit` 0; `regression.sh` green;
  no new runtime dependency.

**Contract tensions (flag at the M4 checkpoint):**
1. **`extra.learnedThresholds` as the "already-resolved bar map."** CLE-16 leans on CLE-10's optional
   `extra` (already beyond the literal §3.5bis first-arg surface, which CLE-10 itself flagged). CLE-16
   proposes a one-line README §3.5bis *note* clarifying the map is pre-resolved (relax/learned/static
   folded by the caller) so nobody re-adds a flag into the core. **Recommend: note it.** Zero-amendment
   fallback changes no code (§9). Signature unchanged either way.
2. **Two trust scores** (`systemTrustScore.overall` 0–100 gate vs `tenant_settings.trustScore` 0–1
   nudge). CLE-16 uses only the gate score (consistent with the route + CLE-10) and documents the
   boundary, but two scales is a smell. **Recommend a future consolidation** (one score, two consumers);
   merging now is out of scope (would touch the nudge UX + the route gate together).
3. **copilot ≡ guided on the disposition axis** (§3.1). CLE-10 maps both to `review-each`; the
   copilot/guided difference is on the campaign send-policy axis (out of scope). If product wants
   `guided` to auto-run reversible work (e.g. after a delay), that is a one-line `deriveApprovalModeFromLevel`
   change in CLE-10 — flagged for Martin, deferred. CLE-16's copy (§3.4) is honest about the current
   equivalence so the UI does not over-promise.
4. **Incremental-from-prev learning** (§3.2) changes the existing `recalculateThresholds` from
   "base ± one step" to "accumulate from prev (bounded)." This makes the bounds meaningful but is a
   behaviour change to F005's math. It is guarded (floor/ceiling/dead-band/min-sample) and tested; flag
   so a reviewer confirms the intent (sustained good outcomes SHOULD compound toward the floor).
