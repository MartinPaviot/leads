# WS-3 — Warm lead surfacing (compressed spec)

**Brief source:** master brief §3 WS-3.
**Predecessor:** WS-2 merged.

## Scope
Post-OAuth inbox scan identifies warm leads (past conversations, >10d silent). Ranked heuristic surfaces top 3 on dashboard. CTA drafts follow-up → routes through WS-1 approval+sending enforcement.

## PRs
- **PR A**: `/api/warm-leads/scan` (scan + rank), `/api/warm-leads/draft` (LLM draft w/ conversation context), unit tests.
- **PR B**: `<WarmLeadPrompt>` dashboard component + integration gated by `onboarding.v2.warm-lead-prompt` flag.

## Exit (brief §3 WS-3)
- Fresh tenant with >50 Gmail sent emails → ≥1 warm lead in <15s.
- Draft references actual past exchange.
- Send path respects WS-1 (`primary-with-caps`, warm-only, cap enforcement).
- Brand-new mailboxes gracefully skip (return empty list, not 500).

## Locked decisions
- Heuristic: recency × exchange count × inferred seniority × ICP match. Top 3 by composite score.
- Not scanning marketing-heavy senders (reuse `DEFAULT_IGNORED_DOMAINS`).
- No new DB table — scan results are ephemeral (regenerated on demand, cached 5 min per tenant).
