# FUSE-GAP-1 · tasks

Each task: **code → write test → verify → commit**. Per CLAUDE.md Phase 5.

Order matters. Don't skip verification — tests enable autonomous merge.

## Prereqs (human decisions, 1 day)

| # | Task | Owner | Output |
|---|---|---|---|
| P1 | Sign Dropcontact contract (or use free tier for MVP) | Martin | API key in `.env.local` as `DROPCONTACT_API_KEY` |
| P2 | Sign Hunter contract (Starter plan minimum) | Martin | API key as `HUNTER_API_KEY` |
| P3 | Approve monthly cap per plan (Free 20, Starter 200, Pro 2000) | Martin | Confirmed in chat / this file |

Estimated prereq time : 1-2 business days depending on vendor response.

## Branch

`feat/FUSE-GAP-1-person-enrichment` (off `main`)

## Tasks

### T1 — DB migration: enrichment_cache + enrichment_audit_log + enrichment_provider_health

**Files:**
- `app/apps/web/src/db/enrichment-schema.ts` (new)
- `app/apps/web/drizzle/<timestamp>_enrichment.sql` (generated)

**Code:**
```typescript
// enrichment-schema.ts — follow drizzle pattern of db/schema.ts
export const enrichmentCache = pgTable('enrichment_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  lookupKey: text('lookup_key').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email'),
  confidence: text('confidence').$type<'high'|'medium'|'low'|'inferred'>(),
  source: text('source').notNull(),
  status: text('status').$type<'valid'|'catch-all'|'risky'|'invalid'>(),
  fullResponse: jsonb('full_response'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (t) => ({
  uniq: unique().on(t.tenantId, t.lookupKey),
  idxLookup: index().on(t.tenantId, t.lookupKey),
}));
// + enrichmentAuditLog + enrichmentProviderHealth (see design.md)
```

**Test:**
- Unit : `db/enrichment-schema.test.ts` — insert + select + unique constraint
- Migration runs cleanly forward AND reverse on a dev DB snapshot

**Verify:**
- `pnpm drizzle generate` produces expected migration
- `pnpm drizzle migrate` + `drizzle studio` shows tables

**Commit:** `feat(enrichment): T1 — schema for cache + audit + provider health`

---

### T2 — DropContact provider implementation

**Files:**
- `app/apps/web/src/lib/enrichment/providers/dropcontact.ts` (new)
- `app/apps/web/src/lib/enrichment/providers/types.ts` (new)

**Code:**
```typescript
// dropcontact.ts
export const dropContactProvider: EnrichmentProvider = {
  name: 'dropcontact',
  costPerLookup: 20,
  async lookup(input) {
    const start = Date.now();
    const res = await fetch('https://api.dropcontact.io/batch', {
      method: 'POST',
      headers: { 'X-Access-Token': process.env.DROPCONTACT_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{ first_name: input.firstName, last_name: input.lastName, website: input.companyDomain }],
        siren: true, language: 'en',
      }),
    });
    if (!res.ok) throw new ProviderError('dropcontact', res.status);
    const json = await res.json();
    const item = json.data?.[0];
    return {
      email: item?.email?.[0]?.email || null,
      confidence: mapDropContactConfidence(item?.email?.[0]?.qualification),
      status: mapDropContactStatus(item?.email?.[0]?.qualification),
      opted_out: item?.email?.[0]?.opt_out === true,
      full_response: item,
      latencyMs: Date.now() - start,
      creditsCharged: item?.email?.[0]?.email ? 20 : 0,
    };
  },
};
```

**Test:**
- `lib/enrichment/providers/dropcontact.test.ts` — mock fetch, verify mapping for (a) high confidence match (b) catch-all (c) opt-out (d) 429 rate-limited (e) 500 error
- Integration : one real call with dev API key to verify response schema hasn't drifted

**Verify:**
- `pnpm test lib/enrichment/providers/dropcontact`
- Manual : `node -e "require('./lib/enrichment/providers/dropcontact').dropContactProvider.lookup({firstName:'Aaron',lastName:'Levie',companyDomain:'box.com'})"`

**Commit:** `feat(enrichment): T2 — DropContact provider with unit + one integration test`

