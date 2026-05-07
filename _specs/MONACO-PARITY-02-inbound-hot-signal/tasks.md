# MONACO-PARITY-02 — Tasks

Branch: `feat/MONACO-PARITY-02-inbound-hot-signal`.

1. **Synchronous TAM lookup in webhook**
   - Edit `app/api/webhooks/inbound/route.ts`: after `inbound-lead-enrichment` enqueue, do a SELECT on `companies.score`.
   - If score available, emit signal + notification synchronously (still <500ms total).
   - If null, emit signal with `priority = "scoring_pending"`.
   - Verify: POST fixture A-grade payload → `signals` row exists with `priority = "hot"` within the same request.
   - Test: `__tests__/inbound-hot-signal.test.ts` with seeded TAM.

2. **Idempotency key**
   - Add `formProviderEventId` to webhook payload schema.
   - Use `signals.properties.formProviderEventId` as a UNIQUE constraint or upsert key.
   - Verify: POST same payload twice → 1 signal row.

3. **Inngest re-score job**
   - Create `inngest/score-tam-match.ts`: triggered by `enrichment/contact-enriched`.
   - Re-fetch score, upgrade signal priority + create notification if applicable.
   - Verify: post unknown-domain payload, run enrichment + scoring, assert signal upgrades from `scoring_pending` to `hot`.

4. **Hot inbounds dashboard widget**
   - Component: `app/(dashboard)/home/components/hot-inbounds-widget.tsx`.
   - Hits `/api/dashboard/hot-inbounds` (new) which executes the design.md SQL.
   - Each card shows: avatar, name, company, score, time since submission, "Reply" CTA → opens email composer.
   - Verify: 3 hot signals seeded → widget shows 3 cards in newest-first order.

5. **Free-email-provider guard**
   - Pre-existing helper `is-free-provider.ts` — call it before company match.
   - If free provider, set `priority = "requires_manual_match"`, surface in a separate widget.
   - Verify: `jane@gmail.com` payload → goes to manual-match queue.

6. **Doc update**
   - Update `MONACO-PARITY-PLAN.md` row → ✅.
