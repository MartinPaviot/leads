# INBOX-P06 — Citations & provenance everywhere ("via Elevay", never a vendor)
> Theme: T11 · Autonomy rung: passive (governs every AI/enrichment surface) · Priority: P0
> Pillar: cross (trust) — governs P2 reading / P3 writing / P5 moat

## User story
As a user trusting an AI-augmented inbox with revenue decisions, I want every AI claim and every
enriched fact to carry a verifiable provenance — what it's based on, how confident it is, and "via
Elevay" rather than a vendor's name — so I can audit any statement before acting, and never see a
third-party data broker surfaced in my workflow.

## Why (audit anchor)
Citations are the Lightfield bar (95% recall **with citations**) and the spine of the whole suite —
"every AI claim carries a citation / why" is a baked-in convention (README §Conventions; UI-DNA
"Citations / 'why' on every AI claim"). The Superhuman teardown shows its AI *explains itself*
(reasoning steps before a draft, `findings.md` §I; "checks your writing style first", deep-dive §AI-reply)
but it does not cite **sources** for facts, and its sidebar surfaces social vendors (LinkedIn/GitHub).
We already own the primitives: a 4-state confidence chip
(`components/ai-ui/confidence-state.tsx` — `verified|likely|uncertain|unverified`, `isVisibleAtDefault`
hides low-confidence) and citation components (`components/coaching/citation-chip.tsx`,
`cited-text.tsx`). And we have a hard rule: **no provider names shown to users** — "sourced by Elevay" /
"added manually" / unknown→null (UI-DNA; the no-provider-names-UI feedback). This spec makes provenance
**uniform across every inbox AI and enrichment surface** so nothing asserts a fact without a source and
nothing leaks a vendor brand.

## Requirements (EARS)
- The system SHALL attach, to every AI-generated inbox claim (thread/message summary, action items,
  entity extraction, importance score, the honest one-line badge INBOX-T08, ask-AI answers, GTM-sidebar
  facts), a provenance affordance: the source it's grounded in + a confidence level.
- The system SHALL render confidence using the shared `ConfidenceState` primitive
  (`verified|likely|uncertain|unverified`), and SHALL hide `uncertain`/`unverified` claims by default
  (`isVisibleAtDefault`), surfacing them only on explicit reveal.
- WHEN a claim is grounded in a specific message/thread/attachment, the system SHALL make the citation
  **click-through** to that exact source (the cited message, the attachment, the offset) — mirroring the
  coaching `CitationChip` → recording-offset pattern.
- WHEN a fact comes from enrichment/sourcing, the system SHALL label its origin as **"via Elevay"** (or
  "added manually" / "from this email"), and SHALL NEVER display the underlying data vendor's name.
- WHEN a value is unknown or unverifiable, the system SHALL render "unknown" (or omit it), and SHALL
  NEVER fabricate or guess a value to fill a slot.
- WHEN an AI cites a URL it produced and the URL fails a HEAD check, the system SHALL mark it
  `unverified` (the documented hallucination signal in `confidence-state.tsx:79`), not present it as fact.
- The system SHALL ground freshness in the existing TTLs: signals past their shelf-life are suppressed
  (signal-freshness), and a stale-sourced role reads "poste à confirmer · sourcé il y a X" rather than an
  unqualified title (role-freshness guardrail) — provenance includes *when*, not just *what*.
- The system SHALL keep provenance copy strictly factual — no hype, no superlatives, no selling
  (no-hype rule) — and SHALL render every provenance element from tokens in light + dark.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread summary WHEN shown THEN it carries a confidence chip and at least one click-through
  citation to a source message; clicking scrolls to / opens that message.
- GIVEN an extracted entity (a date, an amount, a company) WHEN shown THEN it cites the message it came
  from; an entity the model is unsure of is hidden by default (`uncertain`) until revealed.
- GIVEN an enriched company fact in the GTM sidebar WHEN shown THEN it reads "via Elevay" (never the
  vendor name) and links to the source where one exists.
- GIVEN an ask-AI answer over the inbox WHEN returned THEN every factual sentence carries a citation to
  the message/record it used; an unsupported claim is not made (or is marked `unverified`).
- GIVEN an AI-produced link whose HEAD fails WHEN shown THEN it renders the `unverified` chip with the
  "URL HEAD failed — possible LLM hallucination" tooltip, not as a plain fact.
