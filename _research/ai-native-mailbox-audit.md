# AI-Native Mailbox — Audit (2026-06-16)

Purpose: define, precisely, what an AI-native *augmented* mailbox is, so we can
spec the best one. Sources below; signup-wall caveat first.

## Method & sources
- **Superhuman Mail** — product + features pages (Playwright + fetch). Signup is
  **OAuth-only ("Continue with Google" / "Continue with Microsoft")** then a paid
  plan; no self-serve trial without connecting a real mailbox + card. Screenshot:
  `_research/teardown-superhuman/screenshots/superhuman-signup-wall.jpeg`. So the
  in-app teardown needs Martin's OAuth/card; this audit is built from Superhuman's
  own feature/help/marketing surfaces + expert reviews, **Shortwave** (open,
  AI-native), **Missive** (autonomy taxonomy), **Fyxer**, plus our existing
  **Lightfield** and **Monaco** teardowns (the GTM-augmentation references).
- Superhuman was acquired by **Grammarly (Oct 2025)**; the suite is now Docs/Mail/AI
  ("Superhuman Go" assistant). Mail remains the relevant artifact.

## 1. The autonomy spectrum (the single most important axis)
Every AI-email capability sits on a ladder; "AI-native" means we deliberately place
each feature on a rung and let the user move it up as trust grows.

1. **Passive filter** — behavioural sort, no generation (SaneBox). Moves noise out.
2. **Inbox helper** — generates on request, human sends (Superhuman, Shortwave, Copilot).
   Summaries, ask-AI, draft-on-click, suggested replies.
3. **Proactive assistant** — pre-computes without being asked, staged for approval
   (Superhuman Auto-Drafts, Shortwave Autopilot/AI Filters). A draft is *waiting*.
4. **Autonomous agent** — reads inbound and acts (route, label, draft, even send)
   under rules (Missive AI Rules, Fyxer server-side, Canary routing). Rare for *send*.

**Design rule:** ship every AI feature with an explicit autonomy dial + a visible
"why" (citations / rule that fired) so the user can audit and escalate trust. This
is the human-in-the-loop spine Lightfield is built on (approve captured data).

## 2. Master capability taxonomy (deduped across all products)
Reading: **summarize** (thread/message/attachment), **catch-me-up digest**,
**classify/auto-label**, **importance/priority score**, **action-item / todo
extraction**, **sentiment & intent**, **entity extraction** (people/companies/dates/$).
Writing: **draft full reply (voice-matched)**, **instant one-tap replies**,
**auto-draft (pre-written, unprompted)**, **rewrite (shorten/lengthen/simplify/tone)**,
**intelligent autocomplete (real facts/links from history)**, **snippets/templates
with variables + CC/BCC/attachments**, **translate**, **follow-up generator**.
Search/ask: **semantic search**, **ask-AI-over-inbox-with-citations**,
**search-over-attachments**, **operators**, **saved searches**.
Triage/flow: **split inbox / smart lanes**, **bundles (bulk newsletter triage)**,
**snooze (+AI-suggested time)**, **follow-up reminders (no-reply nudge)**,
**block/one-click unsubscribe**, **read statuses / link tracking**.
Autonomy/rules: **plain-English AI filters**, **auto-route/assign**, **AI memory
(custom standing instructions)**, **autonomous send (gated)**.
Collaboration: **shared inbox + assignment**, **team comments/mentions**,
**shared threads (live)**, **shared labels (AI-searchable archive)**, **shared
snippets/prompts**, **collision avoidance**.
Calendar: **availability insertion**, **one-click book / event-from-email**,
**AI meeting scheduler (drafts the scheduling email)**, **RSVP/reschedule**.
Compose ergonomics: **autocorrect**, **undo send**, **send later**, **command
palette (Cmd+K)**, **full keyboard control**, **social/sender insights**, **instant intros**.
Context: **pull external data (CRM/billing/docs) into a reply** (Missive MCP),
**auto-BCC CRM** (Shortwave), **web browsing for fresh facts** (Shortwave).

## 3. Per-product matrix (who does what, sharply)
- **Superhuman**: speed + keyboard-first (Cmd+K, shortcuts), Split Inbox, Snippets,
  Send Later, Snooze, Read Statuses (device too), Social Insights, Autocorrect,
  Collision Avoidance, calendar/event-from-email; AI = Ask AI, Auto Summarize,
  Instant Reply, **Auto-Drafts** (pre-written, Business tier), Auto-Labels, rewrite
  commands, voice-learning. Thesis: *the fastest inbox*, AI bolted onto speed.
- **Shortwave**: AI-first architecture — AI summary on **every** email, Ask-AI over
  **all team mail + attachments**, **AI Filters** (plain-English scripts that label/
  star/archive), Ghostwriter voice drafting, **intelligent autocomplete with real
  links/facts from your history**, AI memory (standing instructions), AI web
  browsing, AI snooze, Bundles, Split Inbox, Email-to-Todo, shared threads/labels/
  comments/assignment, auto-BCC CRM. Thesis: *AI is the inbox*.
