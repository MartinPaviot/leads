# Design — Living Script Engine

Companion to `requirements.md`. This is where "real intelligence, not a prompt" is made concrete: the types, the deterministic rules, the single constrained-and-cited LLM step, and the lever predicates shared by compile-time validation and post-call scoring.

## 1. System fit

```
            ┌─────────────────────────────────────────────────────────┐
  brain ───►│ evidence.ts   buildProspectEvidence(brain, signal,       │  pure
 (existing) │               callIntel) → ProspectEvidence              │
            └───────────────┬─────────────────────────────────────────┘
                            ▼
            ┌─────────────────────────────────────────────────────────┐
  template ►│ assemble.ts   assembleScript(evidence, template)         │  pure, deterministic
 (callScripts)              → { blocs[], gaps[] }                      │
            └───────┬───────────────────────────────┬─────────────────┘
                    │ (insight/problem need phrasing) │
                    ▼                                 │
            ┌──────────────────────────┐             │
  model ───►│ insight.ts  generateGrounded           │  ONE LLM call, schema+citation,
 (Haiku)    │  Insight(evidence, tmpl) │  fail-closed │  fail-closed
            └──────────────┬───────────┘             │
                           ▼                         ▼
            ┌─────────────────────────────────────────────────────────┐
            │ levers.ts    validateScript(script) → GapReport          │  pure, unit-tested
            └───────────────┬─────────────────────────────────────────┘
                            ▼
            POST /api/calls/script/assemble  → { script, gaps }  ──►  _call-script.tsx (render + provenance)

  Phase 2:  inngest/calls-post-process ──► levers.ts scoreTranscript() + judge
                          ──► calls.leverScores (jsonb)  +  playbookEntries (learned objection bank)
                          ──► live coaching reads the learned bank instead of the static PLAYBOOK
```

Reuses, does not duplicate: `lib/call-mode/live-script.ts` (reason rule = the first assembler rule), `call-scripts.ts` (template defaults + becomes home of shared types), `tenant-script.ts` (load/generate/upsert), the brain endpoint, `playbookEntries`, `CampaignFunnelBar`.

## 2. Module layout

| File | New/changed | Purity | Responsibility |
|---|---|---|---|
| `lib/call-mode/evidence.ts` | new | pure (brain passed in) | brain + signal + call-intel → typed `ProspectEvidence` with sources + confidence |
| `lib/call-mode/assemble.ts` | new | pure, deterministic | evidence + template → `AssembledScript` + `GapReport` (no LLM) |
| `lib/call-mode/levers.ts` | new | pure | the 9 lever predicates; `validateScript` (compile) + `scoreTranscript` (Phase 2) share them |
| `lib/call-mode/insight.ts` | new | I/O (1 LLM call) | `generateGroundedInsight` — schema + `evidenceRef` citation + fail-closed validation |
| `lib/call-mode/tenant-script.ts` | changed | I/O | seed template from product+ICP+**won deals**; generate per-tenant objection bank |
| `app/api/calls/script/assemble/route.ts` | new | I/O | server composes evidence (key + joins stay server-side) → returns assembled script + gaps |
| `app/(dashboard)/call-mode/_call-script.tsx` | changed | UI | render assembled blocs + per-bloc provenance + gap markers |
| `inngest/calls-post-process.ts` | changed (Phase 2) | I/O | score transcript via `levers.ts`; write `calls.leverScores`; feed flywheel |

## 3. Types (concrete, grounded in `ContactBrainJSON` / `DossierJSON`)

