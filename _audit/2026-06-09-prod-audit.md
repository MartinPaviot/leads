# Prod product audit — 2026-06-09

Code-grounded audit of the live user-facing surfaces (Playwright blocked: browser profile locked + OAuth login). 3 parallel agents read each page + the API routes it calls to judge REAL wiring, not appearance.

## Headline pattern
The backends are genuinely wired and tenant/soft-delete-correct — **almost no "button → nothing" or wrong-data bugs**. The two systemic problems are:

1. **Automation copy outpaces prod config.** Many "auto / AI / it lands here on its own" promises silently no-op when an env key or worker isn't set in prod: Recall (notetaker), FullEnrich (mobiles), LLM (intelligence), Apollo (sourcing), the IMAP/SMTP inbound sync worker. The UI never says "this is off."
2. **Built-but-orphaned surfaces.** Fully-working intelligence/setup pages are unreachable: Insights + hot-to-call + signals removed from nav (URL-only), capture-approvals has no toggle to ever populate it.

## Priority list

### P0 — broken / blocks a core flow
- **ICP settings save is admin-only → silent 403 for members.** `api/settings/icp/route.ts:51` `requireAdmin`. A non-admin edits the 19-field ICP form (drives scoring/targeting/coaching), hits Save, gets a generic "Failed to save ICP settings" with no reason. Plus `targetRoles` doesn't round-trip — GET returns `deriveTargetRoles()` (computed from seniorities/departments) and masks the saved free-text, so edits "vanish" on reload. → drop/relax the admin gate + reconcile targetRoles read/write.
- **Inbox Inbound is structurally blind.** `api/inbox/route.ts` sources Inbound from `activities.activityType='email_received'`, written only by the IMAP/Gmail sync worker — undeployed in prod. So Inbound is near-permanently empty AND reply detection (replySnippet/repliedAt in Sent) is starved. The reply loop has no input. → confirm an inbound-capture worker writes `email_received` in prod.

### P1 — degraded / misleading
- **Sequences list "Start" sends nothing.** `sequences/page.tsx` flips `status='active'`, but the real send path is drafts→`email.send.queued`→`sequence-draft-to-outbound`. No subscriber turns `status=active` into queued emails → success toast, zero emails. → make Start launch the campaign (or relabel + route to the real trigger).
- **Sending silently falls back to `outbound@resend.dev`** when no mailbox connected (`emails/send/route.ts:24`, `email-send-worker.ts:22`, baked into sequence sends) → mail leaves but lands in spam; no UI warning. → block/warn launch when no active `connectedMailboxes`.
- **Call Mode live transcript/coaching/AMD = empty SSE listeners** (no server emitter, Phase 1) — the cockpit's headline stays blank every call; 2 of 4 queue filters are no-op placeholders. → label "coming after call" until the Media-Streams WS ships; wire/hide the dead filters.
- **Meetings "notetaker auto-joins any call" copy** but bot scheduling hard-skips without `RECALL_API_KEY`; no off-badge. → gate the copy on Recall configured.
- **Contacts "Find mobile"** toasts "searching…" on FullEnrich with 0 credits / no prod key. → surface credit/key state before firing.
- **Mail & Calendar "Force sync now" is Gmail-only** (`api/email/sync` → `fetchRecentEmails`); does nothing for IMAP/SMTP mailboxes — the page's headline feature. → route smtp_custom to the IMAP `email/sync-requested` path.
- **Capture-approvals page is structurally unreachable** — no UI/API ever sets `captureApprovalMode='review'` (default 'auto'), so the human-in-the-loop queue is permanently empty. → add a capture-mode toggle.
- **Orphaned intelligence** — `/insights`, `/insights/hot-to-call`, `/settings/signals` are fully built + wired but removed from nav (URL-only). → re-expose in nav or fold into Home.
- **Proposals = UUID dead-end** — the only way to draft is typing a raw Deal id; no picker. The whole fill pipeline (detect→map→DOCX/PDF) is real but unreachable. → deal search/select dropdown.

### P2 — polish / honesty
- Home brands rule-based heuristics as "AI Intelligence" (`intelligence-brief.tsx:39`); `/api/insights` + `/api/actions` are 100% SQL. → drop "AI" on non-LLM widgets.
- Deal/opportunity intel cards `return null` when empty → "no data" indistinguishable from "not run". → show a "run it" prompt.
- Playbook empty state says entries are "captured automatically" but the extractor is manual-only today.
- Pilae deep-dive panel depends on a weekly cron that may never have run (permanent "No snapshot").

## Tier 0 — config checklist (mostly Martin; unblocks most "fake-auto")
Most P1 "fake-auto" findings are really "key/worker not set in prod." Verify in Vercel prod env / deployment:
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (intelligence, briefs, summaries — June audit said missing in prod)
- `APOLLO_API_KEY` (Find more accounts / extract contacts)
- `RECALL_API_KEY` (notetaker auto-join)
- `FULLENRICH_API_KEY` (set) + **FullEnrich credits** (balance 0) + `FULLENRICH_WEBHOOK_SECRET` (set)
- `PAPPERS_API_KEY` (out of credits)
- **IMAP/SMTP inbound sync worker deployed** (the `feat/imap-smtp-mailbox` path) — gates Inbox Inbound + reply detection
- An active `connectedMailboxes` row for the sender (else resend.dev spam fallback)

## Recommended fix order
1. Tier 0 config audit (you, ~15 min) — confirm which keys/workers are actually live in prod. Half the "broken" is "unconfigured."
2. P0 ICP save admin-gate + targetRoles round-trip (me, small).
3. P1 honesty pass: gate "auto/AI" copy + show off-badges when a key/worker is missing (Recall, FullEnrich, IMAP sync, no-mailbox) — kills the "lies to the user" class in one sweep.
4. P1 wiring: sequences-list Start → real launch; Mail force-sync → IMAP path; proposals deal-picker; re-expose orphaned nav.
