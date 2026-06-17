# INBOX-G01 — Contact / company / deal sidebar with citations
> Theme: T7 · Autonomy rung: helper · Priority: P0
> Pillar: P5 GTM moat

## User story
As a founder reading a prospect's email, I want a sidebar that shows who they are — contact,
company, open deal, live signals, last interaction — each with a citation, so I can reply with
full context without leaving the inbox or opening the CRM.

## Why (audit anchor)
This is the moat: Lightfield's cited customer memory + Monaco's deal intelligence, rendered
**inside** the inbox. Gmail/Superhuman/Shortwave have no CRM graph (they BCC a CRM at best), so
they can't do this. It's the single feature that makes our inbox "augmented" rather than a faster
Gmail. Every claim must cite its source (Lightfield's 95%-recall-with-citations bar).

## Requirements (EARS)
- WHEN a conversation is open, the system SHALL resolve the counterparty to a contact/company/deal
  (by email → `metadata.from` → CRM graph) and render a context sidebar.
- The system SHALL show, each with a citation (source + timestamp): role/title (with freshness,
  per role-freshness guardrail), company one-liner, open deal + stage, last interaction, and any
  live signals (funding/hiring/intent).
- The system SHALL NOT assert any fact without a citation; unknown fields render "unknown", never guessed.
- The system SHALL show collision state (a teammate already engaged) when present (INBOX-G06).
- The system SHALL link each entity to its CRM record (deep link), opening in-app.
- The system SHALL respect per-user/tenant scope — only entities in the viewer's tenant.
- WHEN the counterparty is unknown (no contact/company), the system SHALL offer one-click capture
  (INBOX-G02) rather than showing an empty sidebar.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread from a known contact with an open deal WHEN opened THEN the sidebar shows the
  contact, company, deal+stage, last interaction, and signals, each with a clickable citation.
- GIVEN a role sourced months ago WHEN shown THEN it reads "poste à confirmer · sourcé il y a X"
  (per role-freshness guardrail), not an unqualified title.
- GIVEN an unknown sender WHEN opened THEN the sidebar offers "Add to CRM" (INBOX-G02), no fabricated data.
- GIVEN a signal older than its TTL WHEN shown THEN it is suppressed (per signal-freshness TTL).
- GIVEN a teammate has emailed this prospect in 48h WHEN opened THEN a collision notice appears.

## Edge cases & failure handling
- Multiple contacts at the same company → show the sender's contact, link to the company roster.
- Contact resolves to several deals → show the most relevant open deal, list the rest.
- Citation target deleted → mark stale, never dangle.
- Slow CRM lookup → render skeleton, never block the email body.
- Cross-tenant: hard scope; never resolve an entity outside the viewer's tenant.

## Best-in-class bar
- Every line is **cited and fresh** (signal-freshness TTL + role-freshness guardrail already in the
  codebase) — we surface the truth and its provenance, where competitors surface nothing or guesses.
- It reuses our real CRM graph + signal engine, so the context is genuinely actionable (next action,
  deal stage), not a generic "enriched contact card".

## Design sketch
- **Data:** contacts/companies/deals + signals + `lib/accounts/last-interaction.ts` +
  collision helpers; freshness via `lib/signals/freshness.ts` + role-status SSOT.
- **API:** new `GET /api/inbox/context?conversationKey=…` → resolves counterparty → returns the
  cited bundle (reuse Call Mode brief builders where possible — they already assemble cited context).
- **UI:** right-hand sidebar (detail-panel 400px) in `_conversation-pane.tsx`, on `--color-bg-card`
  with `--shadow-panel`; IndustryBadge/TitleBadge + sober lucide section icons (`Building2`,
  `User`, `TrendingUp`); entity chips link to CRM; citation popovers on every line. Shortcut: a
  number key toggles the sidebar (registered in the K01/K02 registry). Light+dark via tokens; no
  emoji; no provider name ("sourced by Elevay"); every line cited (signal/role freshness).
- **AI:** company one-liner reuses the existing grounded homepage summary (fail-closed); no ungrounded claims.
- **Security:** tenant scope; no provider names in UI ("sourced by Elevay").

## Tasks (ordered)
1. `GET /api/inbox/context` resolving counterparty → cited bundle (reuse Call Mode brief + signal
   freshness + role-status). (verify: returns cited fields for a known contact) (test: route test)
2. Sidebar UI with citation popovers + entity deep links. (verify: browser on a real thread)
3. Unknown-sender → capture CTA (wire INBOX-G02). (verify: unknown sender shows Add-to-CRM)
4. Collision + freshness integration. (verify: stale signal suppressed; teammate notice shows)

## Current-state notes (VERIFY before building)
- Call Mode already assembles a cited prospect brief (career timeline + grounded company summary,
  jsonb-cached, fail-closed) — reuse, don't rebuild.
- `lib/accounts/last-interaction.ts` (SSOT), collision helpers (`lib/collision/`), signal freshness
  (`lib/signals/freshness.ts`), role-status SSOT exist. Sidebar should compose these.
- No inbox context endpoint exists yet.