- GIVEN a field the AI cannot determine WHEN rendered THEN it shows "unknown" / is omitted — never a
  fabricated placeholder.
- GIVEN a signal older than its TTL or a role sourced months ago WHEN rendered THEN the signal is
  suppressed and the role reads "poste à confirmer · sourcé il y a X".
- GIVEN dark mode + the no-emoji test WHEN any provenance element renders THEN colors read from tokens
  and `icon===""` assertions pass (lucide glyphs only).

## Edge cases & failure handling
- Multi-source claim (summary spanning several messages) → cite all contributing sources (the
  `cited-text.tsx` multi-marker pattern), not just the first.
- Citation target later deleted → mark the citation stale, never dangle to a 404 (mirror INBOX-G01 edge:
  "Citation target deleted → mark stale, never dangle").
- AI output with no groundable source (pure generation, e.g. a tone rewrite) → no fact-citation needed,
  but label it as AI-generated (provenance = "drafted by Elevay AI"), so the user knows it's generated.
- Conflicting confidence (model says high, but no URL) → the `likely` state (high confidence, no URL)
  vs `verified` (machine-grounded citation) — use the canonical ladder; never upgrade `likely` to
  `verified` without an actual citation.
- Vendor name leaking through a raw field (e.g. an enrichment payload that embeds "Apollo") → the
  provenance layer maps origin→"via Elevay"; a test asserts no known vendor string reaches the UI.
- Non-English mail → provenance copy localizes; citations still point to the exact source.
- Multi-tenant/per-user: citations resolve only within the viewer's tenant/mailbox (cross-ref INBOX-P05);
  a citation never targets a foreign-tenant record.

