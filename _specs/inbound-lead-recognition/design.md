# Design — Inbound lead recognition

## System fit

Three surfaces conflate "received an email" with "is a lead":

| Surface | Source today | Defect |
|---|---|---|
| Warm leads waiting for a reply | `lib/deals/warm-leads.ts` `rankWarmLeads` | any contact with `inboundCount ≥ 1`; ICP only *weights* (1 vs 0.5), never excludes |
| Hot inbounds | `api/dashboard/hot-inbounds` ← `inngest/skill-events.ts` ← `inboundLeadQualificationHandler` | priority = ICP score + source boost only; no human/machine notion |
| Capture | `lib/capture/email-capture.ts` `captureInboundEmail` | auto-creates a person-contact from `noreply@…`, then emits `contact/created` → enrich → qualify → notify |

The only existing filter is `lib/email/is-free-provider.ts` (a hardcoded free-mail
set) — it does not cover vendor/SaaS domains, and extending it would be the
anti-pattern.

## The funnel (full design; tranche 1 in bold)

0. **Relationship direction (deterministic, DB).** Two-way conversation vs
   unsolicited inbound. — *tranche 1, in `rankWarmLeads`.*
1. **Machine vs human (deterministic, message + RFC headers).** Pure module. —
   *tranche 1.*
2. LLM relationship classifier (Haiku, ICP-aware): prospect vs vendor_we_pay /
   customer / recruiter / spam. — *tranche 2.*
3. Hard ICP floor inside the qualification skill (`determinePriority` requires
   human + prospect). — *tranche 2.*
4. "Not a lead" correction → few-shot teaching + per-domain short-circuit;
   one-time backfill/reclassify of the existing stock. — *tranche 3.*

## Data model

No migration. We reuse `activities.metadata` (jsonb) to store the verdict:

```ts
// activities.metadata.leadClassification
{
  senderType: "human" | "automated_transactional" | "automated_marketing"
            | "vendor" | "internal" | "unknown",
  isMachineSent: boolean,
  isBulk: boolean,
  reasons: string[],            // human-readable, product-language
  classifier: "deterministic-v1",
  classifiedAt: string,         // ISO
}
```

`isInboundLead` (the full verdict) is added in tranche 2 once the LLM stage
lands; tranche 1 writes only the deterministic fields.

## Module: `lib/inbound/lead-classification.ts` (pure)

```ts
export type SenderType =
  | "human" | "automated_transactional" | "automated_marketing"
  | "vendor" | "internal" | "unknown";

export interface SenderClassification {
  senderType: SenderType;
  isMachineSent: boolean;
  isBulk: boolean;
  isRoleAddress: boolean;
  reasons: string[];
}

export function classifyInboundSender(input: {
  fromHeader: string;
  subject?: string | null;
  text?: string | null;
  headers?: Record<string, string> | null;
}): SenderClassification;
```

Decision order (cheap → costly, first hard signal wins):
1. RFC bulk headers (`List-Unsubscribe`/`List-Id`) → `automated_marketing`.
2. RFC auto headers (`Precedence: bulk|list|junk`, `Auto-Submitted` ≠ no,
   `X-Auto-Response-Suppress`) → `automated_transactional`.
3. Role local-part (exact whole-local-part match, or `role+tag@`) →
   `automated_transactional`. The role set is **email-addressing
   conventions** (postmaster is RFC 5321-mandated), documented as protocol
   facts — not a business classification list.
4. Body-level bulk hint (an `unsubscribe`/`se désinscrire` link) → `isBulk`,
   weak signal that only escalates `senderType` when combined with (3).
5. Otherwise `human`, `isMachineSent=false`, `reasons=[]`.

Header access is case-insensitive (normalise keys to lower-case once).

## `captureInboundEmail` changes

- Extend `InboundEmailInput` with `headers?: Record<string,string> | null`
  (optional, back-compat; call-sites pass it when available — tranche 2 wires
  EmailEngine/IMAP/Gmail headers, tranche 1 leaves it undefined and relies on
  role detection).
- Compute `classification = classifyInboundSender({...})` once.
- Gate auto-creation: in the `!contact && domain && !ignored` branch,
  `createContact = !classification.isMachineSent && (shouldAutoCreate || (existingCo && mode!=="disabled"))`.
  Machine sender + unknown company ⇒ `unresolved_sender` (no orphan);
  machine sender + known company ⇒ company-attached activity (R9).
- Always attach `leadClassification` to the recorded activity's metadata (R6).
- The gate lives *only* in the unknown-sender branch, so a known contact or a
  tracked reply is unaffected (R8).

## `rankWarmLeads` changes

- Add `outboundCount = sum(direction='outbound')` to the aggregate select.
- Per row, after the existing ignored-domain and `inboundCount≥1` guards:
  - `cls = classifyInboundSender({ fromHeader: r.email })`; if
    `cls.isMachineSent` → skip (R10).
  - `twoWay = outboundCount ≥ 1`. If `!twoWay && icpFit < 1` → skip (R11).
  - else keep; ranking math unchanged (R12).
- ICP thus becomes a floor for unsolicited inbound while staying a weight in
  the composite for eligible rows.

## Data flow

EmailEngine webhook / IMAP cron / force-sync → `captureInboundEmail`
→ classify → metadata write + (gated) contact creation → `contact/created`
only for humans → enrich/qualify/notify. Dashue reads `rankWarmLeads`
(re-filters by role + two-way + ICP floor) and `hot-inbounds` (now starved of
machine-originated `contact/created` events at the source).

## Failure handling

- `classifyInboundSender` never throws; malformed `fromHeader` → `unknown`
  senderType, `isMachineSent=false` (fail-open to capture, never drop data).
- Classification is best-effort metadata; a classify failure must not block
  capture (wrap defensively).

## Security / tenancy

No new tables, no cross-tenant surface. Reuses existing tenant-scoped queries.
Classification reads only the message itself (no PII egress).
