# AI-Native Inbox — spec suite

101 Kiro-style feature specs for the best AI-native *augmented* mailbox. Anchored on
the audit: [`_research/ai-native-mailbox-audit.md`](../../_research/ai-native-mailbox-audit.md).
QA: [`_QA-COVERAGE.md`](./_QA-COVERAGE.md) (101/101 PASS).

**Thesis:** Superhuman's speed + Shortwave's AI-everywhere + Missive's autonomy rules
+ Lightfield's cited GTM memory + Monaco's deal intelligence + our sovereignty angle.
We don't imitate Gmail — we augment it with cited GTM context (the moat, theme T7).

## How to read a spec
Each file is `<ID>.md` (e.g. `INBOX-R01.md`) and follows the template below. The
"expectations" are deliberately exhaustive — that's the point of this exercise.

### Per-spec template (every spec MUST follow this)
```
# <ID> — <Title>
> Theme: <T#> · Autonomy rung: <passive|helper|proactive|agent> · Priority: <P0|P1|P2>
> Pillar: <P1 fidelity | P2 reading | P3 writing | P4 triage | P5 GTM moat | cross>

## User story
As a <role>, I want <capability>, so that <outcome>.

## Why (audit anchor)
1–3 lines tying this to the audit (who does it best today, the bar to beat).

## Requirements (EARS)
- The system SHALL/ WHEN <trigger> the system SHALL <response> … (5–12 EARS lines)

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN <context> WHEN <action> THEN <observable result> (5–10 scenarios)

## Edge cases & failure handling
- bullet list (empty/oversized/malformed/offline/permission/multi-tenant/etc.)

## Best-in-class bar
What makes ours better than Superhuman/Shortwave on THIS feature (1–4 bullets).

## Design sketch
- Data: tables/columns touched (cite real schema where known)
- API: endpoints/handlers (cite real routes where known)
- UI: where it lives, key interactions, keyboard shortcut
- AI: model role, grounding/citation source, autonomy dial behaviour
- Failure/perf/security notes

## Tasks (ordered, each with a verify step + test to write)
1. … (verify: …) (test: …)

## Current-state notes
What exists today in our code (file:line) and what's missing. NEVER assume — these
must be verified against the live code before building.
```

## Conventions baked into every spec
- No emojis in UI (icons only). No provider names shown to users ("sourced by Elevay").
- Per-user/tenant scoping is mandatory (inbox is personal; `lib/inbox/user-scope.ts`).
- Every AI claim carries a citation / "why"; every autonomous action is auditable.
- Sovereign-friendly (Pilae): self-hostable, EU/CH data residency, zero-retention AI option.
- Bookings ≠ ARR; deal split rules; Pilae anti-creep — per CLAUDE.md/code-review conventions.

## Catalog (101 specs)

### T1 — Rendering & fidelity (P1, table stakes we currently fail)
- INBOX-R01 — Sanitized HTML body rendering (no more plain-text pane)
- INBOX-R02 — Inline images + remote-image privacy proxy
- INBOX-R03 — Safe clickable links (rewrite, hover-preview, phishing warn)
- INBOX-R04 — Attachments: list, inline preview, download
- INBOX-R05 — Quote/signature collapse & thread folding
- INBOX-R06 — Sender identity (avatar / company logo / verified domain)
- INBOX-R07 — Tracking-pixel blocking (default-on)
- INBOX-R08 — Dark-mode email rendering
- INBOX-R09 — Plaintext & malformed-MIME graceful fallback
- INBOX-R10 — Unicode / RTL / emoji correctness
- INBOX-R11 — Large-email & long-thread virtualization (perf)
- INBOX-R12 — Calendar invite (.ics) inline render + RSVP
- INBOX-R13 — Capture: retain full HTML + text at ingestion (fix `imap.ts`)

### T2 — Triage, lanes & rules (P4)
- INBOX-T01 — Smart lanes / Split Inbox (VIP, team, tools, custom queries)
- INBOX-T02 — Plain-English AI filters (label / star / archive)
- INBOX-T03 — Newsletter & promo bundles + bulk triage
- INBOX-T04 — AI importance / priority score
- INBOX-T05 — Snooze + AI-suggested resurface time
- INBOX-T06 — Follow-up / no-reply nudge reminders
- INBOX-T07 — One-click unsubscribe + block
- INBOX-T08 — Replace the sales-label badge with an honest AI one-liner
- INBOX-T09 — Bulk keyboard triage (multi-select actions)
- INBOX-T10 — Auto-archive / done + computed reopen (extend existing lanes)
- INBOX-T11 — Per-rule autonomy dial (suggest → auto)

### T3 — AI reading & summarization (P2)
- INBOX-S01 — Per-thread summary with citations
- INBOX-S02 — Per-message summary (top of email)
- INBOX-S03 — Catch-me-up digest (since last seen)
- INBOX-S04 — Action-item / todo extraction
- INBOX-S05 — Entity extraction (people / companies / dates / amounts)
- INBOX-S06 — General intent & sentiment (not sales-only)
- INBOX-S07 — Attachment summarization (PDF / doc)
- INBOX-S08 — Long-thread TL;DR + key decisions
- INBOX-S09 — "Why this matters" rationale line (replaces cryptic badge)

