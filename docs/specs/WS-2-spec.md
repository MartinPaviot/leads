# WS-2 — Confirmation screen (steps 1+4+5 fusion) — Spec (compressed)

**Status:** Approved by blanket "fais tout" mandate. Proceeding to plan + execute.
**Brief source:** master brief §3 WS-2.
**Predecessor:** WS-1 merged 2026-04-21.

## Scope

Collapses the v1 wizard steps `welcome` + `product` + `icp` into a single `<OnboardingConfirmationCard>` with three zones:

1. **Identity + product** — Category A fields (fullName, companyName, domain, productDescription, aiTone, language, timezone). All inferred from `analyze-website` + `identifyUser browser locale`, editable inline, each field carries an "AI — inferred from X" badge.
2. **Targeting** — Category B fields (industries, sizes, geographies, seniorities, departments). Replaces 113-item flat dropdown with **vertical presets + tighter/looser adjuster**. Live Apollo count updates within 500ms of any adjustment.
3. **Guardrails** — approval mode + LLM budget + sending-infrastructure informational block. Reuses WS-1 infrastructure.

## Exit condition (from brief §3 WS-2)

- Fresh tenant walks through the v2 card end-to-end via feature flag.
- All Category A fields editable, silent `aiTone` override gone (grep for `applyWebsiteAnalysis.*aiTone` returns zero matches on main).
- Category B adjustments update Apollo count within 500ms (measured via `performance.now()` around the fetch).
- All guardrail controls persist via WS-1 endpoints.

## PR split

Given the size (~1,500-2,000 LOC), 3 PRs:

- **PR A** — feature-flag mechanism (tenant-scoped `settings.experiments`), `GET /api/experiments` endpoint, unit tests.
- **PR B** — `<OnboardingConfirmationCard>` + `/api/tam/estimate-count` endpoint (Apollo count with `per_page:1`, already exists — verify reuse) + `/api/onboarding/confirmation-card-data` consolidated read + silent `aiTone` removal.
- **PR C** — Wizard integration behind `onboarding.v2.confirmation-card` flag + E2E test.

## Locked design decisions (OQs resolved)

- Flag storage: `settings.experiments: Record<string, boolean>`. Server-side read only; client reads via `/api/experiments`.
- Default flag state: off for everyone. Admin-only toggle via `PUT /api/experiments`.
- V1 remains the default path; v2 renders only when flag is true.
- Apollo count endpoint: reuse Martin's existing `/api/tam/estimate` from commit `4438368`.
- Per-field confidence surfaces only fields with `confidence < 0.7` (from existing LLM output).
- AI attribution badges are always shown for inferred fields — user can edit freely post-render.

## Rollout

PR A → PR B → PR C. Each squash-merged. After PR C ships, Martin flips flag for his own tenant first (dogfood), then 10% cohort, then 100%. WS-5 later removes v1.

## Exit

- All 3 PRs merged.
- Flag ramp to 100% (deferred to WS-5).
- v2 confirmation card tested by Martin end-to-end on a fresh signup.
- Spec retro in `WS-2-retro.md`.
