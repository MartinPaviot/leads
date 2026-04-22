# WS-4 — Async TAM reveal

**Status:** Shipped — PR #20 (`360eac9`)

## Problem statement

V1 onboarding blocks the user on a "building your pipeline" spinner while
Apollo enrichment runs (30s-3min). This kills the first 60 seconds of the
product experience and creates an artificial bottleneck before any value
is shown.

## Solution

Fire-and-forget TAM build on confirmation. The user lands on the dashboard
immediately. A polling notification component surfaces the live count as
companies trickle in.

## Architecture

### V2 wrapper change (`onboarding-v2-wrapper.tsx`)

After saving identity + targeting + marking onboarding complete, the
wrapper calls `POST /api/tam` with a `void fetch(...)` — no `await`.
The user is redirected to `/home?firstTime=true` synchronously.

### `<TAMRevealNotification>` component

- Polls `GET /api/tam` every 3s (`POLL_INTERVAL_MS = 3_000`)
- Tracks consecutive stable counts via `stableCountRef`
- Concludes when 2 stable polls (`STABLE_POLLS_TO_CONCLUDE = 2`) or 60
  polls max (`MAX_POLLS = 60` = 3 min timeout)
- Three render states:
  1. **Loading** — spinner + "Searching Apollo for companies matching your criteria"
  2. **Done with results** — green checkmark + "Your pipeline is ready — N companies found" + link to accounts
  3. **Done empty** — graceful fallback suggesting ICP broadening

### Feature flag

Gated behind `onboarding.v2.tam-reveal-async` (defaults to `true` post WS-5).

## Acceptance criteria

- GIVEN a new user completing v2 onboarding
- WHEN they confirm their identity + targeting
- THEN they land on `/home` within 2s (no blocking spinner)
- AND the TAMRevealNotification shows live progress
- AND after enrichment completes, it shows the final count with a CTA

## Follow-ups

- Replace polling with SSE from `/api/tam/build` stream endpoint
- Add enrichment progress breakdown (Apollo vs web scrape vs LinkedIn)
