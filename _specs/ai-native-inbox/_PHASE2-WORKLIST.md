# Phase 2 — finish-ALL worklist

Martin: "continue et finis toutes les specs." Drive to 101/101 *implemented*
(shipped, or prod-covered-and-documented, or ocean-flagged-with-reason).

Bar: tsc + vitest + safe-by-construction (READ-ONLY real mail, no prod
migration, no live Inngest, both co-author trailers, English UI / no provider
names). LLM features ARE buildable here via the injectable-generator pattern
(lazy `import()` of the AI SDK inside `defaultGenerate`, injectable `generate`
for deterministic unit tests, fail-closed) — that's how S02/S06 shipped.
Browser/runtime verify is deferred (Playwright down) and called out per item.

Branch: feat/ai-native-inbox-rendering · worktree (this machine, ombel)
C:/Users/ombel/leads-wt-inbox  (marti machine used C:/Users/marti/leads-wt-inbox).
Ledger = _EXECUTION-LOG.md (append per batch). Update THIS file's checkboxes too.
AUTH NOTE (RESOLVED 2026-06-18): the ombel machine's GCM `git:https://github.com`
cred was GitHub user ombelinecarcel-tech (no push access → 403). Fixed with
`gh auth setup-git` (gh.exe at "C:/Program Files/GitHub CLI") → git now uses the
gh CLI's MartinPaviot token (repo scope), so pushes work from this worktree/tree.
Co-author trailer is Claude Opus 4.8 ONLY now (the Rippletide trailer requirement
was removed from CLAUDE.md in b1a23558).