### T4 — AI compose & reply (P3)
- INBOX-C01 — Voice-matched full draft (learns your style)
- INBOX-C02 — Instant one-tap replies (3 suggestions)
- INBOX-C03 — Auto-draft (pre-written, unprompted, staged for approval)
- INBOX-C04 — Rewrite commands (shorten / lengthen / simplify / tone)
- INBOX-C05 — Intelligent autocomplete grounded in your history
- INBOX-C06 — Snippets / templates with variables + CC/BCC + attachments
- INBOX-C07 — Draft from bullet points
- INBOX-C08 — Translate / multi-language compose
- INBOX-C09 — Follow-up generator (sequence-aware)
- INBOX-C10 — Scheduling-email drafter (availability-aware)
- INBOX-C11 — Undo send + send later
- INBOX-C12 — Inline grammar / autocorrect

### T5 — Search & Ask-AI with citations (P2/P5)
- INBOX-Q01 — Natural-language semantic search
- INBOX-Q02 — Ask-AI over the whole inbox with citations
- INBOX-Q03 — Search over attachments
- INBOX-Q04 — Search operators + saved searches
- INBOX-Q05 — Cross-entity search (inbox × CRM)
- INBOX-Q06 — "Find that file/attachment" intent
- INBOX-Q07 — Ask-AI scoped to a single thread
- INBOX-Q08 — Web-grounded fresh-fact answers (gated)

### T6 — Speed & keyboard-first UX (cross-cutting)
- INBOX-K01 — Command palette (Cmd+K) — everything
- INBOX-K02 — Full keyboard shortcut map + cheatsheet
- INBOX-K03 — Zero-latency optimistic UI
- INBOX-K04 — Instant navigation / prefetch
- INBOX-K05 — Quick-switch accounts / mailboxes
- INBOX-K06 — Keyboard triage flow (j/k/e/#/r)
- INBOX-K07 — Customizable shortcuts

### T7 — GTM / CRM augmentation & autonomy (P5, the moat)
- INBOX-G01 — Contact / company / deal sidebar with citations
- INBOX-G02 — Auto-capture to CRM (approval-gated, human-in-the-loop)
- INBOX-G03 — Last-interaction + relationship timeline
- INBOX-G04 — Signal surfacing (funding / hiring / intent) in-thread
- INBOX-G05 — Suggested next action tied to deal stage
- INBOX-G06 — Collision awareness (teammate already on it)
- INBOX-G07 — Sequence-reply linking + reply classification
- INBOX-G08 — Drafts grounded in the prospect's real context
- INBOX-G09 — Create / advance a deal from a reply
- INBOX-G10 — Meeting-booked → CRM + sovereign visio
- INBOX-G11 — Autonomous triage rules tied to ICP / persona
- INBOX-G12 — Voice-of-customer rollup across threads
- INBOX-G13 — MCP server + agent Skills (GTM-grounded inbox/CRM)

### T8 — Collaboration & shared inbox
- INBOX-X01 — Shared inbox + per-message assignment
- INBOX-X02 — Team comments / @mentions (private)
- INBOX-X03 — Shared threads (live presence)
- INBOX-X04 — Shared labels / AI-searchable archive
- INBOX-X05 — Shared snippets & AI prompts
- INBOX-X06 — Handoff + internal notes

### T9 — Calendar & scheduling
- INBOX-CAL01 — Inline availability insertion
- INBOX-CAL02 — One-click book / event-from-email
- INBOX-CAL03 — AI meeting scheduler (end-to-end)
- INBOX-CAL04 — RSVP / reschedule from inbox
- INBOX-CAL05 — Sovereign visio link injection

### T10 — Notifications, focus & digests
- INBOX-N01 — Smart notifications (only important)
- INBOX-N02 — Morning brief + end-of-day wrap digest
- INBOX-N03 — Do-not-disturb / focus mode
- INBOX-N04 — No-reply / SLA-breach alerts
- INBOX-N05 — Mobile parity (responsive)

### T11 — Privacy, security, trust & sovereignty
- INBOX-P01 — Tracking-pixel & remote-content controls
- INBOX-P02 — Link-safety / phishing warnings
- INBOX-P03 — AI data handling & opt-out (zero-retention)
- INBOX-P04 — Data residency / sovereign hosting (Pilae)
- INBOX-P05 — Per-user isolation & tenant-scoping audit
- INBOX-P06 — Citations & provenance everywhere

### T12 — Onboarding, settings & personalization
- INBOX-O01 — Connect mailbox (Google / MS / IMAP / Zimbra)
- INBOX-O02 — AI memory / standing instructions
- INBOX-O03 — Voice / tone calibration
- INBOX-O04 — Interactive keyboard tutorial / onboarding
- INBOX-O05 — Customizable layout / themes / density
- INBOX-O06 — Per-feature autonomy settings hub

## Status
- [x] Audit (`_research/ai-native-mailbox-audit.md`)
- [x] Taxonomy + index + template (this file)
- [x] 101 spec files authored (R/T/S/C/Q/K/G/X/CAL/N/P/O — all themes complete)
- [x] QA coverage matrix (`_QA-COVERAGE.md`) — 101/101 PASS (structure, conventions, traceability)
