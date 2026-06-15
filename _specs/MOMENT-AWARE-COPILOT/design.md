# Design — Moment-Aware CRO Copilot (A + B + C)

Anchored on code read 2026-06-14: `lib/accounts/lifecycle-stage.ts` (derive-at-read pattern), `lib/docs/{types,content}.ts` + `steps/close.ts`, `skills/intelligence/sales-call-prep/{handler,schema}.ts`, `skills/register-all.ts`, `inngest/meeting-functions.ts` (`generateMeetingPrep`/`autoMeetingPrep`), activity `metadata.meetingType` (capacity).

## System fit
Two new pure modules under a new `lib/motion/` namespace + a branch of one existing skill. No new tables, no migration, no new infra, no new UI surface. The moment is computed at the point of use (like lifecycle stage), the doctrine is read from the in-memory `docSteps`, and the prep skill consumes both.

```
                         deal facts / meeting / lifecycle / liveCallMode / override (NL)
                                              │
                              lib/motion/moment.ts  deriveMoment() → { moment, confidence, source }
                                              │
                    ┌─────────────────────────┼───────────────────────────┐
                    ▼                          ▼                           ▼
   lib/motion/doctrine.ts            sales-call-prep (branch)        (D coaching, E objections — later)
   getStepDoctrine(moment)  ───────► inject rubric + branch prompt
        │ reads docSteps (Method)           │
        ▼                                    ▼
   condensed rubric (≤900 tok)     proactive: generateMeetingPrep (Inngest)  ·  on-demand: chat tool
```

## A — `lib/motion/moment.ts` (mirror of `lifecycle-stage.ts`)
```ts
export const MOMENTS = ["outbound","cold_call","discovery","demo","proposal","close","expansion"] as const;
export type Moment = (typeof MOMENTS)[number];
export const MOMENT_AUTO = "auto";

export function normalizeMoment(input: string): Moment | typeof MOMENT_AUTO | null;

export interface MomentSignals {
  override?: string | null;        // deal.properties.momentOverride (NL-set), top precedence
  liveCallMode?: boolean;          // Call Mode live dial
  hasDeal: boolean;
  dealStage?: string | null;       // deal_stage enum value
  lifecycleStage?: string | null;  // from deriveLifecycleStage / EFFECTIVE_LIFECYCLE_STAGE_SQL
  hasDemoActivity?: boolean;       // a demo meeting exists in activity
  lastMeetingType?: string | null; // activity metadata.meetingType: intro|qualification|deep_dive|follow_up
}
export function deriveMoment(s: MomentSignals): { moment: Moment; confidence: "high" | "low"; source: string };
```
**Rules (first match wins), each sets `source`:**
1. `override` present and normalizes to a Moment → that moment, `high`, source `override`.
2. `liveCallMode && !hasDeal` → `cold_call`, `high`, `live-cold`.
3. `lifecycleStage === "customer"` → `expansion`, `high`, `lifecycle-customer`.
4. dealStage map: `negotiation`→`close`; `proposal`→`proposal`; `demo` **or** `hasDemoActivity`→`demo`; `qualification`→`discovery`; `lead`→`outbound`. → `high`, `deal-stage`.
5. **Conflict guard:** if dealStage says an earlier moment but `hasDemoActivity` (or a later `lastMeetingType`) indicates a later one, pick the **later**, `confidence:"low"`, source `conflict-later`.
6. No usable signal → `discovery`, `low`, `no-signal`.

No SQL string needed (unlike lifecycle, the moment is a per-entity decision at prep/coaching time, not a list column). Override lives in `deal.properties.momentOverride`, written only from the chat NL-correction path; `"auto"` clears it (mirrors `LIFECYCLE_AUTO`).

