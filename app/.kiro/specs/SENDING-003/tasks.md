# SENDING-003 — Self-Service Sending Onboarding: Tasks

Eval-first. This spec depends on SENDING-001 (warmup engine) and SENDING-002 (transport routing) — Tasks 1-6 here can be developed in parallel with SENDING-001/002 by stubbing their interfaces; integration tasks (7+) require both shipped.

---

## Task 1: Schema migrations — `managedDomains`, `provisioningJobs`, billing metadata extension
**Estimate:** 1h
**Eval:** Migration applies cleanly. Indices on `managedDomains.fqdn` (unique), `tenantId`, `status`. `provisioningJobs.tenantId` indexed.
**Implementation:** Per `design.md` data model deltas.
**Verify:** `pnpm --filter web drizzle-kit push` succeeds.

---

## Task 2: Pure functions — DNS record generation
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/dns-records.test.ts`
- `generateSpfRecord('pierre-1.revenue-mail.com')` returns valid SPF with `include:` for transports
- `generateDkimRecord(domain, pubkey, selector)` returns `{name: 'selector._domainkey.domain', value: 'v=DKIM1; k=rsa; p=...'}`
- `generateDmarcRecord(domain, 'none')` returns `_dmarc.{domain}` with `v=DMARC1; p=none; rua=mailto:dmarc@elevay.com`
- DKIM record value is well-formed and ≤ 255 chars per chunk (DNS limitation)
- All records pass `dig`-style format validation
**Implementation:** `apps/web/src/lib/sending/dns-records.ts`
**Verify:** `pnpm vitest run dns-records`

---

## Task 3: Cloudflare registrar adapter
**Estimate:** 4h
**Eval:** `apps/web/src/__tests__/registrar-cloudflare.test.ts` (with mocked Cloudflare API)
- `registerSubdomain('revenue-mail.com', 'pierre-1')` calls correct Cloudflare endpoint, returns `{success: true, registrarMetadata}`
- `setDnsRecord` for SPF/TXT/DKIM/DMARC each issues correct API call
- `verifyDnsRecord` performs actual DNS lookup (in tests, mock the resolver)
- 5xx errors propagate as `RegistrarError` with `retryable: true`
- 4xx errors propagate as `retryable: false`
- Rate limits (429) surface `Retry-After` header
**Implementation:** `apps/web/src/lib/sending/registrars/cloudflare.ts`
**Verify:** `pnpm vitest run registrar-cloudflare`; manual test against a Cloudflare sandbox zone.

---

## Task 4: Porkbun registrar adapter (fallback)
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/registrar-porkbun.test.ts` — same shape as Task 3
**Implementation:** `apps/web/src/lib/sending/registrars/porkbun.ts`
**Verify:** `pnpm vitest run registrar-porkbun`

---

