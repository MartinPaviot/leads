# INBOX-T02 — Plain-English AI filters (label / star / archive) with live preview
> Theme: T2 · Autonomy rung: proactive · Priority: P1
> Pillar: P4 triage

## User story
As a user, I want to write a rule in plain English ("emails where a prospect asks about
pricing", "invoices") that auto-labels, stars, or archives matching mail — and tune its
accuracy by clicking correct/wrong on a live preview — so triage runs itself without me building
brittle filters.

## Why (audit anchor)
Shortwave's **AI Filters** are plain-English scripts that label/star/archive
(`ai-native-mailbox-audit.md` §3). Superhuman's custom **Auto Labels** combine deterministic
criteria (From/To/Subject) **OR an AI prompt**, with AND/OR + exclusions, and — the part to
steal — a **live preview panel where you click correct/wrong on results to refine accuracy**
(`ai-feature-deep-dive.md` "Auto Labels"). Ours must do the same but ground the AI on our
**ICP/persona** so sales-meaning labels are correct, not guessed, and carry no vendor name.

## Requirements (EARS)
- The system SHALL let a user create a filter from either deterministic criteria
  (`from`/`to`/`subject`, AND/OR, exclusions) OR a plain-English prompt, OR both.
- WHEN a filter has an AI prompt, the system SHALL classify each candidate conversation against
  it using the persisted message text + the tenant's ICP/persona context (grounding, not a
  vendor list).
- The system SHALL support three actions per filter: apply a **label**, **star**, or **archive**
  (the archive action defers to INBOX-T10 Auto-Archive semantics).
- WHEN a user is editing a filter, the system SHALL show a **live preview** of recent matches and
  let the user mark each correct or wrong; the system SHALL fold those judgements into the
  prompt context to improve precision before saving.
- The system SHALL cap AI-prompt filters per user (e.g. 10, mirroring Superhuman) and say so.
- The system SHALL apply a saved filter to **new inbound** and to a bounded recent backfill
  window (e.g. last 14 days), never silently to the entire archive.
- The system SHALL record, per labelled conversation, which filter fired and why (the matched
  clause or the AI rationale) for the "why" tooltip and the audit trail.
- The system SHALL NOT show a label that asserts a sales meaning unless the conversation is an
  actual sequence reply OR the AI is confident with cited evidence (consistency with INBOX-T08).
- Every filter action SHALL respect the per-rule autonomy dial (INBOX-T11): suggest vs auto.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a prompt filter "prospect asking about pricing" → label "Pricing" WHEN a reply "what
  does it cost?" arrives THEN it is labelled "Pricing" with a "why" = the matched sentence.
- GIVEN the same filter in preview WHEN the user marks a false match wrong THEN re-running the
  preview excludes that pattern and the marked item no longer matches.
- GIVEN a deterministic filter `From: billing@*` → label "Invoices" WHEN an invoice arrives
  THEN it is labelled without an LLM call.
- GIVEN a filter with action **archive** set to **auto** WHEN a match arrives THEN it skips the
  attention lane (INBOX-T10) and is reported in Handled/Archived with the rule named.
- GIVEN a filter with action **archive** set to **suggest** WHEN a match arrives THEN it stays in
  the inbox with a one-click "Archive (rule: X)" affordance.
- GIVEN an 11th AI-prompt filter WHEN the user tries to save THEN the system blocks it and
  explains the cap.
- GIVEN two tenants WHEN tenant A's filter runs THEN it only ever reads tenant A's mail and ICP.

## Edge cases & failure handling
- Ambiguous prompt ("important stuff") → low-confidence matches are *suggested*, never
  auto-applied; the preview shows confidence.
- LLM unavailable/timeout → deterministic clauses still apply; AI clause degrades to "no match"
  (fail-closed), never a wrong label.
- Non-English mail → classify in the mail's language; preview shows the original snippet.
- Conflicting filters (two labels, one archive) → all labels apply; archive wins for placement;
  conflicts surfaced in the filter list.
