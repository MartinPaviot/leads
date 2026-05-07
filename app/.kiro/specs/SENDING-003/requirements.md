# SENDING-003 — Self-Service Sending Onboarding: Requirements

## Audit pillar
Sending infrastructure / Onboarding friction (Blocker #1 from the codebase audit, completes the trio with SENDING-001 + SENDING-002).

## Problem statement
The current onboarding (`apps/web/src/components/onboarding-wizard.tsx`) has steps for product + ICP definition but no path to provision a working cold-sending infrastructure. The `connectedMailboxes` table supports BYO mailboxes, and `sendingInfraRequests` (`apps/web/src/db/schema/agent.ts:28-48`) implies a manual ops-handoff queue for managed domains. There is no fully self-service flow from "sign up" to "ready-to-send-cold." Founders abandon at this gap.

## Acceptance criteria (EARS notation)

### AC-1: Default path is fully managed, zero-friction
WHEN a new tenant completes the product + ICP wizard,
the next step SHALL be "Set up sending infrastructure" with managed-mode pre-selected,
AND clicking "Continue" SHALL trigger automatic provisioning of 3 managed sending domains under the tenant,
AND the user SHALL NOT need to leave the product or interact with any registrar.

### AC-2: Managed domain provisioning
WHEN managed provisioning is triggered,
the system SHALL:
1. Generate 3 deterministic domain candidates following the pattern `{ELEVAY_DOMAIN_BASE}` (configurable, e.g. `mail-fr.com`, `outreach-mail.com`, `revenue-mail.com` — owned by Elevay, not subdomains of `elevay.com`)
2. For each: register a unique subdomain like `{tenant-slug}-{N}.{base}` via the primary registrar (Cloudflare API)
3. Configure SPF, DKIM (generate keypair), DMARC records via DNS API
4. Verify each record via DNS lookup before marking the domain `provisioned`
5. Create 1 mailbox per domain (3 total) in `connectedMailboxes`, status `warming_up`
6. Trigger SENDING-001's warmup engine for each
**Total elapsed time:** ≤ 5 minutes from button click to "warmup started" state.

### AC-3: Registrar resilience
WHEN the primary registrar (Cloudflare) returns an error or is unreachable,
the provisioning SHALL fall back to the secondary registrar (Porkbun) for that domain,
AND SHALL log the fallback to `pipelineEvents` with `stage = 'registrar_fallback'`,
AND if both fail, SHALL queue the domain for manual ops review and notify the user with an honest "we'll be ready in 24h instead of 5min" status.

### AC-4: BYOD path for power-users
WHEN the user selects "Bring my own domain" instead of managed,
the system SHALL:
1. Ask for the domain they want to use
2. Generate the exact DNS records needed (SPF, DKIM with a unique selector per Elevay, DMARC, MX if needed for replies)
3. Display copy-paste instructions with provider-specific quick-links (Cloudflare, Namecheap, GoDaddy, Route 53, OVH)
4. Provide a "Verify" button that runs DNS lookups for each record
5. Surface specific errors per record ("DKIM not found", "SPF includes wrong value", etc.)
6. Once all verified, create `connectedMailboxes` row with `provider = 'custom-domain'` and status `warming_up`

### AC-5: Honest timeline preview
WHEN provisioning starts (managed or BYOD),
the user SHALL see a timeline:
- Day 0: domain registered + DNS configured + mailboxes created
- Day 1-14: warmup in progress (real-time progress visible)
- Day 14+: ready to send cold
AND SHALL be able to use Elevay's other features (ICP refinement, list building, signal monitoring, drafting in saved-state) during warmup,
AND drafted cold emails SHALL show a banner "Will send when warmup completes on [estimated date]" instead of being silently held.

### AC-6: Sub-domain hygiene
WHEN registering managed sub-domains,
the parent domain SHALL be a clean, neutral, never-used-for-product-marketing TLD (e.g. `revenue-mail.com`, NOT `elevay.com`),
AND SHALL be one Elevay registers and protects (not a shared service domain),
AND the sub-domain pattern SHALL avoid words flagged by spam filters (no "promo", "deals", "win"),
AND sub-domains SHALL look human (e.g. `pierre-3.revenue-mail.com`, NOT `tnt-x7q.revenue-mail.com`).

### AC-7: Per-domain cost accounting
WHEN provisioning managed domains,
the system SHALL record the cost per tenant per domain (registrar fee + DNS API costs) in `tenantBillingMetadata`,
AND SHALL surface this in admin reporting so unit economics stay visible.

### AC-8: Reverse path (deletion / churn)
WHEN a tenant churns,
managed domains SHALL be released back to a recyclable pool after 90 days (in case they reactivate),
AND SHALL NOT be re-assigned to a different tenant for at least 12 months (avoid reputation contamination from previous tenant's behavior).

### AC-9: Replies routing
WHEN a recipient replies to a cold email sent from a managed domain `{tenant-slug}-1.revenue-mail.com`,
the reply SHALL route to the user's actual inbox (their Gmail/Outlook/etc.) AND SHALL appear in Elevay's inbox view,
AND threading SHALL preserve correctly so the user can reply from Elevay (sent again via the managed domain).
**Method:** managed domains have an MX record pointing to Elevay's inbound mail processor, which forwards to the user's connected primary inbox + persists the message in Elevay's `inboundEmails` table.

### AC-10: Connect existing mailbox path (separate from managed)
WHEN the user prefers to connect their existing Google Workspace / Microsoft 365 mailbox (their corporate inbox),
the existing OAuth flows for Gmail/Outlook SHALL continue to work,
AND the system SHALL warn explicitly: "Sending cold from your primary corporate domain risks burning your domain reputation. We strongly recommend the managed-domain path. Continue anyway?"
AND if the user proceeds, the existing `sending-identity.ts` guardrail still blocks cold-on-primary unless overridden.

### AC-11: Zero-touch warmup integration
WHEN managed mailboxes are created,
SENDING-001's warmup engine SHALL automatically pick them up on next tick,
AND warmup SHALL use the cross-tenant warmup network by default (managed mailboxes opt in automatically; BYOD mailboxes default to opt-out, user-toggleable).

### AC-12: Onboarding state persistence
WHEN the user navigates away during provisioning (refreshes, closes tab, comes back later),
the provisioning state SHALL be visible on dashboard at `/onboarding/sending/status`,
AND background jobs SHALL continue regardless of session state,
AND user SHALL receive an email when provisioning completes.

## Edge cases
- **Domain name collision:** if the deterministic pattern produces an already-taken sub-domain (extremely unlikely but possible), increment the counter (`pierre-1` → `pierre-2`) until available.
- **Tenant slug contains special characters:** sanitize to `[a-z0-9-]`, max 20 chars, append random 3-char suffix if needed for uniqueness.
- **Registrar account at quota:** Cloudflare allows N domains per account; track usage and rotate to a fresh Elevay-owned account when threshold reached.
- **DNS propagation delays:** record creation is API-instant, but verification can fail for ~60s due to TTL. Retry verification 3 times over 90s before declaring failure.
- **DKIM key rotation:** initial provisioning generates a 2048-bit keypair, rotated annually (separate cron, not in scope here).
- **DMARC policy:** start at `p=none` for warmup phase, escalate to `p=quarantine` after warmup complete. Auto-rule.
- **MX conflicts on BYOD:** if user's domain has existing MX records (corporate Google), don't overwrite — only add the necessary outbound records and use existing MX for replies.
- **User refuses managed AND refuses BYOD:** they connect their primary mailbox; AC-10 warning applies; cold sends still blocked by guardrail unless override.
- **Local dev:** all of this should be skippable in dev mode with mocked registrar responses.

## Evaluation steps (Phase 6)
1. Create a brand-new test tenant.
2. Walk through onboarding choosing managed path.
3. Time the provisioning. **Pass criterion:** ≤ 5 minutes from "Continue" to "warmup started".
4. Verify all 3 domains have correct SPF/DKIM/DMARC records via independent DNS lookup tool (mxtoolbox).
5. Verify reply routing: send a test cold email manually (override warmup), reply to it from another mailbox, confirm reply appears in Elevay inbox.
6. Walk through BYOD path with a test domain pointing to Cloudflare. **Pass criterion:** instructions are clear enough that a non-technical user can follow them in ≤ 15 minutes; verification works.
7. Force registrar failure (mock Cloudflare 500) and verify fallback to Porkbun completes.
8. Tenant deletion: confirm domains released to pool after 90 days (simulated).
9. Cost accounting: confirm per-tenant cost is tracked correctly (~$3/month).
10. **Pass criterion:** new tenant can sign up and have ready-to-warmup infrastructure in ≤ 5 min managed / ≤ 20 min BYOD, no friction beyond clicking buttons + (BYOD only) copy-paste DNS records.