## Task 5: Domain pool management
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/domain-pool.test.ts`
- `allocateFromPool(tenantId, count)` returns up to `count` domains from `managedDomains` where `tenantId IS NULL AND status = 'pool' AND recyclableAfter < NOW()`
- Marks them assigned (sets tenantId, assignedAt, status='active') atomically
- `releaseDomain(domainId)` sets `releasedAt`, status='cooling_off', schedules recycle after 12 months
- `recycleEligibleDomains` cron returns to pool only those past `recyclableAfter`
- Race-free: two concurrent allocations don't double-assign
**Implementation:**
1. `apps/web/src/lib/sending/domain-pool.ts`
2. Inngest cron `apps/web/src/inngest/domain-recycle-cron.ts` (daily)
3. Bootstrap script to seed pool with N pre-registered domains
**Verify:** `pnpm vitest run domain-pool`

---

## Task 6: Provisioning service — managed path
**Estimate:** 5h
**Eval:** `apps/web/src/__tests__/provisioning-managed.test.ts`
- `provisionManagedDomains(tenantId, 3)` allocates from pool or registers new
- For each domain: configures SPF/DKIM/DMARC/MX, verifies, creates `connectedMailboxes` row
- Updates `provisioningJobs.progress` after each step
- Cloudflare failure → falls back to Porkbun
- Both registrars failing → queues manual review, returns honest error
- DNS verification retries 3x over 90s, fails gracefully
- Generates unique DKIM keypair per domain, stores private key encrypted
- Race condition: re-running provisioning for the same tenant doesn't double-allocate
**Implementation:**
1. `apps/web/src/lib/sending/provisioning.ts`
2. Inngest function `apps/web/src/inngest/provision-managed.ts` (orchestrates the flow with checkpointed steps)
3. DKIM keypair generation via `node:crypto`
**Verify:** `pnpm vitest run provisioning-managed`; staging test with a real test tenant.

---

## Task 7: BYOD path — instruction generation + verification
**Estimate:** 4h
**Eval:** `apps/web/src/__tests__/provisioning-byod.test.ts`
- `provisionByodDomain(tenantId, 'martin.com')` returns expected DNS records (SPF, DKIM, DMARC) tied to a verification token
- `verifyByodDomain` runs DNS lookups for each expected record, returns per-record status
- DNS provider hints: detects user's DNS provider from NS records and surfaces provider-specific quick-link
- Records generation is deterministic (same domain → same records, except DKIM keypair which is generated once per BYOD attempt)
- Verification idempotent (calling twice doesn't break anything)
**Implementation:**
1. Extend `provisioning.ts` with `provisionByodDomain` and `verifyByodDomain`.
2. New `apps/web/src/lib/sending/byod-instructions.ts` — provider detection + instruction templates.
3. Inngest function `apps/web/src/inngest/provision-byod.ts` for the verification flow with retries.
**Verify:** `pnpm vitest run provisioning-byod`

---

## Task 8: Onboarding wizard — sending-mode step + provisioning UI
**Estimate:** 5h
**Eval:** `apps/web/tests/e2e/onboarding-sending.spec.ts` (Playwright)
- After ICP step, user lands on sending-mode step with managed pre-selected
- Clicking "Set up managed" triggers provisioning, shows real-time progress
- Progress UI updates within 2s of each backend step
- BYOD path shows generated DNS records with copy buttons + provider quick-links
- BYOD verify button calls API, shows per-record results inline
- "Connect existing mailbox" path shows the AC-10 warning, requires explicit acknowledgment to proceed
- All paths converge on a "ready-to-explore" screen with timeline preview
- User can navigate away and return to `/onboarding/sending/status` to see progress
**Implementation:**
1. Add `sending-mode` step to `apps/web/src/components/onboarding-wizard.tsx`
2. New components: `sending-mode-selector.tsx`, `provisioning-progress.tsx`, `byod-instructions.tsx`, `byod-verification.tsx`, `existing-mailbox-warning.tsx`
3. Server actions and API routes:
   - `POST /api/onboarding/provision/managed`
   - `POST /api/onboarding/provision/byod/start`
   - `POST /api/onboarding/provision/byod/verify`
   - `GET /api/onboarding/provision/status?tenantId=…`
4. Status page: `apps/web/src/app/(dashboard)/onboarding/sending/status/page.tsx`
**Verify:** `pnpm --filter web playwright test onboarding-sending`; manual UX walkthrough.

---

## Task 9: Inbound mail processor for reply routing
**Estimate:** 5h
**Eval:** `apps/web/src/__tests__/inbound-processor.test.ts`
- Inbound webhook (from SES/Postmark inbound parsing) parses email correctly
- Looks up tenant via recipient domain in `managedDomains`
- Persists to `inboundEmails` table
- Forwards to user's connected primary inbox via that inbox's send capability
- Threading preserved (In-Reply-To / References intact)
- Spam filtering: very basic — drops if SPF/DKIM/DMARC of sender all fail (return 250 OK to avoid bounce loops, but discard internally)
- Idempotent: same message delivered twice doesn't double-record
**Implementation:**
1. Choose inbound provider: SES (cheapest at scale) or Postmark (easier to start). Recommend Postmark for MVP — switch to SES at scale.
2. Configure managed-domain MX records to point to provider
3. `apps/web/src/app/api/inbound/route.ts` to receive webhook
4. Forward via existing email transport for the user's connected inbox
**Verify:** `pnpm vitest run inbound-processor`; staging test: send email to managed sub-domain, verify it appears in user's inbox + Elevay UI.

---

## Task 10: Warmup-aware draft holding
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/warmup-aware-drafts.test.ts`
- A cold email drafted while warmup is in progress is saved with status `holding_for_warmup`
- UI shows banner "Will send when warmup completes on [date]"
- When warmup completes (SENDING-001 marks `warmupCompletedAt`), held emails are automatically dispatched
- User can manually override with explicit confirmation dialog (per SENDING-001 AC-10)
**Implementation:**
1. Extend `outboundEmails` status enum with `holding_for_warmup`
2. Inngest function listens for `warmup_completed` event and releases held emails
3. UI component for the holding banner in email composer
**Verify:** `pnpm vitest run warmup-aware-drafts`

