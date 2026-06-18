# INBOX-S06 — General intent & sentiment (not sales-only)
> Theme: T3 · Autonomy rung: helper · Priority: P0
> Pillar: P2 reading / P4 triage

## User story
As a user with a real mixed inbox (invoices, notifications, personal, support, as well as sales
replies), I want every message classified by a *general* intent and sentiment — not just a sales
taxonomy — so triage, badges and digests are correct on all my mail, not only on campaign replies.

## Why (audit anchor)
Our `intent` enum is **sales-only** today: `analyzeEmailBatch` tags from `interested,
not_interested, question, objection, budget_mention, …` (`inngest/sync-functions.ts:80`), and the
inbox maps it through `REASON_BY_LABEL` (`conversations.ts:116`) for **all** mail — so a login-code
email gets a sales reason and the fallback is the misleading "Replied" (`conversations.ts:297`).
The audit's gap analysis calls this out: "the `reason` badge is a sales-reply taxonomy applied to
all mail → nonsense on general/automated mail" (audit §5). Shortwave/Superhuman classify the whole
inbox generally (audit §3). **This spec is the general classifier the sales-only one must defer to**,
and it unblocks INBOX-T08 (honest badge) and INBOX-S09 ("why this matters").

## Requirements (EARS)
- WHEN a message is enriched, the system SHALL assign a **general intent category** from a broad
  taxonomy (e.g. `meeting_request, scheduling, question, request_action, fyi_update, notification,
  promotion_newsletter, invoice_billing, receipt_confirmation, security_account, support_request,
  personal, social, automated_no_reply, sales_reply`), produced "via Elevay".
- The system SHALL keep the existing **sales sub-intent** (`pricing_inquiry, objection_*, …`) but
  ONLY as a refinement that applies when the general intent is `sales_reply` AND the conversation has
  matched outbound (the gate INBOX-T08 needs).
- The system SHALL assign sentiment (`positive|neutral|negative`) as today, but interpret `neutral`
  for automated/transactional mail as "no human sentiment" rather than a reply tone.
- The general classification SHALL be persisted on the activity (`intent` column / `metadata`) and
  cached (no per-render LLM call).
- The taxonomy SHALL NOT be a hardcoded synonym map of senders/subjects; classification SHALL be the
  model's call over the real message, with deterministic post-rules only for unambiguous machine mail
  (per the existing `classifyInboundSender` automation check, `conversations.ts:262`).
- WHEN the model is unsure, the system SHALL assign `fyi_update`/null rather than a confident wrong
  category, and downstream badges SHALL degrade gracefully (empty, per INBOX-T08).
- The system SHALL respect per-user/tenant scope.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a hosting login-code email WHEN classified THEN general intent = `security_account` (or `notification`), NOT a sales label; the badge (T08) reads a neutral summary, never "Replied".
- GIVEN an invoice email WHEN classified THEN intent = `invoice_billing`; it triages to FYI/handled, not "attention".
- GIVEN a prospect reply "what's your pricing?" on a thread with our outbound WHEN classified THEN general = `sales_reply` AND sub-intent = `pricing_inquiry`, so the sales label legitimately applies.
- GIVEN a cold inbound "what's your pricing?" with NO outbound WHEN classified THEN general = `question` (not `sales_reply`); the sales sub-taxonomy does NOT fire (T08 shows the summary).
- GIVEN a newsletter WHEN classified THEN intent = `promotion_newsletter`; it bundles (INBOX-T03), never "attention".
- GIVEN ambiguous content WHEN classified THEN intent = `fyi_update`/null and the badge is empty, not a guess.
- GIVEN another user's mail WHEN classified in my view THEN it never appears (scope).

## Edge cases & failure handling
- Mixed thread (our outbound + later unrelated cold inbound) → classify by the **last inbound**, matching the existing `conversationLabels` "newer inbound supersedes" rule (`conversations.ts:182–195`).
- Multi-intent message (a question + a scheduling ask) → allow multiple general intents; the priority bucket uses the most actionable (reuse `PRIORITY_BY_LABEL`, extended).
- Non-English → classify in any language (model-driven, no language-specific hardcoding).
- Transactional mail misread as sales → the `sales_reply` general intent is gated on matched outbound, structurally preventing the misread badge.
- Body unavailable (snippet-only) → classify from snippet + subject + sender; mark lower confidence.
- Backward compatibility: existing rows have only sales `intent[]`; backfill must not crash readers that expect the old enum.

