# G1: Daily Dashboard — Office Hours

## Problem Statement
When a founder opens our app, they see an accounts list — no guidance on what to do next. Monaco's daily dashboard immediately shows prioritized actions, weekly performance, and today's calendar, creating the "open app → know what to do" experience.

## Premise Challenge
**Why not just improve the existing "Up next" page?** The "Up next" page at `(dashboard)/page.tsx` already has CRO Copilot actions. But looking at Monaco's dashboard, the gap is:
1. No greeting / time-based context
2. No weekly performance summary (sequences, responses, meetings, closes)
3. No stall detection badges on action cards
4. No today's calendar integration
5. No inline email preview with AI-drafted follow-ups
We should ENHANCE the existing page rather than create a new one.

## Alternatives Explored
1. **Full rebuild as new page** — Too much duplication, existing page has working action generation
2. **Enhance existing "Up next" page** — Best option. Add sections above/below existing actions
3. **Dashboard as modal/overlay** — Bad UX, users want a persistent home screen

## Layer Check
- Layer 1 (tried and true): Dashboard patterns are well-established (Salesforce, HubSpot)
- Layer 2 (new and popular): Monaco's specific layout is new but follows standard dashboard patterns
- Layer 3 (first principles): The "daily operating surface" concept is validated by Monaco's success

## Completeness Target: 9/10
All edge cases: empty states, single vs multiple tasks, no meetings, first-time user
