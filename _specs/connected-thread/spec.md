# Spec — Connected Thread Narrative (landing how-it-works)

Status: drafting → implementing
Owner: Martin
Surface: `app/apps/web/src/app/(marketing)` — `page.tsx`, `_components/process-steps.tsx`, `_components/hero-demo.tsx`

## Problem / why
The how-it-works steps already show each Elevay surface animated, but each
reads as an isolated feature. The product's #1 differentiator — it's **one
connected system that remembers every interaction** (vs the "five tools, no
memory" alternative on the same page) — is told, not shown. Make the
animation itself prove it by following one account through every stage.

## Requirements (EARS / GIVEN-WHEN-THEN)
- **AC1** GIVEN the six steps, WHEN viewed, THEN the same account — **Notion**,
  contact **Sarah Klein (COO)** — is the protagonist at every stage.
- **AC2** GIVEN each step, WHEN shown, THEN a subtle thread marker under the
  headline names that account's stage in its journey, so the progression
  (TAM → … → Proposal) reads at a glance.
- **AC3** GIVEN step 3 (Campaigns), WHEN shown, THEN the outreach targets
  Sarah @ Notion (was Tom @ Webflow), drafted from **signals** (first touch,
  no prior call referenced), keeping the timeline coherent: email → call → deal.
- **AC4** GIVEN the hero teaser (Accounts → Campaigns → Opportunities), WHEN it
  plays, THEN it shows the same Notion thread AND the agent's "Approve & send"
  action still fires (the `data-action="approve"` hook is intact).
- **AC5** No regressions: entrance fade, auto-pan, mobile fit, html overflow
  guard, `prefers-reduced-motion`.
- **AC6** Honest: a clearly fictional but internally consistent demo dataset;
  no fabricated customer claims.

## Design
Protagonist: **Notion** (account) + **Sarah Klein** (COO).

| Step | Notion is… | Thread marker |
|---|---|---|
| 1 Build TAM | scored into the list | Notion · scored into your TAM |
| 2 Prioritize | flagged, 12 days silent | Notion · flagged, 12 days silent |
| 3 Reach out | re-engagement email (from signals) | Notion · re-engagement drafted |
| 4 Capture | discovery call captured (Sarah) | Notion · discovery call captured |
| 5 CRM | deal Discovery → Proposal, $40K | Notion · advanced to Proposal |
| 6 Ask | the whole history, one answer | Notion · everything, one answer |

- **Thread marker UI:** a small inline chip under each step headline — Notion
  favicon (Logo, with glyph fallback) + the stage text — tinted brand-subtle.
- **CampaignsPhase:** To `sarah@notion.so`; body re-engages on Notion's silence
  + signals; "Drafted from Notion's signals" (not a call). Keep Approve & send /
  sent states and `data-action`.
- **Section framing:** how-it-works intro sets up the thread ("Follow one
  account, Notion, from a cold list to a closed deal.").

## Tasks
1. `hero-demo.tsx` — CampaignsPhase: retarget Sarah @ Notion + signal-drafted copy (keep the action). [AC3, AC4]
2. `process-steps.tsx` — add a ThreadChip + a `thread` label per step; render it under each headline. [AC1, AC2]
3. `page.tsx` — how-it-works intro copy frames the thread. [AC2]
4. Verify AC1–AC5 in the browser (thread consistent, hero approve fires, fade/pan/mobile/overflow OK).