## B — `lib/motion/doctrine.ts`
```ts
import { getDocBySlug } from "@/lib/docs/content";
import type { Moment } from "./moment";

export const MOMENT_TO_SLUG: Record<Moment, string | null> = {
  discovery: "the-discovery-call", demo: "the-demo", proposal: "the-proposal",
  close: "closing", cold_call: "cold-calling", outbound: "design-the-cadence",
  expansion: null,
};
export function getStepDoctrine(moment: Moment): { slug: string | null; rubric: string };
```
**Condense:** walk `step.blocks`; keep `h2`/`h3` (as `## `/`### ` lines), `ul`/`ol` items (as `- `), and `table` rows (header + `|`-joined rows); **drop** `p`, `callout`, `example`. Join, then enforce the ≤~900-token bound by truncating at the last whole block under the limit. Pure — no caching layer inside the function; prompt-cache happens at the LLM call (the rubric is a stable per-moment prefix block).

## C — `sales-call-prep` branch
**Schema (`schema.ts`):** add `moment: z.enum(MOMENTS).optional()` and `momentHint: z.string().optional()`; keep `callType` (back-compat). Add `moment: z.string()` to the output (the moment actually used).
**Handler (`handler.ts`):**
1. Load deal (already does when `dealId`) — also read `deal.properties` (override + extracted discovery facts) and the most recent meeting's `buyingSignals`.
2. Resolve effective moment: `input.moment ?? normalizeMoment(input.momentHint) ?? deriveMoment({override: deal.properties.momentOverride, hasDeal: !!deal, dealStage: deal.stage, …})`; legacy `callType` maps in last (negotiation→close, close→close, discovery/demo passthrough, follow_up→discovery).
3. If `momentHint` resolved to a Moment and a `dealId` is present, persist `deal.properties.momentOverride` (the only write; the NL-correction path).
4. `const { rubric } = getStepDoctrine(moment)`.
5. Build the prompt: a shared frame + a **moment branch**. The frame injects `rubric` under a header "Apply these rules to THIS prospect; do not restate them" and the hard no-fabrication rule. The branch sets the moment-specific required fields (discovery 5-layer+11-14Q+routing+24h-email; demo reads `painPoints` → 3 pain-mapped capabilities or the refuse-and-redirect when empty; close champion kit + cadence). `cold_call` short-circuits: return a pointer to Call Mode, no LLM.
6. Keep `tracedGenerateObject` on `claude-sonnet-4-6`; the output schema gains optional moment-specific arrays (e.g. `quantifiedQuestions`, `capabilitiesByPain`, `championOnePager`) so the renderer can show the right shape; existing fields stay for back-compat.

**Delivery wiring (no new surface):**
- `inngest/meeting-functions.ts` `generateMeetingPrep`/`autoMeetingPrep`: compute the moment from the meeting's deal + `metadata.meetingType` and pass it in → the proactive brief is already tailored.
- The chat tool that reaches `sales-call-prep` (the `prepSalesCall`/`generateMeetingPrep` tool) passes the context-derived moment and forwards a user's NL `momentHint`.

## Data model
No migration. New read/write of `deal.properties.momentOverride` (jsonb, optional) — follows the existing `properties.lifecycleStage` override convention exactly. Discovery facts read from existing `deal.properties` (deal-autofill output) and meeting `buyingSignals` (already extracted by `process-transcript`).

## Failure handling
- LLM/key missing → existing skill behavior (throws "No LLM API key configured"); unchanged.
- Missing deal/context → moment falls back to `discovery`/`low`; prep runs from contact context; unknown fields say "unknown".
- Demo without discovery facts → deterministic refuse-and-redirect string (not an LLM guess).
- Step doc slug missing/renamed → `getDocBySlug` returns undefined → `rubric:""` + generic prep; CI slug-existence test catches it before ship.
- Rubric oversized → truncated at a block boundary (never sent unbounded).

## Security / tenancy
- Existing tenant scoping unchanged: the skill already filters `deals` by `tenantId`; `momentOverride` is written within that scope.
- No new endpoint, no new auth surface. Pure functions touch no PII directly (they take primitive signals).
- House rules: no emoji in any output/test (tests already enforce `icon===""` elsewhere); Elevay branding; UI chrome English; no provider names. The doctrine content is our own copy (already house-rule-clean per the docs tests).

## What this explicitly does NOT add
No moment picker / toggle / button / settings / page (AI-native invariant 1). No new table. No change to cold-call Call Mode behavior. No D (coaching) / E (objections) wiring (separate specs). No plane-2 forecasting.
