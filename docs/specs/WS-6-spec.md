# WS-6 — Scaling path UX

**Status:** Shipped — PR #21 (`d2cec61`)

## Problem statement

When WS-1 guardrails block a cold outreach from the user's primary inbox
or hit the daily send cap, the user sees a generic error. There's no
guidance on how to scale sending properly — the protective guardrail
feels like a wall instead of a recommendation.

## Solution

`<ScalingPathPrompt>` surfaces contextually when a send is blocked. Two
scaling options presented with protective framing (not a paywall).

## Architecture

### `<ScalingPathPrompt>` component (`ScalingPathPrompt.tsx`)

**Props:**
- `reason: "cold-on-primary-blocked" | "primary-cap-hit"` — determines
  headline and subline copy
- `onDismiss?: () => void` — tertiary "remind me later"
- `onResolved?: (mode) => void` — parent re-renders + retries blocked send

**Two options:**
1. **Let us handle it** — `POST /api/settings/sending-infra/request-managed`
   Creates a `sending_infra_requests` row (WS-1 migration 0024). Toast
   confirms "We'll reach out within 24 hours."
2. **I already have Instantly** — reveals API key input, connects via
   `POST .../providers/instantly/connect`. Toast confirms routing active.

### Home integration

Rendered in `(dashboard)/home/page.tsx` when URL contains
`?scalingPath=cold-on-primary-blocked` or `?scalingPath=primary-cap-hit`.
The sending-identity guardrail redirects here with the appropriate param
when it blocks a send.

### Copy tone

Deliberately protective + premium per brief: "If the copy sounds like a
paywall or friction point in review, rewrite it."

## Acceptance criteria

- GIVEN a user whose cold send was blocked by WS-1 sending-identity guardrail
- WHEN they land on the scaling path prompt
- THEN they see two options with clear value props
- AND requesting managed setup creates a `sending_infra_requests` row
- AND connecting Instantly validates the key and confirms routing

## Follow-ups

- Email-send-worker rewire for auto-redirect on block
- Add more ESP providers beyond Instantly
