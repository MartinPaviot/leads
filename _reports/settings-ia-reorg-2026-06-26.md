# Settings IA reorg — 2026-06-26

Audit + redesign of the entire Settings area. Grounded in a per-page inventory
(38 routes read in full) + a 3-lens expert design panel (onboarding-first /
founder-mental-model / best-in-class benchmark), judge-synthesized.

## The problem (measured, not impression)

- **38 settings routes** total. The visible nav was `Account` (4 items) +
  `Workspace` (**13 items**, a dumping ground with no sub-logic) + admin/billing.
- **3 pages all control "how autonomous the AI is"**: `/settings/guardrails`
  (approval mode), `/settings/autonomy` (level + trust + caps + never-contact,
  **orphaned** in a different route group), `/settings/inbox-autonomy`
  (per-feature Off/Suggest/Auto, **orphaned**). `/settings/agent` redirects to
  guardrails. Two competing "consolidation hubs" built by two workstreams
  (WS-1 guardrails vs CLE-16 autonomy).
- **3 pages all control "how the AI writes/sounds"**: `/settings/product`
  (AI tone), `/settings/writing-style` (which already folds in the voice
  record), `/settings/inbox-voice` (reply tone, **orphaned**). Sign-off is
  duplicated between `writing-style` and `inbox-memory`.
- **2 notification pages**: `/settings/notifications` + `/settings/inbox-notifications`
  (**orphaned**), both per-user.
- **7 real, functional pages were orphaned** out of the nav entirely: `autonomy`,
  `agent-memory`, `inbox-voice`, `inbox-memory`, `inbox-ai-profile`,
  `inbox-notifications`, `llm-evals`.
- **3 dead redirect-only routes** still conceptually present: `/settings/agent`,
  `/settings/icp-profiles`, `/settings/mailboxes`.
- **Label/content mismatch**: nav said "Settings"; the page renders "Profile".
- **Mis-filed**: "Guardrails" sat under "Account"; "Notifications" (per-user)
  sat under "Workspace".

## New IA — 6 topical sections, setup-then-operate order

`Account` → `Your AI` → `Targeting & Pipeline` → `Channels` → `Workspace` (admin) → `Developer` (admin)

The product **is** an autonomous agent, so the agent's brain (autonomy, voice,
knowledge, memory) earns its own top-level `Your AI` group instead of being
scattered through a 13-item Workspace dump. Org admin (members/privacy/billing)
and dev tooling (evals/MCP/observability) are `adminOnly`, off the founder's
critical path.

| Section | Items (visible) | Hidden until promoted |
|---|---|---|
| **Account** | Profile, Security, Notifications | — |
| **Your AI** | Autonomy, Approval mode, Voice & Writing, Knowledge, Product, Agent memory, AI data handling | Sales Plays |
| **Targeting & Pipeline** | ICP, Opportunity stages, Capture approvals, Custom fields | Custom signals, Workflows, Custom objects |
| **Channels** | Mail & Calendar, Sending channels, Mailbox identity | Recording |
| **Workspace** *(admin)* | General, Members, Privacy & data, AI budget | Billing (flag) |
| **Developer** *(admin)* | LLM observability | Evaluations (flag), MCP integration (flag) |

### Relabels (jargon → plain)
- "Settings" → **Profile** (it's only name/language/timezone)
- "Data Model" → **Custom fields**
- "Sending infrastructure" → **Sending channels**
- "Writing Style & Tone" → **Voice & Writing**
- "Product & Voice" → **Product** (the voice half lives in Voice & Writing)
- "LLM Budget" → **AI budget**
- "Opportunity Stages" → **Opportunity stages**, "Custom Objects" → **Custom objects**, "MCP Integration" → **MCP integration** (casing consistency)

## Phase 1 — SHIPPED (this change): pure nav reorg, zero page rewrites

- Regrouped the flat 13-item Workspace into the 6 sections above, in order.
- Relabeled the jargon items.
- Surfaced 3 previously-orphaned canonical pages: `/settings/autonomy`,
  `/settings/agent-memory`, `/settings/inbox-ai-profile`.
- **Moved** `/settings/autonomy` out of the `(rest)` route group into the
  settings shell (`(dashboard)/settings/autonomy/`) so it renders with the
  settings sidebar + `SettingsHeader` (was a full-width `PageHeader` page
  outside the shell). Updated the CLE-16 copy-match test path.
- Dropped the dead redirect routes and the soon-to-merge `inbox-*` duplicates
  from the nav (still reachable by URL / chat deep-link — no content lost).
- Removed "The Method" (`/settings/docs`) from Settings — it's educational
  content, not a setting. (Follow-up: surface it as a top-level Learn/Help entry.)
- `/settings/guardrails` kept in nav as **"Approval mode"** (its real unique
  control) so nothing is stranded before the Phase-2 merge.

Verification: `tsc` clean; 101 tests pass (autonomy-copy with the moved path,
settings-actions, level-behavior, route-capability).

## Phase 2 — page-content merges (deeper; each ships with a redirect from the retired route)

These are what actually **reduce the page count**; each is a content rewrite +
redirect + test, so they are staged separately.

1. **Autonomy 3 → 1** (~1.5–2 dev-days). Make `/settings/autonomy` canonical.
   Fold in `/settings/guardrails` (approval mode) and `/settings/inbox-autonomy`
   (per-feature Off/Suggest/Auto) as sub-sections; keep the outward-feature
   Suggest cap. **Open question to resolve first**: reconcile the two parallel
   models — autonomy *level* (copilot/guided/autonomous/strategic) vs *approval
   mode* (review-each/batch-daily/auto-high-confidence). Pick one; don't ship both.
   Retire guardrails + inbox-autonomy as redirects.
2. **Voice 3 → 1** (~1.5 dev-days). Make `/settings/writing-style` ("Voice &
   Writing") canonical. Fold in `/settings/inbox-voice` (reply tone + pre-draft
   toggle) and `/settings/inbox-memory` (standing instructions + sign-off +
   company line); collapse the duplicated sign-off to one field; pull the AI-tone
   field out of `/settings/product`. Retire both inbox-* routes as redirects.
3. **Notifications 2 → 1** (~0.5 day). Make `/settings/notifications` canonical;
   fold `/settings/inbox-notifications` (digest cadence + quiet hours) in as an
   "Inbox" tab. Retire as redirect.
4. **AI budget → Billing tab** (~0.5 day, when Billing flag flips on). Merge
   `/settings/llm-budget` into `/settings/billing` as a "Usage & budget" tab.
5. **Mailbox identity → Mail & Calendar row** (~1 day). Fold per-mailbox display
   name/signature/voice override into an expandable row on each connected mailbox.

Net after Phase 2: ~5 routes retired (redirected), the autonomy/voice/notification
triples collapse to singles. The duplications the founder felt disappear.

## Contested call (flagged, not hidden)
`Capture approvals` is filed under **Targeting & Pipeline** (it governs what
enters the CRM). Two of three design lenses would file it under **Your AI /
Autonomy** (its auto/review/hybrid dial is the same "how-much-without-asking"
control). Kept in Targeting to balance group sizes and sit it beside the data it
feeds; revisit if founders look for it under Autonomy.
