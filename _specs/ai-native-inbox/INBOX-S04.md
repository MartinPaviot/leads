# INBOX-S04 — Action-item / todo extraction
> Theme: T3 · Autonomy rung: helper · Priority: P1
> Pillar: P2 reading

## User story
As a user reading my mail, I want the action items addressed to me pulled out as a checklist —
each tied to the sentence that asked for it — so nothing a sender needs from me slips through.

## Why (audit anchor)
Shortwave ships **Email-to-Todo** (audit §3); the capability is in the master taxonomy as
"action-item / todo extraction" (audit §2). Superhuman's "emails needing your response" prebuilt
Auto Label is the triage analogue (`ai-feature-deep-dive.md`). We extract **none** today. Our edge:
each action item **cites the exact sentence** it came from and, when it implies a GTM step (book a
demo, send pricing), it links to the deal/next-action engine — Lightfield recall + Monaco intel.

## Requirements (EARS)
- WHEN a message/thread is enriched, the system SHALL extract action items that are requests *of the
  user* (asks, commitments the user made, deadlines), each with the source sentence + message id.
- The system SHALL distinguish (a) requests of me, (b) things I committed to, (c) FYI-only (no
  action) — and only surface (a)+(b) as todos, generated "via Elevay".
- Each action item SHALL carry a citation/deep-link to the originating message and, where present, a
  due date parsed from the text (reuse entity extraction, INBOX-S05).
- The system SHALL persist extracted items (cached) so the list renders without a per-render LLM call.
- WHEN an item implies a known GTM step (schedule/demo/pricing/contract), the system SHALL offer the
  matching next-action (link to INBOX-G05 / sequence / sovereign booking) rather than a bare todo.
- The system SHALL NOT invent action items; ambiguous content yields no item, not a guessed one.
- The user SHALL be able to dismiss / mark done an item; state SHALL persist per-user.
- The system SHALL respect per-user/tenant scope (`scopeConversationRows`).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an email "can you send the deck by Friday and confirm the 2pm call?" WHEN extracted THEN two action items appear: "Send the deck (due Fri)" and "Confirm the 2pm call", each linking to that sentence.
- GIVEN a newsletter WHEN extracted THEN no action items (FYI-only), no fabricated todo.
- GIVEN "what's your pricing?" from a prospect with an open deal WHEN extracted THEN the item offers "Send pricing" wired to the next-action/sequence (INBOX-G05), not just a checkbox.
- GIVEN an item WHEN I mark it done THEN it stays done across reloads (per-user state).
- GIVEN no clear ask WHEN extracted THEN zero items, never a guessed one.
- GIVEN a due date in the text WHEN extracted THEN the item shows the parsed date (S05); ambiguous date → no date, not a wrong one.

## Edge cases & failure handling
- Polite filler ("let me know if questions") → not an action item (no real ask).
- Multiple asks in one sentence → split into distinct items, each citing the same sentence.
- Ask addressed to someone else on the thread (cc) → not the user's item; suppress or attribute to the named person, never assign to me.
- Recurring/again-asked across the thread → dedupe to one item (latest occurrence cited).
- No body (snippet-only) → extract from snippet, mark confidence "Inferred"; if nothing, no items.
- Multi-tenant/user scope enforced; another mailbox's asks never surface.

## Best-in-class bar
- Items are **cited to the sentence** and **classified by addressee** (mine vs cc'd), so we don't dump every imperative as a todo — more precise than a generic email-to-todo.
- GTM-aware items become **next actions** wired to the deal/sequence/booking engine (Monaco-parity), not inert checkboxes — a step competitors can't take without our CRM graph.

## Design sketch
- **Data:** `metadata.actionItems: [{ id, text, sourceMessageId, sourceSentence, dueAt?, kind: 'request'|'commitment', gtmStep?, status: 'open'|'done'|'dismissed' }]` on the activity (JSONB; no migration). Per-user done/dismiss state keyed by user (mirror `inbox_triage` pattern if cross-user separation is needed).
- **API:** extract in the deep per-message pass — `enrichment/email-extract-batch-requested` (`inngest/sync-functions.ts:551`) already extracts "next steps"; add an `actionItems` field to its schema/writer. Surface via `loadConversationRows` + detail route; `POST /api/inbox/action-item/{id}` to set status. Due-date parsing shares INBOX-S05.
- **UI:** an "Action items" section in the reading pane (and a count chip on the row). Surface = card section, header `text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]`, items = checkbox rows (`components/ui` checkbox), `rounded-md`, `hover:bg-[var(--color-bg-hover)]`; lucide `ListChecks`/`Check`/`Calendar`; citation via `cited-claim.tsx`; GTM items show a small `ArrowRight` to the next action. Keyboard: `t` toggles the action-items section (only if free in the inbox map, INBOX-K02). Light+dark via tokens, no emoji, no provider name, cited "via Elevay".
- **AI:** model role = structured extraction (addressee-aware, grounded); grounding = message bodies; autonomy = helper. Fail-closed: ambiguity ⇒ no item.
- **Security/perf:** folds into an existing extraction call; scoped; cached; zero-retention honored.

## Tasks (ordered, each with a verify step + test to write)
1. Add `actionItems` to the email-extract schema/writer; persist to `metadata.actionItems`. (verify: seeded email yields addressee-correct items with source sentences) (test: `action-items.test.ts` — mine vs cc'd; FYI → none; due-date parsed; dedupe)
2. Surface items via `load.ts` + detail route + a row count chip. (verify: API returns items) (test: load-shape)
3. Action-items pane section + checkbox state endpoint. (verify: browser — items render, marking done persists) (test: dom + status route)
4. GTM-step wiring (link items to INBOX-G05 / sequence / booking). (verify: a pricing ask shows "Send pricing" next-action) (test: gtm-step mapping)

## Current-state notes (VERIFY before building)
- `enrichment/email-extract-batch-requested` (`inngest/sync-functions.ts:551`) already extracts "next steps / champion signals" — extend its schema; don't add a new pass. VERIFY the schema file (`lib/enrichment/email-extract.ts` per the conversations.ts header comment).
- `inbox_triage` (`db/schema/outbound.ts`) is the precedent for per-conversation user state (done/snoozed with computed reopen) — mirror for per-item done/dismiss if needed.
- Depends on INBOX-S05 (date parsing) and links to INBOX-G05 (next action). No action-item UI exists today.