## Best-in-class bar
- **Provenance on facts, not just reasoning** — Superhuman explains *what it did* (reasoning steps) but
  doesn't cite *sources* for the facts it asserts; ours click-throughs to the exact message/attachment/
  record behind every claim (Lightfield's cited-recall bar), so the user can verify, not just trust.
- **"via Elevay", never a vendor** — competitors surface LinkedIn/GitHub/CRM-vendor brands in the
  sidebar; we never show a data broker. Provenance is the product's voice, uniformly.
- **Confidence + freshness baked in** — the 4-state chip hides low-confidence by default and flags
  HEAD-failed URLs as hallucination signals; TTLs suppress stale signals and qualify stale roles. The
  inbox tells the truth *and its provenance and its age* — a standard most AI inboxes don't meet.
- **One primitive, everywhere** — every inbox AI/enrichment surface reuses the same `ConfidenceState` +
  citation components, so provenance looks and behaves identically across summaries, badges, sidebar,
  and ask-AI (consistency is itself a trust signal).

## Design sketch
- **Data:** AI outputs carry their grounding sources (e.g. `metadata.aiSummaryLine` + the source message
  ids it cites; entity extractions reference their source message; sidebar facts carry an origin tag).
  Reuse the personalization-sources shape already used by Call Mode drafts
  (`{ kind, label, href, quote? }`, codebase notes) for inbox AI citations. Freshness via
  `lib/signals/freshness.ts` + the role-status SSOT.
- **API:** the inbox AI endpoints (summaries INBOX-S*, ask-AI INBOX-Q02, sidebar INBOX-G01) return, with
  each claim, `{ text, sources[], confidence }`; origin tags are mapped server-side to "via Elevay" so a
  vendor name never reaches the client. No new endpoint owns this — it's a contract every inbox AI route
  honors.
- **UI:** a small shared `<Provenance>`/`<CitedClaim>` wrapper composing `ConfidenceState`
  (`components/ai-ui/confidence-state.tsx`) + a click-through citation chip (generalize
  `components/coaching/citation-chip.tsx` / `cited-text.tsx` from "recording offset" to "inbox source"),
  rendered inline next to every AI claim in `_conversation-pane.tsx` (summary header, entity chips,
  badge INBOX-T08) and in the GTM sidebar (INBOX-G01) and ask-AI panel (INBOX-Q02). Tokens: confidence
  palette already token-based (success/warning/tertiary/error in `confidence-state.tsx:28-52`); citation
  chip uses `--color-accent`/`--color-bg-hover`, text `--color-text-secondary`. Lucide: `Check`
  (verified), `Circle` (likely), `Slash` (uncertain), `AlertCircle` (unverified) — already wired —
  plus `Quote`/`ExternalLink`/`FileText` for source links. Shortcut: **`v`** on a focused AI claim
  reveals its sources/why (and reveals hidden low-confidence items). Light + dark via tokens, no emoji
  (icon==="" tests pass), **no provider name** (origin → "via Elevay"), every claim cited.
- **AI:** the model is prompted to return claims with source references; ungrounded sentences are dropped
  or marked; URL outputs get a HEAD check feeding the `unverified` state. This governs how every inbox AI
  feature attaches provenance (it is the citation contract, not a new model).
- **Security:** citations resolve only within tenant/user scope (INBOX-P05); the origin→"via Elevay"
  mapping is server-side so a raw vendor string can't leak; provenance copy is factual (no-hype).

## Tasks (ordered, each with verify + test)
1. Shared `<CitedClaim>`/`<Provenance>` wrapper composing `ConfidenceState` + a click-through inbox
   citation chip (generalize the coaching citation components to inbox sources). (verify: renders a
   verified claim with a working source link; hides `uncertain` by default) (test: component test +
   `isVisibleAtDefault` behaviour)
2. Define the inbox-AI claim contract `{ text, sources[], confidence }` and the server-side
   origin→"via Elevay" mapping; apply to summaries (INBOX-S*), ask-AI (INBOX-Q02), sidebar (INBOX-G01),
   badge (INBOX-T08). (verify: a sidebar enriched fact reads "via Elevay") (test: no-vendor-string
   assertion across the payload)
3. Wire the wrapper into `_conversation-pane.tsx` (summary header, entity chips, badge) + the GTM sidebar
   + ask-AI panel. (verify: browser — every AI claim carries a chip + click-through citation) (test: dom
   render + click-through)
4. HEAD-check AI-produced URLs → `unverified` state; drop/mark ungrounded sentences. (verify: a dead AI
   URL shows the hallucination chip; an unsupported claim is absent) (test: URL-verify + grounding test)
5. Integrate freshness: suppress TTL-expired signals; qualify stale roles ("poste à confirmer · sourcé il
   y a X"). (verify: stale signal hidden; stale role qualified) (test: freshness matrix)
6. No-emoji + no-provider-name + no-hype lint over the provenance surfaces. (verify: icon==="" passes; no
   vendor string; no superlatives) (test: convention tests)

## Current-state notes (VERIFY before building — code moves)
- `components/ai-ui/confidence-state.tsx` exists: `ConfidenceState({ level, label?, reason?, size? })`
  with the canonical 4-state ladder (`verified`=machine-grounded citation, `likely`=high confidence no
  URL, `uncertain`=hide by default, `unverified`=URL HEAD failed → hallucination signal,
  `:14-22`,`:54-62`), token-based palette (`:28-52`), and `isVisibleAtDefault(level)` (`:101`). REUSE —
  do not build a new confidence chip.
- Citation primitives exist for coaching: `components/coaching/citation-chip.tsx`
  (`CitationChip({ token, meetingId? })` → click-through to a recording offset) and
  `components/coaching/cited-text.tsx` (splices chips at markers). Generalize these from
  "recording offset" to "inbox source (message/attachment/record)" rather than writing fresh.
- Conventions (enforced, some by tests): no emojis in UI (tests assert `icon===""`); no provider names
  shown ("sourced by Elevay" / "added manually"; unknown→null); every AI claim cited / "why"; no hype.
  (README §Conventions, UI-DNA, no-provider-names-UI + no-emoji-in-UI + no-hype feedback.)
- Freshness SSOTs exist: `lib/signals/freshness.ts` (signal TTL) and the role-status SSOT
  (`lib/contacts/role-status.ts`, role-freshness guardrail — "poste à confirmer · sourcé il y a X").
- The GTM sidebar (INBOX-G01) and ask-AI (INBOX-Q02) and the honest badge (INBOX-T08) are the primary
  consumers of this contract — this spec is the provenance backbone they all depend on; the badge
  (INBOX-T08) already mandates "every AI claim cited", this generalizes it suite-wide.
- Call Mode drafts already carry a `personalizationSources` array (`{ kind, label, href, quote? }`,
  codebase notes) — reuse that source shape for inbox AI citations.