---

### T3 — Hunter provider implementation

**Files:**
- `app/apps/web/src/lib/enrichment/providers/hunter.ts` (new)

**Code:** Symmetric to T2. Hunter confidence is 0-100 → map to high/medium/low via thresholds.

**Test:** 5 unit + 1 integration (same structure as T2).

**Verify:** `pnpm test lib/enrichment/providers/hunter`

**Commit:** `feat(enrichment): T3 — Hunter provider with unit + integration tests`

---

### T4 — LLM inference fallback

**Files:**
- `app/apps/web/src/lib/enrichment/inference.ts` (new)

**Code:**
```typescript
// Given firstName, lastName, domain → infer most likely email pattern
export async function llmInferEmail(input: InferenceInput): Promise<InferenceResult | null> {
  // 1. Try pattern cache for this domain (if we've seen other emails for this domain, reuse pattern)
  const pattern = await getPatternForDomain(input.companyDomain);
  if (pattern) {
    const email = applyPattern(pattern, input.firstName, input.lastName, input.companyDomain);
    return { email, confidence: 'inferred', patternUsed: pattern };
  }
  // 2. Ask Claude Haiku (cheap) to guess the most common pattern for a company
  //    using its general knowledge + prompt with domain clues (e.g. "bigcompany.com")
  const suggestion = await claude.messages.create({
    model: 'claude-haiku-4-5',
    messages: [{ role: 'user', content: `What is the most likely email pattern for a company at ${input.companyDomain}? Return JSON: { pattern: "first.last" | "first" | "f.last" | "firstlast" | null }` }],
    max_tokens: 50,
  });
  // Parse + apply pattern
}
```

**Test:**
- Patterns: Elevay.dev → most likely "first.last@elevay.dev" (observed pattern)
- Null for unknown domain : does not hallucinate an email

**Verify:** `pnpm test lib/enrichment/inference`

**Commit:** `feat(enrichment): T4 — LLM fallback for unmatched lookups`

---

### T5 — Core EnrichmentService (orchestrator)

**Files:**
- `app/apps/web/src/lib/enrichment/service.ts` (new)
- `app/apps/web/src/lib/enrichment/cache.ts` (new)
- `app/apps/web/src/lib/enrichment/audit.ts` (new)
- `app/apps/web/src/lib/enrichment/quota.ts` (new)

**Code:**
- `service.ts` : exports `enrichPersonEmail(input, tenantContext)` — orchestration per design.md algorithm
- `cache.ts` : `get`, `set`, `invalidate` — reads/writes `enrichment_cache` table
- `audit.ts` : `log(event)` — writes `enrichment_audit_log`, never throws (best-effort)
- `quota.ts` : `checkAndIncrement(tenantId, eventType, cost)` — uses existing `billing.ts` patterns

**Test:**
- End-to-end unit : cache hit short-circuits, cache miss calls dropcontact then hunter then inference in order, opt-out returns no_match, quota exceeded throws, audit is logged for every path
- Concurrency : 10 parallel calls for same person → only 1 hits provider (in-flight dedup)

**Verify:** `pnpm test lib/enrichment/service`

**Commit:** `feat(enrichment): T5 — EnrichmentService orchestrator with cache + audit + quota`

---

### T6 — HTTP endpoints

**Files:**
- `app/apps/web/src/app/api/enrich/person-email/route.ts` (new)
- `app/apps/web/src/app/api/enrich/person-email/batch/route.ts` (new)
- `app/apps/web/src/app/api/enrich/person-email/jobs/[jobId]/route.ts` (new)

**Code:**
- Single POST : validates body, calls service, returns result
- Batch POST : creates Inngest job, returns jobId
- Job GET : returns progress + results

**Test:**
- Playwright e2e (`tests/e2e/enrichment-api.spec.ts`) : valid request → 200 with schema. Invalid → 400. Quota exceeded → 402 with `Retry-After`. Free email → 422.

**Verify:** `pnpm test:e2e tests/e2e/enrichment-api`

**Commit:** `feat(enrichment): T6 — HTTP endpoints (single + batch + job status)`

---

### T7 — Inngest batch worker

