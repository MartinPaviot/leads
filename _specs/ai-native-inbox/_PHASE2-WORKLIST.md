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
- [ ] S03 catch-me-up digest — selectCatchUp(core) → a "Catch up since last seen"
      view/banner; lastSeenAt from user_preferences JSONB.
- [ ] T06 no-reply nudge — shouldResurface(core) → surface a nudge on outbound
      threads gone quiet (read-time flag in conversations route + list chip).
- [ ] T07 one-click unsubscribe + block — parseListUnsubscribe(core) → button in
      the Bundles view / handled lane (mailto/http unsubscribe; needs the raw
      List-Unsubscribe header — check capture stores it, else flag).
- [x] T09 bulk keyboard multi-select — selection(core) → x/Shift+x/Esc + per-row
      checkbox + sticky bulk bar (Done/Snooze/Select-all/Clear) (5b40a2fa).
- [ ] Q04 search operators + saved searches — parseSearchQuery(core) → wire into
      the inbox search box; saved searches in user_preferences JSONB.
- [ ] S09 why-line in the LIST — composeWhyLine(core) now that G05 produces
      stage+situation; thread deal-stage into the conversations route per row.

## B. LLM features (injectable-generator + tests; runtime verify deferred)
- [ ] S01 per-thread summary with citations — summarizeThread(messages, generate?)
      on-demand (button) so open spends no token; render a TL;DR card.
- [ ] S08 long-thread TL;DR + key decisions — reuse shouldSummarize/pickKeyMessages
      (core) to pick inputs; same on-demand summarizer as S01 (one helper).
- [ ] C04 rewrite commands (free-form + GTM presets) — rewrite(body, instruction,
      generate?) wired into the composer (a "Rewrite" menu).
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