```ts
// evidence.ts
export type EvidenceKind = "signal" | "dossier" | "activity" | "knowledge" | "callIntel";
export interface EvidenceSource { kind: EvidenceKind; ref: string; observedAt?: string }
export interface EvidenceItem { id: string; value: string; source: EvidenceSource; confidence: number }

export interface ProspectEvidence {
  reason: EvidenceItem | null;          // strongest why-now (live-script priority rule)
  problemTrigger: EvidenceItem | null;  // selects the ONE Tier-1 enjeu
  peerReference: EvidenceItem | null;   // enables the heard-the-name opener
  persona: { title?: string; kpi?: string };
  insightInputs: EvidenceItem[];        // the ONLY facts insight.ts may phrase from
  history: { lastTouchAt?: string; meddpicc?: Record<string, string> };
}

// assemble.ts
export type BlocKind =
  | "opener" | "reason" | "insight" | "problemTier1"
  | "microCTA" | "ask" | "objections" | "voicemail" | "gatekeeper";
export type LeverId =
  | "opener_permission" | "reason_stated" | "single_tier1_problem"
  | "insight_present" | "ask_derisked" | "guidance_over_defer"
  | "booking_live" | "objection_ready" | "talk_ratio";       // talk_ratio = transcript-only (Phase 2)

export interface AssembledBloc {
  kind: BlocKind;
  text: string;
  grounded: boolean;
  provenance?: { label: string; sourceRef: string };   // sourceRef = an EvidenceItem.id
  leverIds: LeverId[];
}
export interface GapReport { failedLevers: { id: LeverId; why: string }[] }
export interface AssembledScript { blocs: AssembledBloc[]; gaps: GapReport }
```

`AssembledScript` is **computed per selection and never persisted** — only the tenant *template* and the learned objection bank persist. This keeps the per-call output always fresh and removes a class of staleness bugs.

## 4. The deterministic assembler (`assemble.ts`) — the intelligence that is NOT an LLM

Rules, in order, each reading only typed evidence + the template:

1. **Reason** — `deriveOpeningReason` (shipped). `grounded = reason != null`; `provenance.sourceRef = reason.id`.
2. **Opener variant** — `peerReference ? heardTheName(template, peerReference) : reason ? permissionContextual(template) : direct(template)`. The opener body stays a permission gate (no listed problems) by construction — the template enforces it and the validator checks it.
3. **Tier-1 problem (exactly one)** — score each template sector enjeu against `problemTrigger` + sector match; pick argmax; `grounded` iff a real trigger drove the pick, else fall back to the sector default (ungrounded, flagged template).
4. **Insight** — if `insightInputs` non-empty → candidate for the LLM step (§5); else template insight stub or omit.
5. **Micro-CTA** — fixed template line (interest trial-close), never generated.
6. **Ask** — template de-risked ask: must contain a reversibility clause + a binary slot; assembled with the prospect's name; never generated.
7. **Objections** — top-N for the sector from the per-tenant bank (Phase 2: learned; Phase 1: per-tenant generated, not the Elevay static bank).

Determinism is the test surface: `assembleScript(evidence, template)` is a pure function, snapshot-tested, no clock, no I/O.

## 5. The single LLM step (`insight.ts`) — constrained + cited + fail-closed

This is the only place an LLM touches the spoken script, and it cannot invent.

```ts
const schema = z.object({
  insight:      z.object({ text: z.string(), evidenceRef: z.string() }).nullable(),
  problemScene: z.object({ text: z.string(), evidenceRef: z.string() }).nullable(),
});
```

- The prompt lists `insightInputs` with **stable ids** (`E1`, `E2`, …) and the tenant register/constraints. Instruction: *"You may reference ONLY facts present in EVIDENCE. For each output set `evidenceRef` to the id you used. If you cannot ground it in EVIDENCE, return null. One reframe + one problem scene. No vendor pitch. Register: {tenant}."*
- **Post-validation (the actual guarantee):** drop any output whose `evidenceRef` ∉ provided ids; on drop, fall back to the template stub. Tested by injecting a bogus `evidenceRef` and asserting the claim is discarded.
- Model: `claude-haiku-4-5-20251001` (same as `generateCallScript`); `null` model ⇒ skip ⇒ template stub. Cached per `(contactId, evidence hash)` so re-selecting a contact does not re-call.

Why an LLM here at all (and not a rule): phrasing a *novel reframe* from heterogeneous facts (funding + hiring + tech) into one natural sentence in the tenant's voice is the one sub-task rules do badly. Everything around it — what facts, whether to speak, which lever, whether to trust the output — is deterministic.

## 6. The 9 levers (`levers.ts`) — one definition, two uses

From `_research/cold-call-exchange-top01-2026-06.md` Part 9. Each lever is a predicate; the **compile-time** validator runs the script-checkable ones, the **Phase-2** scorer runs all on the transcript. Single source ⇒ coaching and scoring cannot diverge.