**Files:**
- `app/apps/web/src/inngest/functions/enrichment-batch.ts` (new)

**Code:** standard Inngest pattern — receives `enrichment.batch.requested`, iterates over items with rate-limit-aware throttling, emits progress events, finalizes with `enrichment.batch.completed`.

**Test:** integration test submitting 10 items, waits for completion, asserts all processed.

**Verify:** `pnpm test:integration inngest/enrichment-batch`

**Commit:** `feat(enrichment): T7 — async batch worker via Inngest`

---

### T8 — Chat tool `enrichPersonEmail`

**Files:**
- `app/apps/web/src/lib/chat/tools/enrichment.ts` (new or add to existing `action.ts`)
- Update `app/apps/web/src/lib/chat/tools/index.ts` registry

**Code:**
```typescript
export const enrichPersonEmailTool = defineTool({
  name: 'enrichPersonEmail',
  description: 'Find the corporate email address of a person given their name and company or domain. Costs credits. Returns email + confidence score + source. Respects opt-out preferences.',
  parameters: z.object({
    firstName: z.string(),
    lastName: z.string(),
    companyDomain: z.string().optional(),
    companyName: z.string().optional(),
    contactId: z.string().uuid().optional(),
  }),
  async execute(params, context) {
    const result = await enrichmentService.enrichPersonEmail(params, context);
    if (params.contactId && result.email) {
      await updateContact(params.contactId, { email: result.email });
    }
    return result;
  },
});
```

**Test:** unit test that the tool is registered + simulates a chat request invoking it.

**Verify:** `pnpm test lib/chat/tools/enrichment`

**Commit:** `feat(enrichment): T8 — chat tool enrichPersonEmail + contact update on match`

---

### T9 — UI: "Find email" button on contact detail

**Files:**
- `app/apps/web/src/app/(dashboard)/contacts/[id]/page.tsx` (modify)
- `app/apps/web/src/components/enrichment/find-email-button.tsx` (new)

**Code:** button shown only if contact.email is empty; on click, calls API, shows spinner ≤ 8s, displays badge Confidence / Source, handles errors.

**Test:**
- Playwright : visit contact page for test contact with no email → click button → assert email appears + badge shown.

**Verify:** `pnpm test:e2e tests/e2e/enrichment-ui`

**Commit:** `feat(enrichment): T9 — FindEmail button on contact detail`

---

### T10 — UI: batch enrichment on Prospect Search / Lists

**Files:**
- `app/apps/web/src/app/(dashboard)/prospects/search/page.tsx` (modify)
- `app/apps/web/src/app/(dashboard)/prospects/lists/[listId]/page.tsx` (modify)
- `app/apps/web/src/components/enrichment/batch-enrich-dialog.tsx` (new)

**Code:** checkbox selection + "Enrich emails" button → opens dialog showing (a) selected count (b) cached already (c) estimated credits (d) confirm → submit batch → progress toast.

**Test:** Playwright e2e flow with 5 contacts mock batch.

**Verify:** `pnpm test:e2e tests/e2e/enrichment-batch-ui`

**Commit:** `feat(enrichment): T10 — batch enrichment UI from lists + search`

---

### T11 — Admin: enrichment settings page

**Files:**
- `app/apps/web/src/app/(dashboard)/settings/enrichment/page.tsx` (new)

**Code:** admin-only (gated via `requireAdmin()`), panel shows per-provider stats from `enrichment_provider_health`, toggle enable/disable per provider, configure waterfall order. Uses existing `/settings` layout.

**Test:** Playwright e2e — admin sees panel, non-admin sees 403.

**Verify:** `pnpm test:e2e tests/e2e/settings-enrichment`

**Commit:** `feat(enrichment): T11 — admin settings page for enrichment providers`

---

### T12 — RGPD export in `/settings/data-privacy`

**Files:**
- `app/apps/web/src/app/(dashboard)/settings/data-privacy/page.tsx` (modify or create)
- `app/apps/web/src/app/api/settings/data-privacy/enrichment-log/route.ts` (new)

**Code:** button "Export enrichment log (CSV)" → downloads CSV of `enrichment_audit_log` for tenant.

