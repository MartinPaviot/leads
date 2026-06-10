# Business Continuity and Disaster Recovery Plan

| Field | Value |
| --- | --- |
| Version | v1.0 |
| Effective date | 2026-06-10 |
| Owner | Martin Paviot (Founder) |
| Review cycle | Annual (next review due 2027-06-10) |

## 1. Purpose

Define how Elevay recovers from infrastructure failure, data loss, or loss of the operator, and the maximum tolerable downtime and data loss for the production service at www.elevay.dev.

## 2. Recovery Objectives

These targets are formally adopted with this v1.0 (no formal RTO/RPO existed previously):

| Objective | Target | Basis |
| --- | --- | --- |
| RTO (Recovery Time Objective) | 4 business hours | Redeploy from GitHub `main` to Vercel plus Supabase restore is achievable well inside this window by a single operator |
| RPO (Recovery Point Objective) | 24 hours | Supabase managed daily backups; better where Point-in-Time Recovery (PITR) is enabled on the project |

Where PITR is enabled, the effective RPO is minutes; the 24-hour figure is the committed worst case under the daily-backup baseline.

## 3. Dependency Tiers

| Tier | Services | Failure impact | Continuity posture |
| --- | --- | --- | --- |
| Critical | Vercel (app hosting), Supabase Postgres EU (system of record) | Full outage | Subject to RTO/RPO above; recovery runbook in section 4 |
| Important | Upstash Redis, Inngest (jobs/crons), Stripe (billing), Resend (transactional email), Google/Microsoft OAuth | Degraded core features; app stays up | Jobs replay after recovery (Inngest retries); billing and email queue or fail visibly |
| Degraded-mode acceptable | Enrichment vendors (Apollo, Kaspr, Lusha, Hunter, Datagma, Firmable, FullEnrich, Zeliq, Crunchbase, Pappers, Zefix), Twilio/Deepgram (voice), Anthropic/OpenAI (LLM), Recall.ai, Sentry, PostHog | Feature-level degradation only | No recovery action required; features fail gracefully and resume when the vendor recovers. LLM features can fail over between Anthropic (EU endpoint) and OpenAI where compliant |

## 4. Recovery Runbook

Executed by the Founder (or the escrow holder per section 6). All steps assume access to the password manager.

1. **Assess.** Confirm scope via Vercel status, Supabase status, Sentry EU. Determine whether the failure is app-tier (Vercel), data-tier (Supabase), or regional.
2. **Redeploy application.** Production deploys from GitHub `MartinPaviot/leads`, branch `main`, Vercel project `web` (rootDirectory `app/apps/web`). Push to `main` auto-deploys to production; alternatively trigger a redeploy of the last green deployment from the Vercel dashboard. Environment variables live in Vercel project settings (no secrets in the repo).
3. **Restore database.** In the Supabase dashboard, restore the latest daily backup, or use PITR to the latest healthy timestamp where enabled. Verify with the boot-time residency/health checks (`lib/region-config.ts` assertions) and a smoke login against tenant data.
4. **Re-point DNS if required.** Canonical host is www.elevay.dev (apex 307s to www), DNS managed in Vercel. If migrating to a new Vercel project or provider, update A/CNAME records and re-add the domain; propagation is typically minutes on Vercel DNS.
5. **Re-verify integrations.** Confirm Inngest functions are registered (POST `/api/inngest` returns the step protocol), Stripe webhooks deliver, Resend sends from send.elevay.dev, and Twilio voiceUrl still points at `/api/calls/agent-twiml`.
6. **Communicate.** Notify affected customers by email if the outage exceeded 1 business hour or any data loss occurred (coordinate with the incident response policy in this pack).

## 5. Annual Restore Drill

- At least once per year, perform a test restore of a Supabase backup to a non-production project and a clean redeploy of `main` to a preview environment.
- **Evidence requirement:** record the drill date, backup timestamp used, elapsed time to a working app, and any gaps found, in `_compliance/evidence/restore-drills/` (screenshots plus a short markdown log). A drill that misses the RTO/RPO targets must open an entry in the risk register (`_compliance/risk-register.md`).
- First drill due within 12 months of this policy's effective date.

## 6. Single-Person Risk Mitigation

Elevay is operated by a single founder. Mitigations:

- **Credentials escrow:** all production credentials (Vercel, Supabase, GitHub, Stripe, Twilio, domain registrar, password manager recovery kit) are documented in the password manager; emergency access to the vault is arranged for a designated trusted party so the service can be wound down or handed over if the founder is incapacitated.
- **This repository as runbook:** the recovery procedure above, the policy pack, and the operational memory docs are versioned in git; anyone with vault access and this repo can execute recovery without tribal knowledge.
- **Managed services by default:** all critical infrastructure (Vercel, Supabase, Inngest, Stripe) is fully managed, so recovery is configuration and restore work, not server rebuilds.

The residual solo-founder bus-factor risk is recorded and accepted in the starter risk register (`10-risk-assessment-policy.md`, risk R-01).

## 7. Related Documents

- `07-data-retention-classification-policy.md` (backup retention windows)
- `09-vendor-management-policy.md` (vendor outage posture)
- `10-risk-assessment-policy.md` (risk register)
