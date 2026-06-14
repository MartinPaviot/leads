# Claap parity — "from recording a meeting → CRM enrichment" (2026-06-14)

Scope: Martin's ask — *"our Call Mode features must really be like Claap explains on its
site about CRM enrichment (Elevay) and everything that stems from recording a meeting."*
Method: read Claap's live pages + our actual code (no stale docs). Verdict-first.

## Claap's claimed feature tree (from claap.io)

Recording (in-person + online, bot, 99 langs) → transcript →
1. AI notes / summary (customizable templates)
2. **CRM field enrichment** — deal score, next steps, budget, objections, competitors,
   custom fields. Maps to any standard/custom CRM field. **Three workflows: fully
   automatic / review-before-sync / hybrid (auto some fields, review others)**.
   Field-specific extraction rules. "+80% accuracy."
3. Style-matched follow-up email (one click)
4. Deal scoring + qualification — **AI MEDDIC / BANT / SPIN scorers**, deal-health scoring
5. Risk detection (signals that derail before close)
6. Objection analysis + competitive battlecards
7. **AI coaching + scorecards** — talk-ratio, framework adherence, "instant coaching after every call"
8. Ask-AI-across-calls (NL over conversation data)
9. Forecasting + win/loss
10. Slack sharing of summaries

Sources: claap.io/ai-crm-enrichment, /revenue-intelligence, /meeting-recorder,
/conversation-intelligence, help.claap.io CRM field enrichment.

## The headline finding: an ASYMMETRY inside our own product

The dial-out **CALL** path is already Claap-grade. The **recorded-MEETING** path — the exact
thing Martin named — is the poor cousin. Same product, two tiers.

| Capability | CALL path (`applyCallToCrm`) | MEETING path (`processPostCall` / `process-transcript`) |
|---|---|---|
| Extraction schema | `callNotesSchema` — summary, buyingSignals(+initiatives), **MEDDPICC**, **contactProfile**, **evidence**, **debrief/coaching** | `meetingNotesSchema` — summary, buyingSignals, decisions. **No MEDDPICC, no evidence, no contactProfile, no debrief** |
| CRM write | deal/company/contact via **review seam** (`getCaptureApprovalMode` → `meddic`/`pendingMeddic`, `callIntel`/`pendingCallIntel`, `callProfile`/`pendingCallProfile`, `evidence`/`pendingEvidence`) | deal.`extractedIntel` + company.`meetingIntel` written **SILENTLY, always live, no review** |
| Review / approve UI | `components/call-intel.tsx` — MeddpiccScorecard + AccountCallIntel + ContactCallProfile, each with Approve/Dismiss `PendingBar` → `POST /api/call-intel/review` | none — meeting page has a coarse "Confirm & update CRM" button (all-or-nothing), no field-level review |
| Coaching | `debrief` block in schema; `coaching/post-interaction` → `coachingInsights` | same `coaching/post-interaction` fires… but **rendered NOWHERE** (orphaned) |
| Scorecard on the record | yes (on deal via call-intel) | **no** — meeting page renders summary/keyPoints/actionItems/decisions/buyingSignals/follow-up only |

So we are ~70–80% of the way to Claap **in code**, but the recorded-meeting experience hides
or omits most of it. This matches the CRO-Copilot-audit doctrine: *best skills are orphaned,
not missing → top-class = surface + push, reuse, not net-new AI.*

## Gap → fix (the LAKE — boilable now, every engine already exists)

1. **Recorded meeting earns the same intelligence as a call.** Reuse `callNotesSchema`
   (minus call-only `outcome`/`callbackRequest`) for the meeting extractor; write MEDDPICC +
   evidence + account intel + contactProfile through the SAME `getCaptureApprovalMode` seam
   and the SAME `meddic`/`callIntel`/`callProfile` keys. → one writer, two entry points.
2. **Surface it on the meeting record.** Render `MeddpiccScorecard` + `AccountCallIntel` +
   `ContactCallProfile` (Approve/Dismiss already built) on `meetings/[id]`. Extend
   `GET /api/meetings/[id]/notes` to return the linked deal/company/contact `properties`.
3. **Un-orphan coaching.** Render `coachingInsights` (score, talk-ratio, went-well / to-improve)
   as a "Coaching" section on the meeting record, with transcript citation deep-links (the
   `?t=` round-trip already works).
4. **Workflow control = Claap's 3 modes.** Surface `captureApprovalMode` (auto / review) as a
   visible setting; hybrid (per-field) is the stretch inside the lake.

## Flagged to Martin (the OCEAN — new infra, not silently built)

- In-person meeting recording (mobile/desktop capture). Recall bot = online-only today.
- Slack / external sharing of summaries (new outbound integration).
- Selectable frameworks beyond MEDDPICC (BANT/SPIN/CHAMP) as separate scorers.
- Cross-call rollup reports (top objections / competitors / feature-requests across all meetings).
- Team-customizable note templates.
- Dedicated "Ask AI across my meetings" tool (chat skills partially cover today).

## Key files (verified 2026-06-14)
- `lib/voice/extraction-schema.ts` — rich `callNotesSchema` (the spine to reuse)
- `lib/voice/post-call-crm.ts` — `applyCallToCrm`, the review-gated writer to mirror
- `lib/capture/approval.ts` — `getCaptureApprovalMode` (auto default; review parks pending)
- `app/api/call-intel/review/route.ts` — approve/dismiss for deal/company/contact pending*
- `components/call-intel.tsx` — the scorecards to reuse on the meeting page
- `lib/meetings/post-call.ts` + `app/api/meetings/process-transcript/route.ts` — meeting path to upgrade
- `app/(dashboard)/meetings/[id]/page.tsx` — the surface to extend
- `inngest/coaching-engine.ts` (`postInteractionCoaching`) → `coachingInsights` (orphaned output)