**Test:** e2e — export triggers download with expected columns.

**Verify:** `pnpm test:e2e tests/e2e/data-privacy-export`

**Commit:** `feat(enrichment): T12 — RGPD export of enrichment audit log`

---

### T13 — Pricing page update

**Files:**
- `app/apps/web/src/app/(marketing)/pricing/page.tsx` (modify)
- `app/apps/web/src/app/(marketing)/page.tsx` (optionally mention in homepage FAQ)

**Code:** update pricing table cells to show "Person email enrichment : Free trial 20, Starter 200, Pro 2000, Enterprise custom". Clear labeling.

**Test:** visual regression via Playwright screenshot diff.

**Verify:** `pnpm test:e2e tests/e2e/pricing-page-screenshot`

**Commit:** `feat(enrichment): T13 — expose enrichment quotas in public pricing`

---

### T14 — Documentation (internal + customer-facing)

**Files:**
- `_research/enrichment-v1.md` (new, internal runbook)
- `docs/public/enrichment.md` (new, customer-facing)
- Update `BATTLECARD.md` to reflect that person-level email gap is now closed

**Content:**
- Internal : how to add new provider, how to debug a no_match, how to refund credits on provider outage, escalation contacts for Dropcontact/Hunter
- Customer : how it works in 3 paragraphs + FAQ

**Test:** N/A (docs).

**Verify:** Martin reviews.

**Commit:** `docs(enrichment): T14 — runbook + customer docs + battlecard update`

---

### T15 — Nightly health rollup

**Files:**
- `app/apps/web/src/inngest/functions/enrichment-health-rollup.ts` (new)

**Code:** runs daily at 03:00 UTC, aggregates previous day's `enrichment_audit_log` into `enrichment_provider_health` for dashboard.

**Test:** insert fake audit rows, run the aggregator, verify rollup row.

**Verify:** `pnpm test:integration inngest/enrichment-health-rollup`

**Commit:** `feat(enrichment): T15 — nightly health rollup for admin dashboard`

---

### T16 — Phase 6 hostile QA

**Per CLAUDE.md Phase 6.** SWITCH ROLES. Guilty until proven innocent.

- Run all ACs literally with Playwright on live staging
- Test each edge case E1–E10
- Compare results to FuseAI enrichment (same 10 test profiles) for parity/regression check
- Score on 5 dimensions (functional / robustness / observability / UX / security) per `_harness/EVAL_RUBRIC.md`
- **Hard threshold to pass**: 8/10 functional + 7/10 security + 7/10 robustness. No dimension below 6.
- If fail 2×: delete branch, back to spec.

**Commit on PASS:** merge `feat/FUSE-GAP-1-person-enrichment` to main via PR.

---

## Total effort estimate

| Phase | Estimated days |
|---|---:|
| Prereqs (contracts + API keys) | 1-2 cal. days |
| T1-T4 (schema + providers) | 3 days |
| T5 (orchestrator + tests) | 2 days |
| T6-T7 (API + batch worker) | 2 days |
| T8 (chat tool) | 1 day |
| T9-T12 (UI + admin + RGPD) | 3 days |
| T13-T15 (pricing + docs + rollup) | 1 day |
| T16 (hostile QA + fixes) | 2 days |
| **Total** | **~14 work days** |

Calendar : ~3 weeks with 1 dev full-time, or ~5 weeks at half-time.

## Definition of Done

- [ ] All T1-T15 committed + tests green
- [ ] T16 hostile QA passed with score ≥ 8/7/7
- [ ] Merged to main
- [ ] Stage rollout to 3-5 alpha tenants for 1 week
- [ ] Public announcement (pricing + blog)
- [ ] BATTLECARD.md updated to move "Person-level enrichment" from "Where we LOSE" to "Where we GAIN"
- [ ] NEXT_ACTIONS.md N8 marked ✅

## Rollback criteria

If any of these happen in production within 7 days post-GA, revert to free-tier stub:
- Match rate < 60 % on real user workloads
- Provider downtime affecting > 30 % of tenants
- RGPD incident (opted-out contact enriched)
- Credit consumption 2× higher than forecast without matching user complaint rate
