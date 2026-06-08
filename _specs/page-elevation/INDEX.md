# Page Elevation Campaign — Index

Protocol: `_harness/PAGE-ELEVATION-PROTOCOL.md`. One page at a time, deep. Output: a spec per page
(A intrinsic purpose -> B flow -> C correct model -> D current reality (read+live test) -> E
best-in-market teardown -> F 4-lens scoring -> G PR-FAQ + Kiro tasks RICE).

Order (centrality × gap severity × differentiation):
Tier 1 (chat-first soul + Capture loop): 1 chat · 2 home/up-next · 3 meetings(+post-call) · 4 inbox
Tier 2 (CRM spine): 5 accounts/[id] · 6 contacts · 7 opportunities
Tier 3 (Engage): 8 call-mode · 9 sequences
Tier 4 (Intelligence): 10 insights · 11 knowledge
Tier 5: proposals · skills · notes · tasks · deliverability · reports · merge · brain · accounts(list)

| # | Page | Status | Spec |
|---|---|---|---|
| 1 | /chat | DONE pass-1: live-tested + 2 defects fixed & verified (T13 dup, T3 citations), committed 43e67ecb; elevations=pass 2 | chat/spec.md |
| 2 | / (Up next) | pass-1: approve-route 404 FIXED+verified; fake-AI follow-up templates FIXED (real opener, compile+render verified) — both committed; remaining: rule-based action ranking (pass 2). Behavioral verify blocked by empty test tenant | — |
| 3 | /meetings | pass-1: list->detail link FIXED (compile+render verified; behavioral needs calendar data). Remaining: Recall webhook doesn't auto-trigger post-call (auto-capture broken); 15-min bot window no cron | — |
| 4 | /inbox | pass-1: inbound capture SHIPPED + verified (72ad59bc). Webhook now captures every inbound email as an email_received activity (reuses activities + recordCapturedActivity, no migration); new Inbound tab shows real incoming mail w/ full body. Remaining: cold-inbound triage for wholly-unknown senders (flagged ocean); real webhook gated on Martin connecting a mailbox in EmailEngine | — |

Global flow map + per-page coverage gaps: `_audit/2026-06-06-prelaunch/page-coverage-audit.md`.

## Cross-cutting fixes (found while testing)
- BILLING (commit 12adc481): `plan-limits.countContacts` counted soft-deleted contacts -> tenant
  47dca783 was blocked at "519/100" while 0 contacts were visible; couldn't create contacts. Fixed
  with isNull(deletedAt). Verified 403 -> 201. Also explains the chat "0 contacts" (correct) vs the
  billing block (wrong).
- HOME opener correction (commit 5252c7ee): the follow-up helper read the opener OBJECT as the body
  and would emit a "[placeholder]" skeleton when no signals; now reads .opener.opener + guards.

## Unified intelligent search (cross-page) — Martin directive
Two directives: (1) ONE intelligent search per page, not a smart box + a literal box; (2) it must link
sectors intelligently (medical -> health care) for ALL queries, via an LLM over the REAL distinct
labels — NOT a hardcoded synonym map ("sinon ça marchera une fois sur 10").
- Mechanism: `src/lib/search/industry-match.ts` `matchIndustries(query, industries, tenantId)` — haiku
  (openai fallback) reasons over the tenant's actual distinct industry labels and returns the verbatim
  subset matching the query's sector; [] for company-name queries or no-key. Generalises to any query
  and any dataset; no list to maintain.
- accounts (de1e0d7e): server-side `?search=` resolves industries + name/domain/description ILIKE;
  unified the dual box into one SmartSearchBar; removed dead /api/search/tam + % chips; banner shows
  real matched count. Verified: medical->58, school->68, consulting->60, finance->66.
- contacts (844e870c): industry-aware via the company join (contact has no industry; its company does)
  + title/name/email ILIKE. Verified: "medical" filters 3 -> 1 (Sarah Chen @ Spineart, matched purely
  by company industry).
- opportunities (e95f738d): server-side `?search=` over deal name / account name / company industry;
  count query mirrors the data leftJoin(companies). Verified: "medical" surfaces the Spineart pilot
  (deal name has no "medical"); "finance" empties; clear restores.
- tsc fix (4d80387e): industry-match filter param implicit-any -> web app back to 0 tsc errors.
- Only accounts + contacts had the dual-box anti-pattern; both unified. knowledge/notes/home are
  free-text/command, not sector-style, so out of scope for industry resolution.