- **Missive**: team-first + **AI Rules** (auto-route/draft on inbound), **MCP
  integrations** (Notion/Linear/Stripe — pull context into replies), semantic
  canned-response search, shared prompts. Thesis: *autonomous team workflows*.
- **Fyxer**: server-side sort + voice-matched drafts + meeting-note automation
  (overlay on Gmail/Outlook). Thesis: *agent that preps your inbox before you arrive*.
- **Lightfield** (our teardown): zero manual entry, **auto-capture every interaction**,
  schema-less customer memory, **NL queries on the pipeline WITH CITATIONS**, ~95%
  recall, auto-summaries, **human-in-the-loop approval** of captured data.
- **Monaco** (our teardown): auto-built TAM, ML scoring, signal prioritization, AI
  outbound, deal coaching, proactive BI. (Not a mailbox, but the GTM intelligence bar.)

## 4. The five pillars of an AI-native *augmented* mailbox
P1 — **Faithful mailbox** (table stakes we currently fail): sanitized HTML render,
inline images + remote-image privacy proxy, clickable safe links, attachments
(preview/download), threading & quote-collapse, sender identity (avatar/logo/verified),
signatures, dark-mode email, tracking-pixel blocking, Unicode/RTL, big-email perf.
P2 — **AI reading**: per-thread + per-message summary with citations, catch-me-up,
priority score, intent/sentiment, action-item & entity extraction.
P3 — **AI writing**: voice-matched drafting, instant replies, auto-drafts, rewrite,
autocomplete grounded in *your* history, snippets, follow-up & scheduling drafts.
P4 — **AI triage & autonomy**: smart lanes / split inbox, plain-English rules,
bundles, snooze (+AI time), no-reply nudges, one-click unsubscribe, the autonomy dial.
P5 — **GTM augmentation (our moat)**: every thread shows the contact/company/deal
with **citations**, auto-captures to CRM (approval-gated), surfaces signals + last
interaction + collision, ties replies to deal stage and suggests the next action,
links to sequences, drafts grounded in the prospect's real context. This is where we
**beat Gmail/Superhuman** instead of imitating them — Lightfield's recall + Monaco's
intelligence, inside the inbox.
Cross-cutting: **Speed/keyboard-first** (Cmd+K, everything keyboard, zero-latency
feel, undo send) and **Trust** (citations, "why", data residency/sovereign, privacy).

## 5. Gap analysis vs Elevay's current inbox (this session's findings)
- **Rendering**: capture keeps `parsed.text || parsed.html` (HTML discarded) and the
  pane renders plain text in `<p whitespace-pre-wrap>` → no links/images/formatting/
  logos. Fails P1 entirely. (`imap.ts:124`, `_conversation-pane.tsx:471`.)
- **Labels**: the `reason` badge is a **sales-reply taxonomy** (`REASON_BY_LABEL`)
  applied to all mail → nonsense on general/automated mail; "Replied" is a misleading
  fallback. Fails P2/P4 (wrong abstraction).
- **AI reading**: thread summary/catch-up/priority/action-items — absent.
- **AI writing**: a prepared-draft exists (good seed) but no rewrite/autocomplete/
  voice/snippets/follow-up generator.
- **Triage**: lanes exist (attention/handled/snoozed/done) — a real seed; but no
  split-inbox/bundles/rules/AI-snooze/unsubscribe.
- **GTM augmentation (P5)**: partial — collision awareness + last-interaction +
  capture pipeline exist; not surfaced as an inbox sidebar with citations + next action.
- **Speed**: no command palette / keyboard-first; no undo-send/send-later in inbox.

## 6. "Best of all" synthesis → spec themes
The best inbox = **Superhuman's speed + Shortwave's AI-everywhere + Missive's
autonomy rules + Lightfield's cited GTM memory + Monaco's deal intelligence**, with
**sovereignty/trust** (our Pilae angle) as a first-class differentiator. The spec
suite (`_specs/ai-native-inbox/`) is organised into these themes; target 50–100 specs:

- T1 Rendering & fidelity (P1)
- T2 Triage, lanes & rules (P4)
- T3 AI reading & summarization (P2)
- T4 AI compose & reply (P3)
- T5 Search & Ask-AI with citations (P2/P5)
- T6 Speed & keyboard-first UX (cross-cutting)
- T7 GTM/CRM augmentation & autonomy (P5) — the moat
- T8 Collaboration & shared inbox
- T9 Calendar & scheduling
- T10 Notifications, focus & digests
- T11 Privacy, security, trust & sovereignty
- T12 Onboarding, settings & personalization (AI memory)

Each spec: user story · EARS/GIVEN-WHEN-THEN acceptance · edge cases · the
*best-in-class bar* (what beats Superhuman/Shortwave) · design + tasks pointer.

## Sources
- https://superhuman.com/mail · https://superhuman.com/mail/signup
- https://www.shortwave.com
- https://missiveapp.com/blog/ai-email-assistant
- https://gmelius.com/blog/superhuman-ai-review
- Reviews: ventureburn, salesforge, work-management.org, clean.email, efficient.app
- Internal: `_research/teardown-lightfield/`, `_research/teardown-monaco/`, this session's inbox code findings