| LeverId | Compile check (on `AssembledScript`) | Runtime score (on transcript) |
|---|---|---|
| `opener_permission` | opener matches permission-gate shape, no listed problems | opener said as permission, rising intonation cue absent → n/a |
| `reason_stated` | reason bloc present & grounded | reason actually voiced early |
| `single_tier1_problem` | exactly one problem bloc | one problem painted, not three |
| `insight_present` | insight bloc present | a reframe was delivered |
| `ask_derisked` | ask contains reversibility + binary slot | de-risk language present in ask |
| `guidance_over_defer` | ask uses guided slot ("mardi 14h ou jeudi ?") not "quand seriez-vous dispo ?" | same, detected in transcript |
| `booking_live` | a Book-meeting action is wired to the ask | invite sent during the call |
| `objection_ready` | bank has an answer for the sector's top objections | objections answered, not argued |
| `talk_ratio` | — (transcript-only) | rep talk share ~55% (Deepgram speaker spans) |

Compile-time validators are pure and unit-tested with passing + deliberately-broken templates.

## 7. Data model

- **`callScripts`** — add a nullable jsonb column `blocs` carrying the structured template extensions (insight stubs, peer references, per-sector objection bank). Existing columns (`opener`, `problems`, `permissionCheck`, `bookingAsk`, `guidance`) stay and keep working; `blocs` is additive and read with a default so old rows still load. **Migration caution:** live Supabase has drifted from the runner before (`reference_db-migration-drift`) and `jsonb_set` no-ops on a missing parent (`reference_jsonb-set-missing-intermediate`) — so: diff the live table before trusting the column exists, and write the column with a full object (`||` merge), not `jsonb_set`.
- **`calls.leverScores`** (Phase 2) — nullable jsonb on the existing `calls` table (no new table → smallest migration surface), shape `{ [LeverId]: boolean | number, perfScore: number, scoredAt: string }`.
- **`playbookEntries`** (exists) — Phase 2 writes learned objection answers here (`type:"objection_response"`, `content`, `outcomeLabel`, `perfScore`); no schema change.

## 8. API

- `POST /api/calls/script/assemble` `{ contactId }` → `{ script: AssembledScript }`. Server-side so the model key + brain joins stay off the client; tenant-scoped via `withAuthRLS`; reuses the brain assembly the contact endpoint already does.
- `GET/PUT /api/calls/script` — unchanged contract, extended to round-trip the new `blocs` template fields.
- The panel calls `assemble` on contact selection (replacing the client-side interpolate-only path), and keeps the edit/regenerate flow against `/api/calls/script`.

## 9. Failure handling
- No brain / no evidence → assembler returns opener + template blocs; `reason`/`insight` absent; no error.
- LLM down / no key → insight falls back to template stub; everything else assembles.
- Ungrounded LLM claim → dropped (fail-closed), template stub used.
- Validator failure → script still renders, with a visible "needs attention" marker on the failed lever (never a blank panel).
- Assemble endpoint 5xx → panel falls back to the current template-only render (graceful degrade to today's behaviour).

## 10. Security / tenancy
- All reads/writes tenant-scoped via `withAuthRLS`; template edits attributed with `appUserId` (the `users.id` space — see `reference_user-id-two-spaces`, not `authCtx.userId`).
- No prospect-identifying data leaves the server except the assembled script the rep already sees.

## 11. Performance
- One LLM call per contact selection, only when grounded insight inputs exist, cached per `(contactId, evidenceHash)`; the deterministic path is synchronous and free.
- Assemble is O(enjeux) — trivial.

## 12. Oceans explicitly deferred (own specs)
- Live teleprompter sync (transcript ↔ bloc highlighting).
- Tonality / PAVP from Deepgram timings.
- Roleplay bot-persona pre-call.
- Generator prompt-variant A/B beyond the lever scorecard.

## 13. Open design questions (for review)
1. Assemble server-side (chosen) vs client-side from the already-loaded brain — server keeps the key + joins server-side and lets Phase 2 reuse the same evidence builder; confirm.
2. `blocs` jsonb on `callScripts` vs a sibling `call_script_blocs` table — jsonb chosen for the smaller migration surface given known drift; confirm.
3. Phase 2 scorer judge model + cost budget (Haiku, ≤ ~600 tokens/call like the live classifier) — confirm acceptable.
