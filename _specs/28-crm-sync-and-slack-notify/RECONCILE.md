# RECONCILE.md — Spec 28 CRM Sync and Slack Notify (T0)

> Read-only reconciliation. No HubSpot CRM sync or Slack hot-lead notify exists. This is the terminal of the loop — it writes the user's system of record, so "do not clobber" governs.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Sync canonical Account/Contact + activity to HubSpot, idempotent upsert | **missing** | No HubSpot adapter / CRM sync |
| AC2 | Hot-lead (26) → Slack post + CRM record/deal-stage | **missing** | `lib/emails/notifications.ts` is email, not Slack |
| AC3 | Field-mapping config; never overwrite unmanaged CRM-owned fields | **missing** | No managed-field guard |
| AC4 | CRM rate limits → idempotent retries | **missing** | — |
| AC5 | Meter API calls + log sync results | **missing** | — |

## Reuse inventory (injected)
- spec-01 adapter pattern (the HubSpot adapter sits behind it); spec-02 `meter`; spec-26 hot-lead events — injected.

## Decisions (taken, full autonomy)
1. Build `lib/crm/*`, `lib/providers/hubspot/*`, `lib/notify/slack/*` (blast radius per spec). HTTP clients injected → deterministic, no schema, stub-tested.
2. **AC3 (do-not-clobber):** `mapManagedFields` writes ONLY the `managed` canonical fields (mapped to CRM props); any field the engine doesn't manage is never sent, so CRM-owned values are untouched.
3. **AC1:** `syncToCrm` upserts by `externalId ?? identity` — re-syncing the same entity updates, never duplicates.
4. **AC4:** rate-limit (`CrmRateLimitError`) → bounded idempotent retries (same upsert key, no dupes).
5. **AC2:** `notifySlack` formats context + link, posts via the injected Slack client, idempotent per hot-lead id; `handleHotLead` also updates the CRM deal stage.
6. **AC5:** the upsert is metered; `syncToCrm` returns a result the caller logs.
7. **No schema** (clients/mapping/meter/store injected) → mergeable off main.
