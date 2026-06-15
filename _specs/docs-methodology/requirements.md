# DOCS-001 — Methodology documentation (Settings + Landing), prod-hidden

## Problem statement

Elevay embeds a sales methodology (TAM discipline + multi-channel outbound
playbooks) but nothing in the product explains it. Founders get tools without
the operating doctrine. Competitors ship the methodology as part of the
product surface (embedded playbooks, forward-deployed methodology). We have
~9,400 lines of distilled research (`_research/`) that never reaches users.

## User story

As a founder using Elevay (or evaluating it from the landing page), I want
the company's full GTM knowledge presented as ONE method with ordered,
numbered steps in a left sidebar (not blog-style articles), each step with
concrete worked examples (Elevay itself as the example company), so that I
can run founder-led sales the way the engine is designed to run it.

REVISED 2026-06-12 after Martin's feedback mid-build: (1) not articles, a
method with steps + examples, steps in a left sidebar; (2) integrate the
full Sam Blond transcript insights at every step
(_research/raw/transcript-sam-blond-monaco-gtm.md). Result: 14 steps in 4
phases (Foundations / Build the machine / Run outbound / Learn and
compound), every step carries at least one `example` block (test-enforced).

## Acceptance criteria

1. GIVEN a dev build, WHEN I open `/docs`, THEN I see a documentation index
   grouped by category (Method, TAM, Outbound) with all articles listed.
2. GIVEN a dev build, WHEN I open `/docs/<slug>`, THEN the full article
   renders with headings, lists, tables and callouts, plus prev/next nav.
3. GIVEN a dev build, WHEN I open Settings, THEN a "Documentation" entry is
   visible (Resources section) and routes to `/settings/docs` with the same
   content rendered inside the settings shell (SettingsHeader convention).
4. GIVEN a dev build, WHEN I open the landing page, THEN a "Docs" link is
   present in the header nav and footer.
5. GIVEN a production build (`NODE_ENV === "production"`), THEN `/docs`,
   `/docs/<slug>`, `/settings/docs` and `/settings/docs/<slug>` all 404, the
   settings sidebar entry is hidden, and the landing links are absent.
   Same pattern as BILLING_PAGE_ENABLED / admin-tools-visibility.
6. Content rules (enforced by tests over every content string):
   - English; no emoji; no em/en dashes; brand is "Elevay" (never LeadSens);
   - no data-provider or competitor names;
   - unique slugs; every article has category, title, description, blocks.
7. Content coverage (from research, presented as Elevay methodology):
   - How Elevay works: the operating loop + doctrines (demand-first,
     founder-sender, relevance not personalization, machine reveals/human acts).
   - TAM: what it is operationally for an early-stage startup (reverse
     pipeline math, founder capacity caps), how to build it (ICP, sourcing,
     scoring, tiering, coverage), how to keep it alive (decay, signals,
     exclusions, win/loss feedback, review cadence).
   - Outbound: channel strategy by stage (benchmarks, cadences, volume
     saturation, follow-up discipline), cold email playbook, cold calling
     playbook (founder phases), LinkedIn playbook.

## Edge cases

- Unknown slug → 404 (notFound), both surfaces.
- Article with table blocks must not overflow the settings max-w-2xl column
  (tables scroll horizontally inside their container).
- Dark mode in the app: docs use CSS variable tokens, no hard gray-900 text.
- Landing is light-only: same renderer resolves :root (light) tokens.

## Evaluation steps

1. `vitest run` content + visibility tests green (from app/apps/web).
2. `tsc` clean.
3. Dev server: screenshot `/docs`, one article, `/settings/docs`, settings
   sidebar entry, landing header link.
4. Grep production gate: every route file checks DOCS_PAGE_ENABLED.
