# Office hours — workspace-roles

**Date**: 2026-06-10
**Feature**: Make the 3-role workspace model (admin / member / viewer) real — enforced, invitable, chat-aware.

## Problem statement (one sentence)

The role model is half-built: `viewer` is defined in `ROLE_PERMISSIONS` but not invitable and not enforced (only ~12 of 316 routes check permissions, the chat checks none), money actions (Twilio number purchase) have no role gate, and `sequences:execute` is dead vocabulary.

## Premise challenge

- *Do we need roles at all for founder-led sales (2-8 people)?* Yes, but only one NEW capability matters: a **read-only seat** (advisor, investor, coach, agency-in-observation). Admin/member already exist and work. The rest of the work is closing enforcement seams, not adding concepts.
- *Should visibility be restricted per record/territory?* No — shared memory IS the product (chat citations over the whole pipeline). Roles restrict **capabilities** (send, spend, destroy, configure), never reads.
- *Custom roles / permission matrix editor?* Rejected — contradicts "customizable but very simple". Three fixed roles, zero configuration.

## Alternatives explored

1. **Sprinkle `requirePermission` on all ~250 routes** — completeness 9/10 but huge diff, high regression risk, unmaintainable (every new route must remember). Rejected.
2. **Central fail-closed gate in middleware (chosen)** — viewer + non-GET on `/api/*` → 403 with a short read-only-POST allowlist (`/api/chat*`, `/api/search*`, `/api/filters/parse-nl`). One line of defense covering all 316 routes including future ones. Completeness 8/10 (JWT role only at the edge; see freshness below).
3. **DB role check in middleware** — closes the demoted-user window at the edge, but executes DB queries in the middleware path (today the middleware only *imports* the auth/db chain, it never runs a query; runtime is not proven Node-safe for queries). Rejected for risk; freshness handled in `getAuthContext` (Node guaranteed) instead.

## Layer check

- Layer 1 (tried and true): role-in-JWT + route guards + middleware gate is the standard Next.js/NextAuth pattern. The codebase already has `requirePermission`, `requireAdmin`, audit logging (SOC 2 comments), self-demotion guard, last-admin-leaving guard (M10). We extend, not reinvent.
- The chat already has the right hook: `resolveCapabilities(allTools, { role })` runs BEFORE both the orchestrator and `routeTools` — one insertion point.

## Completeness target

**8/10.** Enforced: viewer invitable end-to-end, all write routes blocked for viewers at one choke point, chat read-only for viewers, money + execute gates live, role freshness ≤60s at the API layer. Documented residuals (not built): per-member spend caps (own feature), UI affordance pass (hide/disable buttons a viewer can't use — viewer sees buttons whose calls 403), server-side JWT revocation on demotion (≤8h window at the middleware layer only, SOC 2 follow-up), Slack/MCP surfaces already read-only by other means.