- Backfill window huge → bounded + paginated; never blocks the editor.
- Multi-tenant + per-user: filters are personal; classification reads only the owner's scoped mail.
- No ICP configured → prompt still works on message text alone; sales-meaning labels held to the
  INBOX-T08 gate (no guessed sales label on non-sequence mail).

## Best-in-class bar
- The AI is **grounded in our ICP/persona** (`lib/icp/criteria-engine.ts`,
  `lib/icp/person-targeting.ts` `getIcpPersonTargeting`), so "reply from a buyer at a target
  account" is *correct*, not a generic guess — Superhuman/Shortwave have no ICP to ground on.
- The correct/wrong live-preview loop is **stored as labelled examples** the filter reuses, so precision
  improves with use; competitors' preview is one-shot.
- Labels are honest (INBOX-T08): no sales label on non-sequence mail without cited evidence.

## Design sketch
- **Data:** `inbox_filters` (per-user): `id, tenant_id, user_id, name, kind(deterministic|ai|
  hybrid), criteria jsonb, prompt text, action(label|star|archive), label_id, autonomy(suggest|
  auto), examples jsonb[] (correct/wrong tuples)`. Applied labels recorded on the conversation via
  `activities.metadata.appliedFilters[]` + `intent` reuse (`activities` `core.ts`; see
  `_CODEBASE-NOTES.md`). New `inbox_labels` (per-user): `id, name, color_token`.
- **API:** `GET/POST/PATCH/DELETE /api/inbox/filters`; `POST /api/inbox/filters/preview`
  (returns recent matches + rationale + confidence, takes interim correct/wrong). Classification helper
  `lib/inbox/filter-classify.ts` (LLM, grounded on ICP/persona; fail-closed) reused by the
  sync/enrich pass (`inngest/sync-functions.ts`) so labels are cached, not per-render.
- **UI:** a filter editor (light card, `--shadow-floating`) reachable from settings + the command
  palette (INBOX-K01); the live-preview panel is a two-column list with correct/wrong chips
  (`--color-success` / `--color-error` icon-only, lucide `Check`/`X`), confidence shown as
  `confidence-state` (Verified/Likely/Inferred, `components/ai-ui/confidence-state`). Labels
  render as `Badge` in token colors (no vendor name), with a "why" tooltip. Shortcut: `#` opens
  "apply label" on the selected conversation (aligns INBOX-K06). Light+dark via tokens, no emoji,
  no provider name, cited.
- **AI:** classifier model role = single-label match with rationale + confidence; grounding source
  = message text + tenant ICP/persona; autonomy dial per INBOX-T11; zero-retention option (T11/P03).
- **Security/perf:** owner-scoped; bounded backfill; cached labels; cap on AI filters.

## Tasks (ordered)
1. `inbox_filters` + `inbox_labels` schema + migration (per-user). (verify: drizzle) (test:
   scope test)
2. `lib/inbox/filter-classify.ts` grounded classifier (ICP/persona; fail-closed). (verify: unit
   with mocked LLM) (test: classify.test.ts — confident match, ambiguous→suggest, LLM-down→no-match)
3. CRUD + `/preview` endpoint with correct/wrong folding. (verify: preview re-ranks after wrong) (test: route)
4. Wire deterministic + AI labels into the enrich pass; cache on the conversation. (verify: label
   appears in list with "why") (test: cache test)
5. Filter editor + live-preview UI (correct/wrong, confidence, token-colored labels). (verify: browser)
6. Honor INBOX-T11 autonomy dial + INBOX-T08 honesty gate. (verify: suggest vs auto behavior)
   (test: gate test)

## Current-state notes (VERIFY before building)
- No filter/auto-label table or classifier exists (grep: none for `inbox_rule|auto_label`).
- ICP/persona grounding exists: `lib/icp/criteria-engine.ts` (pure AND-of-criteria + fit),
  `lib/icp/person-targeting.ts` `getIcpPersonTargeting`. Reuse, don't reinvent
  (`feedback_no-hardcoded-matching`).
- Sentiment/intent enrichment already runs in `inngest/sync-functions.ts` and writes
  `activities.intent`/`sentiment` — the natural home to also run filter classification + cache.
- Honesty gate: INBOX-T08 already prevents guessed sales labels on non-sequence mail.
