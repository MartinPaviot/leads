# INBOX-S02 — Per-message summary (top of email)
> Theme: T3 · Autonomy rung: helper · Priority: P0
> Pillar: P2 reading

## User story
As a user scanning a single email, I want a one-line summary at the top of that message, so I
know what it says and whether it needs me before reading the whole body.

## Why (audit anchor)
Shortwave shows an AI summary on **every** email (audit §3); Superhuman's Auto Summarize one-line
TL;DR sits at the top of the open thread (`ai-feature-deep-dive.md` step 1). The per-**message**
line is also the atom that other features reuse: INBOX-T08 (honest badge) and INBOX-S09 ("why this
matters") consume `aiSummaryLine`, and the list row needs a real one-liner instead of the raw
snippet (`_conversation-list.tsx:99`). We have none today — the row shows truncated raw text.

## Requirements (EARS)
- WHEN an email is captured/enriched, the system SHALL produce a single neutral one-line summary of
  that message (≤ ~120 chars), grounded in the message body, generated "via Elevay".
- The system SHALL persist the line as `metadata.aiSummaryLine` on the message's activity (cached;
  no per-render LLM call).
- The system SHALL render the line at the top of the open message in the reading pane and make it
  available to the list row, the badge (INBOX-T08), and "why this matters" (INBOX-S09).
- The summary SHALL be extractive/neutral (no sales framing, no hype) and SHALL NOT assert facts
  absent from the message.
- WHEN the message is automated (noreply/notification), the line SHALL still describe it plainly
  (e.g. "Login code from your hosting provider"), not a sales label.
- WHEN generation fails/pending, the system SHALL fall back to the existing snippet (linkified),
  never a fabricated line, and never the literal "Replied".
- The system SHALL respect per-user/tenant scope (`scopeConversationRows`).
- WHEN zero-retention AI is enabled for the tenant, the line SHALL be generated without third-party
  body retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a confirmation-code email WHEN opened THEN the top line reads e.g. "Verification code 4821, expires in 10 min", not a sales label.
- GIVEN a prospect email asking 3 questions WHEN opened THEN the line captures the gist in one sentence, grounded in the body.
- GIVEN the list view WHEN rendered THEN each row shows the summary line (S02) in place of the raw snippet, with the snippet still available on hover/expand.
- GIVEN a message whose summary is pending WHEN opened THEN the snippet renders (linkified) and no fabricated line appears.
- GIVEN the same message reopened WHEN no change THEN no LLM call fires (cache hit).
- GIVEN a non-English message WHEN opened THEN the line is in the user's UI language (configurable to source language).

## Edge cases & failure handling
- Very short message ("ok thanks") → summary = the message itself or a trivial restatement; never pad with invented context.
- Body is only quoted history (top-post empty) → summarize the new content; if none, fall back to subject + snippet.
- Marketing HTML with little prose → summarize the offer line; mark confidence "Inferred".
- Body unavailable (snippet-only capture, `email-capture.ts:360` rawContent null) → summarize the snippet, confidence "Inferred".
- Multi-tenant/user: only the viewer's messages; never another mailbox.
- Oversized body → summarize from a truncated, sanitized prefix; note nothing user-visible (it's one line).

## Best-in-class bar
- The per-message line is the **shared atom** for the badge (T08), "why this matters" (S09) and the list row — one cached generation, reused everywhere, so the inbox is coherent (Shortwave summarizes per email but doesn't reuse it to fix the *label*).
- Neutral + grounded by contract (no sales framing), so it's honest on automated/general mail where competitors' labels guess.

## Design sketch
- **Data:** `metadata.aiSummaryLine: string` on the `activities` row (JSONB merge, same pattern as the just-fixed `||` merge, `inngest/sync-functions.ts:494`); no migration. `ConversationMessage` (`lib/inbox/conversations.ts:56`) gains `summaryLine: string | null`.
- **API:** generate inside the existing per-message enrichment — `analyzeEmailBatch` (`sync-functions.ts:57`) already does one batched `generateObject` per email batch for sentiment/intent; extend its schema with `summaryLine` (one extra field, no extra call). `loadConversationRows` + detail route surface it.
- **UI:** one line above the message body in `_conversation-pane.tsx` and in the list row `_conversation-list.tsx:99`. Surface = inline text, `text-[12px] text-[var(--color-text-secondary)]`; an "AI summary" tooltip on a small lucide `Sparkles`/`AlignLeft` glyph (sober, no emoji); no dedicated shortcut (consumed by `i` at thread level, S01). Light+dark via tokens, no provider name, cited "via Elevay".
- **AI:** model role = one-sentence extractive summarizer per message; grounding = that message body; autonomy = helper. Fail-closed to snippet.
- **Security/perf:** folds into an existing batched call (no new latency budget); tenant+user scope; zero-retention honored; body sanitized before prompt.

## Tasks (ordered, each with a verify step + test to write)
1. Add `summaryLine` to `analyzeEmailBatch`'s `sentimentSchema` + write to `metadata.aiSummaryLine`. (verify: seeded batch returns a line per email) (test: `per-message-summary.test.ts` — grounded-only; automated mail → plain line not sales label; empty body → snippet fallback)
2. Thread `summaryLine` through `load.ts` + `ConversationMessage` + detail route. (verify: API returns it) (test: load-shape test)
3. Render the line in pane + list row; snippet remains the fallback. (verify: browser — the row shows the summary, automated mail reads plainly) (test: dom render + fallback)
4. Backfill existing rows (recompute `aiSummaryLine`). (verify: live inbox rows show summaries, no "Replied")

## Current-state notes (VERIFY before building)
- `analyzeEmailBatch` (`inngest/sync-functions.ts:57`, schema `sentimentSchema` at `:45`) is the batched per-message LLM call to extend; it already writes `sentiment`/`intent` + merges `metadata` (`:492–494`). VERIFY lines.
- `email-capture.ts:359–360` writes `summary` (subject) + `rawContent` (text); snippet lives in `metadata.snippet`.
- List row renders `snippet` at `_conversation-list.tsx:99`; pane body at `_conversation-pane.tsx:471`.
- **This spec is depended on by INBOX-T08** (honest badge) and **INBOX-S09** ("why this matters"); INBOX-S01 reuses the same fail-closed grounding discipline. Build S02 first.
