# RECONCILE.md — Spec 17 Email Verification Waterfall (T0)

> Read-only reconciliation. A contact-email FINDER exists; multi-step VERIFICATION + the verified-before-sequence guard do not. `lib/emails/email-verification.ts` is **auth signup tokens** — unrelated.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 find | Find candidate emails across providers | **already** | `lib/providers/contact-enrichment/waterfall.ts` geo-routes + merges providers, finds a usable email. Reused (injected), not duplicated |
| AC1 verify | Multi-step syntax→domain→mailbox→catch-all→spam-trap → valid/risky/invalid/catch_all/unknown | **missing** | Existing `EmailStatus = verified\|likely\|unverified` is a coarse provider self-report (Apollo `email_status`), no real verification |
| AC2 | Verify BEFORE sequence; unverified NOT email-sendable | **missing** | No send-eligibility guard the sending path reads; `isReachable` measures enrichment completeness, not deliverability |
| AC3 | Invalid → exclude email, keep LinkedIn eligible if `linkedin_url` | **missing** | No such partition |
| AC4 | Cache + short TTL refresh, meter, budget, provenance | **partial** | Spec-08 `lib/enrichment/field` has cache/TTL/meter/budget, but not wired for email verification |
| AC5 | Reuse the 08 waterfall at contact scope | **n/a→honored** | The find half is injected (existing finder or spec-08 `enrichField(contactId,"email")`); verify does not re-implement provider ordering/metering |

## Reuse inventory
- `lib/enrichment/field/waterfall.ts` (spec 08) — cache-first → providers by (confidence÷cost) → meter each → stop at threshold → provenance + TTL → budget-aware. The mechanism; the email finder is its contact-scope instance (injected).
- `lib/providers/contact-enrichment/waterfall.ts` — existing contact email/mobile finder. The injected `findCandidateEmails` source.
- `lib/enrichment/field/{cache,ttl}.ts` — `FieldCache` + `fieldTtlMs` pattern reused for the verification cache/TTL.
- spec-02 `meter` — injected for the per-verification cost (AC4).

## Decisions (taken, full autonomy)
1. Build `lib/contacts/email/*` (blast radius `contacts/email/*`): `verify-email.ts` (verification + status mapping), `send-eligibility.ts` (AC2/AC3 guards), `index.ts`, tests.
2. **Status type `EmailVerificationStatus = valid\|risky\|invalid\|catch_all\|unknown`** — distinct name from the coarse `EmailStatus` (avoid collision); the coarse provider status feeds in as a signal, the verification status is the authoritative gate.
3. **AC1 verify:** syntax check is deterministic + free (fail → `invalid`, no spend). Domain/mailbox/catch-all/spam-trap via injected `VerifyProvider`, metered. `statusFromSignal` maps signals → the 5 statuses.
4. **AC2/AC3 as code guards:** `isEmailSendable(contact)` true only for verified-sendable statuses (default `{valid}`); `isLinkedInSendable(contact)` independent of email status → an invalid email keeps LinkedIn eligibility when `linkedin_url` is set.
5. **AC4:** verification cached by `(provider, contactId, email)` with a short TTL; metered; budget-guarded; provenance (provider + checkedAt) on the result.
6. **AC5:** find half injected (no duplicate ordering/metering). **No schema** (cache/meter/find/persist injected) → mergeable off main.