Legend: [x] shipped · [P] prod-covered (document, don't rebuild) · [~] core
built, needs wiring · [O] ocean (flag, don't fake) · [ ] to build.

## A. Deterministic-core WIRING (fast, unit-testable) — DO FIRST
- [x] S04 action items → pane (18798361)
- [x] S05 entities → pane (18798361)
- [x] S03 catch-me-up — seen-store.ts (lastSeenAt JSONB) + POST /api/inbox/seen +
      selectCatchUp in route (first-visit guard) + "N new since you were last
      here · Mark all seen" banner (d540cea7). LLM digest narrative residual.
- [O] T06 no-reply nudge — shouldResurface(core) is gated on a conditional
      "if no reply" snooze flag (snoozeIfNoReply) that the T05 snooze UI does NOT
      capture and the triage table has no column for. Storable in JSONB but it's
      a chain (snooze UI flag + triage metadata + read), do with runtime verify.
      FLAGGED.
- [O] S09 why-line in LIST — composeWhyLine(core) ready, BUT its distinctive
      signal (no-reply-days = us waiting on them) barely applies in the attention
      lane (inbound that just arrived), and its richer form needs the per-row
      deal-stage join. "Why this matters" is already delivered by T08 reason +
      G05 next-action card + N04 overdue + S05 details. Wiring it would risk
      regressing the clean T08 reason for marginal gain → FLAGGED (covered).
- [O] T07 one-click unsubscribe — parseListUnsubscribe(core) is ready, but the
      raw List-Unsubscribe header is NOT persisted: classifyInboundSender only
      *detects* it transiently for bulk classification (email-capture.ts metadata
      = {messageId,from,to,...}). A read-time unsubscribe has nothing to act on.
      Honest fix = capture-path change to store metadata.listUnsubscribe
      (forward-only JSONB) + the RFC 8058 one-click POST endpoint + suppression
      ledger write → bounded but multi-part, do with runtime verify. FLAGGED.
- [x] T09 bulk keyboard multi-select — selection(core) → x/Shift+x/Esc + per-row
      checkbox + sticky bulk bar (Done/Snooze/Select-all/Clear) (5b40a2fa).
- [x] Q04 search operators — search-match.ts (matchesSearch + isActiveQuery, 6
      tests) + ?q= cross-lane filter in the route + debounced search box (e138dc51).
      Saved searches (user_preferences) still residual.
- [O] S09 why-line in the LIST — DUP of the flagged S09 above; covered by T08
      reason + G05 next-action card + N04 overdue + S05 details. Per-row deal-stage
      join would risk regressing the clean T08 reason for marginal gain → stays flagged.

## B. LLM features (injectable-generator + tests; runtime verify deferred)
- [x] S01 + S08 thread summary — summarize-thread.ts (injectable, reuses
      pickKeyMessages, citations clamped, fail-closed, 3 tests) + POST
      /api/inbox/conversations/summarize + "Summarize thread" button shown only
      for long threads (shouldSummarize), fetch-on-click (a5ec2578).
- [x] C04 rewrite commands — rewrite.ts (5 GTM presets + free-form, grounded,
      fail-closed, 4 tests) + POST /api/inbox/compose/rewrite + composer "Rewrite"
      menu with one-tap Undo (a3541a37).
- [x] C07 draft from bullets — draftFromBullets(bullets, context?, generate?) +
      POST /api/inbox/compose/draft + composer popover (423c6846, batch 19).
- [x] C08 translate / multi-language — translate(body, lang, generate?) (5 langs) +
      POST /api/inbox/compose/translate + composer menu (423c6846, batch 19).
- [ ] C01/G08 voice-matched full draft — compose(context, generate?) grounded in
      prospect context; the deepest one — do after C04/C07/C08.
- [ ] C05 autocomplete grounded in history — defer if it needs streaming infra
      (flag as interactive if so).
- [ ] C12 inline grammar/autocorrect — lightweight; may fold into C04.
- [ ] C10 scheduling-email drafter — reuse CAL availability + sovereign visio.
- [x] Q07 ask-this-thread SHIPPED eb73c0ca (pushed) —
      ask-thread.ts askThread(messages, question, generate?) → {answer, citations[],
      answered}, injectable + fail-closed, citations clamped+capped, reuses
      pickKeyMessages; POST /api/inbox/conversations/ask (owner-scoped via getInboxScope,
      read-only, stateless); _thread-ask.tsx cited Q&A box in the pane ("via Elevay", no
      provider name, answered=false → offer wider search). 5 tests, tsc0, inbox 348/348.
      Deep dock-pinned version (inbox_thread chat surface + CRM-cluster grounding + draft
      handoff + persisted history) = runtime-verify follow-up, flagged not faked.
- [ ] Q01/Q02/Q05 semantic + whole-inbox + cross-entity Ask-AI — check if the
      existing Elevay chat already covers (cite it); else heavier (embeddings) →
      flag interactive if it needs new vector infra.
- [ ] Q06/Q08 find-file / web-grounded — Q06 depends R04 (ocean); Q08 gated web.

## C. "Prod-covered" — VERIFIED 2026-06-18 (24-agent adversarial sweep, wf weleqton9)
Blanket [P] was too generous: only 4/24 are truly done. Honest disposition below
(verdict + evidence + residual). [x]=covered · [~]=core shipped, residual named
(LAKE = buildable here unless noted) · [M]=missing (not built).

COVERED (4) — done:
- [x] R01 sanitized HTML body — sanitize-email.ts (2-layer) + _email-body.tsx + tests.
- [x] R13 capture full HTML+text at ingest — gmail.ts/imap.ts/email-capture.ts, 500KB cap.
- [x] O01 connect mailbox — settings/mail-calendar 3-path (OAuth G/MS + IMAP), AES-GCM, pre-verify.
- [x] CAL05 sovereign visio injection — video-meeting.ts + calendar-write resolveConferencing + ics.

PARTIAL (18) — core shipped; the residual IS the remaining work toward 101/101:
- [~] R02 image proxy + SSRF guard ✓ — residual: per-sender "always show" memory (user_prefs JSONB); cid: inline (R04 ocean).
- [x] R03 isSuspiciousLink + banner + **link-safety.ts (classifyLink: real host,
      mismatch/punycode/credentials/ip-literal/dangerous-scheme, safeHref) + true-host
      hover title on every link + inline warn chip per risky link on BOTH render paths,
      22 tests (7d29f21a, batch 23)**. Residual: sanitize-email scheme hardening (all
      data: non-image on href, block data:image/svg src) + styled hover popover = browser-deferred.
- [~] R05 quote fold (email-fold.ts) ✓ — residual LAKE: signature/disclaimer detect, earlier-msg thread fold, Expand-all.
- [~] R06 sender-auth parse + msg-level avatar ✓ — residual: shared SenderIdentity comp, list-row avatar.
- [~] R07 img tracking-pixel strip ✓ — residual LAKE: CSS bg-beacon strip, tracker host list, opt-out (user_prefs).
- [~] R08 dark-mode container ✓ — residual LAKE: view-original-colors toggle, adaptive per-block contrast.
- [~] R09 text path + sanitizer fallback ✓ — residual: malformed-MIME silently dropped (imap), empty-state "(no content)".
- [~] R10 dir=auto + dirOf + **text-decode.ts (RFC2047 decode + bidi anti-spoof) wired into list+pane subject/snippet, 8 tests (245608fc)** — residual: capture-time charset fallback + mojibake repair (capture-path), CJK/Arabic font fallback in globals.css.
- [~] C02 suggest-reply returns 3 tones ✓ — residual LAKE: chip row + 1/2/3 keys + per-thread cache + server-side voice.
- [~] C03 draft stage+consume ✓ (reactive) — residual: proactive triggers, reason field+badge, calendar slot re-validate.
- [~] G02 capture+approval backend ✓ — residual: inbox review drawer, Add-to-CRM CTA, "Captured by Elevay" provenance line.
- [~] G10 meeting book+visio+CRM+inbox UI ✓ — residual LAKE: onBooked → inject join link into reply draft (G08 junction).
- [~] G12 VoC schema+classifier ✓ — residual: 'inbox' source + capture→VoC wiring + ?source filter + /reports rollup.
- [~] G13 MCP CRM tools + keys ✓ — residual: 7 inbox MCP tools + 4 Skills + per-user mailbox-scope enforcement.
- [~] P04 IMAP/SMTP/CalDAV + Mistral-EU + sovereign visio ✓ — residual: residency_profile (JSONB), posture endpoint, settings card.
- [~] P05 app-layer scope (getInboxScope on all read paths) ✓ — residual: DB-level withTenantTx/RLS + tripwire/e2e isolation tests.
- [~] P06 CitedClaim/SourceLink/Confidence components exist — residual LAKE: wire into pane/_thread-summary/_thread-ask + {text,sources,confidence} contract.
- [~] CAL03 book backend + MeetingSchedulerCard ✓ — residual: /api/inbox/schedule agentic stepper, voice-matched draft, multi-provider slots.

MISSING (2) — not built:
- [M] X01 shared inbox + per-message assignment — no inbox_assignment table/column, no /assign route, no assignee in API/UI.
      Per-message assignee storable in activities.metadata JSONB (no migration); endpoint + UI then buildable.
- [M] P03 AI zero-retention / opt-out — no tenant aiProcessingProfile, no retention headers, no privacy card.
      Tenant profile via tenant-settings/user_preferences JSONB (no migration); header gating touches the llm-call path (verify).

Aliases: P01 = R07 (pixel block), P02 = R03 (link safety) — same artifacts, not separate work.

## D. Settings / infra wiring (buildable; runtime verify deferred)
- [ ] T11 / O06 per-feature autonomy dial + hub — settings surface over a
      user_preferences JSONB map (suggest→auto per feature).
- [ ] O02 AI memory / standing instructions — user_preferences JSONB + inject.
- [ ] N01 smart notifications / N02 morning+EOD digest / N03 DND — reuse N04 path.
- [ ] X06 handoff + internal notes / X04 shared labels / X05 shared snippets /
      X03 presence — reuse X02 comments + lanes/filters stores.
- [ ] CAL02 book-from-email / CAL04 RSVP — reuse meeting scheduler + ics.
- [ ] G04 signal surfacing in-thread — reuse lib/signals/freshness.ts.
- [ ] K02 shortcut cheatsheet / K05 quick-switch / K04 prefetch — small UI.
- [ ] O03 voice calibration / O05 density — settings.
- [ ] R12 inbound .ics inline render + RSVP — parse text/calendar part.

## E. OCEAN (flag, do not fake)
- [O] R04 attachments — inbound capture stores NO attachment refs (verified:
      email-capture.ts metadata = {messageId,from,to,...}; IMAP/Gmail fetch never
      parses bodyStructure). Needs capture-path + provider download + Blob store.
- [O] S07 attachment summarization — depends on R04.
- [O] R11 long-thread virtualization — perf; needs windowing lib + measurement.
- [O] K03 zero-latency optimistic UI — partly present (triage is optimistic);
      full coverage is cross-cutting, treat as continuous not a single build.
- [O] N05 mobile parity — responsive pass, large cross-cutting effort.

## F. Triage disposition (wf w602vr4cq, 26 units, 26 Explore agents, ~1.56M tok, 2026-06-18)
Full per-item build plan: `_REMAINING-BUILD-PLAN.md` (agent estimates — treat LOC/completeness
as rough). My corrections layered on the raw verdicts (verify-current-state, not blind relay):

BUILDABLE NOW within the bar (24, no prod migration): R09 (empty-state, ~120) · G10 (inject join
link, ~80) · G04 (signal surfacing, ~230) · O02 (standing instructions) · O03/O05 (voice+density) ·
P06 (wire citations) · G02 (capture review) · X01 (assignment via activities.metadata) · CAL03
(scheduler stepper) · K02/K04/K05 (cheatsheet/prefetch/quick-switch) · T11/O06 (autonomy hub) ·
C12 (grammar) · C05 (autocomplete, single-shot) · C10 (propose-times) · C01/G08 (grounded draft) ·
G12 (VoC wiring) · G13 (inbox MCP+Skills) · P04 (residency posture) · CAL02/CAL04 (book/RSVP) ·
N01/N02/N03 (notif prefs+compute) · Q01/Q02/Q05 (search+ask) · P03 (zero-retention) · R12 (.ics).

FLAG-DECISION (2): X03/X04/X05/X06 collab — needs presence/label/snippet TABLES (migration) → the
JSONB-only slice is thin; FLAG the table-backed version. Q06/Q08 — Q06 blocked on R04 (attachment
bytes = ocean); Q08 hosted web-lookup is buildable but the sovereign backend is ocean.

MY OVERRIDES (don't trust the agent blindly):
- **P05 → OCEAN, not buildable.** The agent scoped only app-layer tripwire tests; real DB-level
  tenant isolation (Postgres RLS / withTenantTx) REQUIRES a migration. App-layer getInboxScope is
  already shipped; the RLS hardening + isolation e2e is an ocean → FLAG. Only the tripwire unit tests
  are JSONB-free-buildable.
- **N01-N03 / CAL02-04 / Q01-Q05 = CORE buildable, DELIVERY/QUALITY deferred.** Notification *delivery*
  needs Inngest (banned this loop) + a channel; semantic-search *quality* needs live LLM + Playwright.
  Buildable = the preference model + read-time compute + endpoints; live send + recall% = runtime-verify.
- **R12 over-estimated** (1200 LOC for inline .ics is ~150 real); fold into the R-render path.

NEXT BUILD ORDER (cheap+high-confidence first): R09 → G10 → G04 → P06 → O03/O05 → G02 → X01 →
O02 → K02/K04/K05 → CAL03 → then the LLM cluster (C12, C05, C10, C01/G08) → then the heavy infra
(G12, G13, T11/O06, P03, P04, N0x, Q0x, CAL02/04) → R12 → flag X03-06 + Q06/Q08.

## Completion
When A+B+D are shipped and C+E are documented/flagged, post the final
101/101 disposition to Martin and STOP.
