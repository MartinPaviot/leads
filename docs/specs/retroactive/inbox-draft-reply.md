# Retroactive spec: Inbox inline "Draft AI reply"

## Status
- Shipped in: `9a1d937` (PR #5, "WS-0 PR 1"), 2026-04-21
- Spec written: 2026-04-22
- Reviewed by Martin: pending

## Purpose
Surfaces the existing AI reply suggestion capability directly in the inbox list view, so founders triaging emails can draft a response without navigating to the contact detail page. A "Draft AI reply" button appears on replied emails that have a reply snippet. Click fetches 3 toned reply drafts, picks the "brief" tone by default, and opens the EmailComposer pre-filled.

## Current behavior
- **Trigger:** "Draft AI reply" button rendered on inbox rows where `email.replySnippet` exists (replied emails with content).
- **UI:** Sparkles icon + text. Shows Loader2 spinner + "Drafting..." during fetch.
- **API call:** `POST /api/emails/suggest-reply` with `{ emailContent, senderName, senderEmail }`. This endpoint pre-existed — the inbox page is a new surface for it.
- **Response handling:** extracts 3 toned replies from response. Selects `tone === "brief"` by default, falls back to first reply.
- **Composer:** opens `EmailComposer` pre-filled with recipient, subject (`Re: {subject}`), and body from the selected draft.
- **Error handling:** toast on failure ("Couldn't draft a reply right now"). Console warning on catch.
- **No new API endpoints created.** Purely a UI change (~40 LOC in `inbox/page.tsx`).

## Dependencies

### Upstream (what calls this)
- `inbox/page.tsx` — inline button on replied email rows.

### Downstream (what this calls)
- `POST /api/emails/suggest-reply` — existing endpoint, unchanged.
- `EmailComposer` component — existing component, unchanged.

### Data read/written
- Reads: email row data (already loaded by inbox page).
- Writes: nothing (until the user sends the draft via the composer).

## Edge cases handled
- No reply snippet — button is not rendered.
- API failure — toast error, button resets.
- No replies generated — toast warning, composer opens with blank body.
- Loading state — spinner prevents double-click.

## Edge cases NOT handled (known gaps)
- **No rate limiting on the button.** A user can click "Draft AI reply" on 20 emails in rapid succession, each firing an LLM call. The upstream endpoint has its own rate limiting, but the UI doesn't debounce or disable after N concurrent drafts.
- **"Brief" tone is hardcoded default.** The user has no way to select a different tone from the inbox view without opening the contact detail page.
- **Composer is not persisted.** If the user navigates away from the inbox page without sending, the drafted reply is lost.

## Test coverage
- **Unit tests:** none for the inbox page integration.
- **Integration tests:** none.
- **What's not tested:** button visibility logic, API error handling, tone selection fallback.

## Review flags
None — this is a small, low-risk UI surface for an existing capability. The main risk is UX: the button is only shown on "replied" emails, which may confuse users who expect to draft replies to unreplied emails. But that's a product decision, not a code issue.