## Best-in-class bar
- A **two-tier** taxonomy: a general intent for the whole inbox + a sales sub-intent gated to real sequence replies (we own the outbound graph) — so we're correct on *all* mail AND precise on campaign replies, where Superhuman/Shortwave have one generic label and guess.
- Classification is **model-over-real-data** (no hardcoded sender/subject lists), matching our no-hardcoded-matching principle — robust to new sender shapes.

## Design sketch
- **Data:** reuse `activities.intent text[]` (`db/schema/core.ts`) for the general categories; keep sales sub-intents in the same array but namespaced (e.g. `sales:pricing_inquiry`) OR in `metadata.salesSubIntent` so the gate is explicit. `sentiment` column unchanged. No migration.
- **API:** rewrite the prompt + `intent` enum in `analyzeEmailBatch`'s `sentimentSchema` (`inngest/sync-functions.ts:45–80`) to emit `{ generalIntent, salesSubIntent?, sentiment, summaryLine (S02) }`; the sales sub-intent is only requested/kept when matched outbound exists (or applied at read time in `conversationLabels`). Update `PRIORITY_BY_LABEL`/`REASON_BY_LABEL` (`conversations.ts:93,116`) to cover general categories. Reuse `classifyInboundSender` (`lib/inbound/lead-classification`) for the deterministic automated-sender rule.
- **UI:** no new surface of its own — it powers the badge (INBOX-T08, `_conversation-list.tsx:113` / `_conversation-pane.tsx:277`), lanes, digest (S03) and "why" (S09). Any chip uses token colors, a sober lucide glyph per family, tooltip = the category + "via Elevay". Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** model role = general + (gated) sales classifier; grounding = the message; autonomy = helper. Fail-closed: unsure ⇒ `fyi_update`/null.
- **Security/perf:** folds into the existing batched `analyzeEmailBatch` call (no new latency); scoped; cached; zero-retention honored.

## Tasks (ordered, each with a verify step + test to write)
1. Replace the sales-only `intent` enum + prompt in `analyzeEmailBatch` with the two-tier taxonomy; gate `salesSubIntent` to matched-outbound. (verify: seeded mixed batch classifies invoice/notification/personal generally; sales sub fires only with outbound) (test: `general-intent.test.ts` — login-code → not sales; cold pricing → `question`; reply pricing+outbound → `sales_reply`+`pricing_inquiry`)
2. Extend `PRIORITY_BY_LABEL`/`REASON_BY_LABEL` for general categories; route automated/billing/promo to handled/FYI not attention. (verify: unit) (test: `conversations.test.ts` lane cases)
3. Persist + backfill the general intent without breaking old readers. (verify: live inbox — automated mail no longer in attention, no sales reasons on it) (test: backfill compat)
4. Wire to INBOX-T08 (badge), S03 (digest groups), S09 (why). (verify: badge reads correctly on real Infomaniak/kSuite mail) (test: integration on fixtures)

## Current-state notes (VERIFY before building)
- `analyzeEmailBatch` enum is sales-only (`inngest/sync-functions.ts:49–84`); the inbox maps it for ALL mail via `REASON_BY_LABEL` with the misleading "Replied" fallback (`conversations.ts:116,297`). THIS is the bug S06 fixes.
- `conversationLabels` already implements "newer inbound supersedes a stale outbound classification" (`conversations.ts:182–195`) — keep that rule for the general classifier.
- `classifyInboundSender` (`lib/inbound/lead-classification`, used at `conversations.ts:262`) is the existing deterministic automated-sender detector — reuse, don't duplicate.
- **This spec replaces the sales-only taxonomy and is depended on by INBOX-T08 and INBOX-S09.** Build alongside/just after S02.
