# Workspace data boundary — shared vs personal (bilan + coherence)

Date: 2026-06-09. Built by enumerating the live schema (16 files, ~80 tables) +
the verified read/write paths. A "workspace" = a tenant.

## 1. Cross-workspace isolation (universal)
Every business table carries `tenant_id`; reads filter on it, and `withAuthRLS`
→ `setTenantId` adds Postgres RLS as defense-in-depth. Workspace A never sees
Workspace B. **Coherent, conventional.**

## 2. PERSONAL — private to one user (read-scoped to the owner)
Only the owner sees/manages these. Verified or per-design:
| Data | Column | Notes |
|---|---|---|
| OAuth tokens (Google/MS) | `auth_account.userId` | per-user; never in the JWT |
| Login password hash | `auth_user.password_hash` | per-identity |
| **Connected mailboxes + CalDAV calendars** | `connected_mailboxes.user_id` | PR #68 — credentials, visibility, management owner-only |
| Chat threads / messages / memories | `chat_threads.user_id`, `chat_memories.user_id` | per-user assistant |
| Tool-call events | `tool_call_events.user_id` | per-user chat ops |
| Saved views | `saved_views.user_id` | my filters/columns |
| User preferences | `user_preferences.user_id` | my UI prefs |
| Notifications + prefs | `notifications.user_id`, `notification_preferences.user_id` | per-user inbox |

## 3. SHARED — workspace-common (all members see it)
The CRM and the GTM machine are team resources. Many carry a user column, but
it means **attribution / assignment / send-from, NOT privacy** — every member
still sees the row.
- **CRM**: companies, contacts, deals, activities, notes, comments, tasks,
  captureApprovals. `deals.ownerId` / `companies.ownerId` / `contacts.ownerId` =
  the assigned AE (workspace-visible). `activities.actorId`, `notes.authorId` =
  who did it.
- **Outbound / GTM**: sequences (`created_by` = owner, **sends from their
  mailbox** — PR #69), sequenceSteps/Enrollments/Drafts (`reviewedBy` = approver),
  outboundEmails, warmupEmails, optouts. Proposals, ICPs, TAM proposals,
  call campaigns/scripts, customSignals, knowledgeEntries, playbookEntries —
  all workspace-level, stamped with `created_by`/`reviewedBy` for attribution.
- **Per-AE but workspace-context**: `coaching_insights.user_id`,
  `ae_performance_snapshots.user_id`, `calls.user_id` — about a specific rep but
  part of the shared coaching/voice surface (manager-visible). *(Ambiguity flag:
  if any of these should be private-to-the-rep, they'd need read-scoping; today
  they're tenant-scoped.)*
- **System / agent / observability**: agentActions, agentTasks, trustEvents,
  llmCalls, pipelineEvents, evals, etc. — tenant-level telemetry.

## 4. Sending — per-owner everywhere (PR #68/#69/#70)
- Sequence emails → the **sequence creator's** mailbox (`sequences.created_by`).
- Agent emails (autonomous pipeline, stale-deal revival) → the **deal owner's**
  mailbox (`deals.ownerId` via `lib/integrations/owner-mailbox.ts`).
- No owner / no mailbox → neutral system sender (Resend) or skip — **never a
  colleague's mailbox**.
- `selectBestMailbox` (deliverability pool, no active callers) is now
  owner-aware (optional `ownerId`) so it can't reintroduce the gap if wired.

## 5. Coherence verdict
**Coherent and conventional**, with three things to know:

1. **The one real inconsistency — two "user" id spaces.** Tables don't agree on
   what a user id is:
   - `auth_user.id` (auth-user id): the auth tables, the agent tables, AND the
     new personal-connection tables (`connected_mailboxes.user_id`,
     `sequences.created_by`).
   - `users.id` (app-user id): the CRM + most feature tables (`deals.ownerId`,
     `chat_threads.user_id`, `notifications.user_id`, proposals, icps, …).
   They map 1:1 via `users.clerk_id` (= auth-user id), but any code that joins an
   "owner" across the two spaces without mapping silently mismatches. This is
   exactly why the agent senders needed the `owner-mailbox.ts` bridge
   (deals.ownerId app-id → clerk_id auth-id → mailbox user_id). **Recommendation:
   pick ONE space for "user fk" going forward (app `users.id` is the larger
   set) and add a lint/convention; or centralize the bridge in one helper used
   everywhere.** *(Done 2026-06-09: the bridge is centralized in
   `lib/auth/user-id.ts` — `appToAuthUserId` / `authToAppUserId`, tested;
   `owner-mailbox.ts` now uses it. Convention: new user FKs reference `users.id`,
   cross-space joins call these helpers. Full single-space convergence remains a
   separate, larger chantier — not done.)*

2. **"Has a user column" ≠ "private."** The model is consistent *once you split
   the two intents*: a small **private** set (§2, read-scoped) vs a large
   **shared-with-attribution** set (§3, owner stamp only). That distinction is
   correct and matches how mature CRMs work (team data + per-record owner).

3. **Minor ambiguity** — the per-AE coaching/perf tables (§3) are tenant-visible;
   confirm that's intended (vs private-to-the-rep).

Bottom line: the boundary is sane and standard. The only thing worth a deliberate
decision is unifying the user-id space (§5.1) before the codebase grows more
join sites across it.