---

## Task 11: Pool seeding script + admin dashboard
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/pool-seeding.test.ts` + admin Playwright test
- Script `scripts/seed-domain-pool.ts` registers N domains across primary + secondary registrars
- Admin dashboard at `/admin/sending/pool` shows: pool size, registrar split, allocation rate, in-flight provisionings, failed jobs
- Admin can manually release a stuck domain back to pool
**Implementation:**
1. Seeding script
2. Admin page at `apps/web/src/app/admin/sending/pool/page.tsx`
**Verify:** `pnpm vitest run pool-seeding`; visual check on admin.

---

## Task 12: Cost accounting
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/sending-cost-accounting.test.ts`
- Each provisioning records cost in `tenantBillingMetadata.sendingInfraCostMonthly`
- Costs roll up correctly per tenant
- Admin dashboard shows aggregate cost across all tenants
**Implementation:** Extend provisioning service to write cost records.
**Verify:** `pnpm vitest run sending-cost-accounting`

---

## Task 13: Phase 6 eval — full end-to-end onboarding test
**Estimate:** 1 day
**Eval:** Per requirements.md "Evaluation steps":
1. Time managed provisioning ≤ 5 min ✓
2. Verify SPF/DKIM/DMARC via mxtoolbox ✓
3. Reply routing works ✓
4. BYOD path works in ≤ 20 min for non-technical user (recruit a test user) ✓
5. Cloudflare failure → Porkbun fallback ✓
6. Tenant deletion → 90-day cooling-off → 12-month recycle ✓
7. Cost accounting accurate ✓
**Pass criterion:** all 7 evaluation steps pass.

---

## Sprint sequencing
- Tasks 1-2: day 1 (parallel).
- Tasks 3-4: days 2-3 (parallel, two engineers ideal).
- Tasks 5-7: days 4-6.
- Task 8 (UI): days 5-7.
- Task 9: day 8.
- Task 10-12: days 9-10.
- Task 13 (eval): day 11.

**Total:** ~38h engineering + 1 day eval. Realistic 2-week sprint with two engineers, 3-week solo.

## Dependencies
- SENDING-001 must ship before Task 10 + Task 13 (need warmup engine running)
- SENDING-002 must ship before Task 13 (need transport routing for full E2E test)
- SENDING-003 Tasks 1-9 can develop in parallel with SENDING-001/002

## Critical path for first-customer acquisition
**To unblock Martin's own outbound from inside Elevay:**
- SENDING-002 Tasks 1-6 ship → Martin can connect his Instantly account
- SENDING-003 Tasks 1-8 ship → Martin can complete onboarding self-service
- SENDING-001 ships → warmup runs against the provisioned domains

After all three sprints complete, Martin can onboard Elevay-on-Elevay, provision 3 managed domains, wait 14 days for warmup, and start cold sending — all from inside the product, no external tools.
