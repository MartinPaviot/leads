# WS-8 — Agent memory panel

**Status:** Shipped — PR #23 (`834400a`)

## Problem statement

Users have no visibility into what the agent "knows" about them — inferred
preferences, learned patterns, conversation summaries. This opacity blocks
trust-building and prevents the progressive-autonomy nudge engine (WS-1)
from activating (T2+T4 sequencing gate requires panel discovery).

## Solution

A Settings → Agent memory page that renders the agent's knowledge
snapshot, grouped by category. The first visit flips the
`agentMemoryPanelDiscovered` flag server-side, which unlocks WS-1
nudge surfacing.

## Architecture

### Settings page — `(dashboard)/settings/agent-memory/page.tsx`

**Features:**
- Fetches `GET /api/agent-memory` on mount
- Groups entries by category:
  - `inferred-from-website` — product description, industry, team size
  - `inferred-from-inbox` — communication patterns, key contacts
  - `explicit-setting` — user-configured preferences
  - `user-provided-knowledge` — manual knowledge entries
  - `past-conversation-summary` — chat interaction summaries
  - `learned-preference` — writing style, scheduling patterns
- Each entry shows: label, value, source, confidence badge
- Trust score display with recent event log
- Export button (JSON download)

### API — `GET /api/agent-memory`

Returns `{ tenantId, generatedAt, entries[], trustScore, recentEvents[] }`.

**Side effect on first call:** Flips `settings.agentMemoryPanelDiscovered`
to `true`. This is the T2+T4 sequencing gate — once flipped, the trust
score nudge engine (WS-1 `suggestNudge()`) starts returning nudges
instead of `null`.

### T2+T4 gate in trust-score.ts

```
if (!settings.agentMemoryPanelDiscovered) return null;
```

The gate ensures nudges about increasing agent autonomy are never shown
before the user has seen what the agent knows. This prevents the "trust
me, I know what I'm doing" anti-pattern where autonomy is offered before
transparency.

### Nudge autonomy endpoint — `POST /api/nudges/autonomy`

Handles nudge lifecycle: offer, accept, dismiss. Each action is logged
as a trust event for the audit trail.

## Acceptance criteria

- GIVEN a user who has never visited the agent memory page
- WHEN they navigate to Settings → Agent memory
- THEN the panel renders grouped memory entries with confidence badges
- AND `agentMemoryPanelDiscovered` flips to true server-side
- AND subsequent calls to `suggestNudge()` may return nudges (previously null)

- GIVEN a user with trust score > 0.5 who has discovered the panel
- WHEN the nudge engine runs
- THEN it may surface a "batch daily" autonomy nudge

## Follow-ups

- Dashboard header "Agent brain" button for quick access
- Per-entry edit/delete capability
- Notification dot when new memories are added
