# Phase 2 — finish-ALL worklist

Martin: "continue et finis toutes les specs." Drive to 101/101 *implemented*
(shipped, or prod-covered-and-documented, or ocean-flagged-with-reason).

Bar: tsc + vitest + safe-by-construction (READ-ONLY real mail, no prod
migration, no live Inngest, both co-author trailers, English UI / no provider
names). LLM features ARE buildable here via the injectable-generator pattern
(lazy `import()` of the AI SDK inside `defaultGenerate`, injectable `generate`
for deterministic unit tests, fail-closed) — that's how S02/S06 shipped.
Browser/runtime verify is deferred (Playwright down) and called out per item.

Branch: feat/ai-native-inbox-rendering · worktree C:/Users/marti/leads-wt-inbox.
Ledger = _EXECUTION-LOG.md (append per batch). Update THIS file's checkboxes too.

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
- [ ] S09 why-line in the LIST — composeWhyLine(core) now that G05 produces
      stage+situation; thread deal-stage into the conversations route per row.

## B. LLM features (injectable-generator + tests; runtime verify deferred)
- [x] S01 + S08 thread summary — summarize-thread.ts (injectable, reuses
      pickKeyMessages, citations clamped, fail-closed, 3 tests) + POST
      /api/inbox/conversations/summarize + "Summarize thread" button shown only
      for long threads (shouldSummarize), fetch-on-click (a5ec2578).
- [x] C04 rewrite commands — rewrite.ts (5 GTM presets + free-form, grounded,
      fail-closed, 4 tests) + POST /api/inbox/compose/rewrite + composer "Rewrite"
      menu with one-tap Undo (a3541a37).
- [ ] C07 draft from bullet points — bulletsToDraft(bullets, generate?) in composer.
- [ ] C08 translate / multi-language — translate(body, lang, generate?) in composer.
- [ ] C01/G08 voice-matched full draft — compose(context, generate?) grounded in
      prospect context; the deepest one — do after C04/C07/C08.
- [ ] C05 autocomplete grounded in history — defer if it needs streaming infra
      (flag as interactive if so).
- [ ] C12 inline grammar/autocorrect — lightweight; may fold into C04.
- [ ] C10 scheduling-email drafter — reuse CAL availability + sovereign visio.
- [ ] Q07 Ask-AI scoped to one thread — askThread(thread, question, generate?)
      → a thread Q&A box; cite messages.
- [ ] Q01/Q02/Q05 semantic + whole-inbox + cross-entity Ask-AI — check if the
      existing Elevay chat already covers (cite it); else heavier (embeddings) →
      flag interactive if it needs new vector infra.
- [ ] Q06/Q08 find-file / web-grounded — Q06 depends R04 (ocean); Q08 gated web.

## C. Already PROD-COVERED — verify + document (don't rebuild)
- [P] R01/R02/R03/R05/R06/R07/R08/R09/R10/R13 — Phase 1 rendering suite.
- [P] C02 one-tap replies — /api/emails/suggest-reply (used by the pane).
- [P] C03 auto-draft — prepared-draft path (reply-handler).
- [P] G02 capture, G10 meeting→CRM+visio, G12 voice-of-customer, G13 MCP/skills.
- [P] X01 shared inbox + assignment — unified inbox + ownership PRs.
- [P] P01 pixel block (=R07), P02 link-safety (=R03), P03/P04/P05/P06 — isolation
      audit + sovereign hosting + provenance.
- [P] O01 connect mailbox, CAL03 scheduler, CAL05 visio.
  → For each [P]: add a one-line coverage note to the ledger, mark done.

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

## Completion
When A+B+D are shipped and C+E are documented/flagged, post the final
101/101 disposition to Martin and STOP.