## Test environment
- The "E2E Test Workspace" resolves to tenant **47dca783** (real Pilae data: 767 CH/FR accounts;
  most contacts soft-deleted). Login martin@elevay.dev. Behavioral testing is now UNBLOCKED (can
  create contacts after the billing fix). Dev server runs with NODE_EXTRA_CA_CERTS (TLS on, LLM works).
- A seed contact "Sarah Chen <sarah.chen+seed@spineart.com>" exists for testing (clean up at end).

## Session commits (feat/page-elevation) — 12 fixes
c4c237d2 docs · 43e67ecb chat T13(dup)+T3(citations) · 6cb251b4 home approve route 404 ·
5fb314a1 home fake-AI follow-up · 12adc481 billing deleted-contacts block · 5252c7ee home opener
parse · 96817357 meetings list->detail link · 642216f0 chat createDeal->/api/opportunities ·
249731d0 opps Email-contact recipient · 6ecabfd2 sequences reject-modal label ·
d544978c deliverability SPF/DKIM/DMARC UI (verified live on elevay.dev) · 1f3b2717 knowledge search.

Real bugs found by live-testing (not just elevations): billing (deleted contacts blocked creation,
403->201), home opener (object-not-string + placeholder), chat createDeal (404), opps Email-contact
(blank To), deliverability /verify unwired (elevay.dev: DKIM missing + DMARC=none). Seed in tenant
47dca783: contact 6d6bcbbf (Sarah Chen +seed @ Spineart), deal 3770cea8 (Spineart - Pilot $48k).
Dev server up with NODE_EXTRA_CA_CERTS (TLS on, LLM works).

NEXT — the "deep" remainder (bigger/sensitive/data-blocked; do carefully, not as quick grinds):
- meetings: DONE.
  * list->detail link (96817357).
  * auto-post-call: extracted to lib/meetings/post-call.ts (processPostCall); route = thin wrapper;
    webhook (processTranscriptFromBot) auto-runs it on call-end (6f989522; idempotency guard
    ca5b92cc folded in; userId=null -> unassigned tasks; drafts, never sends). Verified live on a
    seeded meeting (process-transcript -> activity 3aaef096): 4 tasks + a 927-char follow-up draft;
    re-run returned alreadyProcessed with zero duplicates. Also fixed a pre-existing crash:
    free-text deadlines ("Friday") -> new Date() -> "RangeError: Invalid time value" on insert.
  * bot scheduling: NOT a defect (coverage-audit false positive). Already cron-driven:
    cronCalendarSync (*/15, meeting-functions.ts) + scheduleRecallBots safety-net (*/5,
    recall-functions.ts). Real dependency = Inngest Cloud must run (prod /api/inngest 500 = no
    Inngest keys, per product-audit memory) -- infra/config, not code.
  Seed left in tenant 47dca783: meeting activity 3aaef096 + its 4 generated tasks (clean up at end).
- inbox: DONE (pass-1). Inbound capture shipped (72ad59bc) — captureInboundEmail() in
  lib/capture/email-capture.ts, wired into the EmailEngine webhook; surfaced via a new Inbound
  tab. Premise-challenge win: an inbound email is an `activities` row (reused recordCapturedActivity
  + the existing capture_approvals seam), so NO new table / NO prod migration. Remaining = cold-
  inbound triage for fully-unknown senders (auto-create vs review queue) — a real ocean, flagged.
  Seeds left for demo: 2 email_received activities for Sarah (messageId seed-msg-inbox-001/002).
- contacts list: DONE (2e0321c2). Column filters (contact/company/email/title/score/linkedin/phone)
  now run server-side via /api/contacts params, so they span ALL contacts (WHERE before LIMIT) not
  the loaded 50-row page; company options sourced from the server (distinct), grades static; client
  passesColumnFilters + dead get() accessors removed. Verified: each filter type returns the right
  subset + page-scope proof (pageSize=1 + fTitle=Test -> total=2) + UI select Spineart -> Sarah.
  Follow-up: NL smart filters still refine client-side; accounts list shares the same latent pattern.
- reports: "Schedule weekly" fires reports/schedule.requested with no Inngest handler. Fix = real
  scheduled-report worker (cron + generate + email) or stop claiming "Scheduled".
Pass-2 = elevations per each page's spec.
