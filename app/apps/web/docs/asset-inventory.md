# Information asset inventory

**Last updated:** 2026-05-19
**Owner:** CTO
**Review cadence:** quarterly + at each new asset

ISO 27001 A.5.9 — list of information assets, owners, and classification.

---

## 1. Information assets (data)

| Asset | Description | Classification | Owner | Storage |
|---|---|---|---|---|
| Customer CRM database | Contacts, accounts, deals, activities per tenant | L3 | CTO | Supabase (eu-central-1) → Scaleway/Infomaniak (sovereign migration target) |
| Mailbox sync content | Synced email metadata + body for connected mailboxes | L3 | CTO | Same as CRM DB |
| Meeting transcripts | Recall.ai transcripts | L3 | CTO | Same as CRM DB |
| Audit log | Append-only log of privileged actions | L4 | CTO | Same as CRM DB (separate table) |
| OAuth tokens (Google, Microsoft) | Access + refresh tokens for connected mailboxes | L4 | CTO | DB encrypted (roadmap H2) |
| Integration secrets | Per-tenant API keys for outbound providers | L4 | CTO | DB, AES-256-GCM encrypted via `ELEVAY_APP_SECRET` |
| Stripe customer + subscription data | Billing identity, last4, subscription state | L3 | Founder | Stripe + reflected metadata in our DB |
| Suppression list | Email addresses opted out of outbound | L3 | CTO | DB |
| Sub-processor manifest | `src/data/dpas.json` | L1 | DPO | Source repo |

## 2. System assets (infrastructure)

| Asset | Description | Owner | Provider | Region |
|---|---|---|---|---|
| Production web app | Next.js front + API | CTO | Vercel (migrating to Clever Cloud) | EU |
| Worker | BullMQ workers | CTO | Self-host on EU/CH infra (planned) | EU/CH |
| Primary DB | PostgreSQL | CTO | Supabase | aws eu-central-1 |
| Redis | Queue + cache | CTO | Upstash / local | EU |
| LLM | Anthropic Claude (default) | CTO | Anthropic | EU endpoint |
| LLM (sovereign opt-in) | Mistral La Plateforme | CTO | Mistral AI | FR |
| Error reporting | Sentry | CTO | Sentry | de.sentry.io |
| Analytics | PostHog | CTO | PostHog | eu.i.posthog.com |
| Transactional email | Resend (migrating to Brevo) | CTO | Resend | US |
| DNS | TBD | CTO | TBD | EU sovereign target |
| Source control | GitHub | CTO | GitHub | US (Microsoft) |
| Secrets store | `.env` files + Vercel env (migration target: Vault / Scaleway Secret Manager) | CTO | Mixed | mixed |

## 3. People (asset owners)

| Role | Name | Responsibility |
|---|---|---|
| Founder / CEO | Martin Paviot | Business decisions, customer relationship |
| CTO | Martin Paviot | Technology, security, infra |
| DPO | Martin Paviot (acting) | Privacy compliance |

Note: Elevay is a one-person operation at this stage. Several roles are
held by the same person — segregation of duties is achieved via tooling
controls (PR review by CI, branch protection, audit log) rather than
human handoff. This is documented as a known gap to be remediated when
Elevay hires its first additional team member.

## 4. Software assets (third-party libraries)

Tracked via `package.json` + `pnpm-lock.yaml` + Dependabot. Periodic
review for vulnerabilities via `pnpm audit` (target: monthly, currently
not in CI — gap).

## 5. Physical assets

Elevay has no physical office assets. Founder laptop runs full-disk
encryption (FileVault / BitLocker) and is enrolled in MDM in the
roadmap. Recovery codes for OAuth and password manager held in a
secure offline location.

## 6. Service accounts and API keys

Tracked separately in `_credentials/` (gitignored). Rotation policy:
- API keys: rotate annually + after any incident
- OAuth client secrets: rotate annually
- `AUTH_SECRET`, `ELEVAY_APP_SECRET`: rotate annually
- Stripe webhook secret: rotate annually
- Database passwords: rotate at every personnel change
