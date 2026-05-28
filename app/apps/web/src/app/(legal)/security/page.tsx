import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security | Elevay",
  description:
    "Elevay's security architecture, controls, and compliance roadmap (ISO 27001, SOC 2, GDPR, nFADP).",
};

export default function SecurityPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
        Security
      </h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Last updated: 2026-05-19
      </p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
        <section>
          <p>
            Elevay is built for founders who sell to security-conscious
            buyers. This page documents our technical and organisational
            measures honestly — including where we currently stand short of
            full sovereignty and how we close those gaps.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            1. Architecture and data residency
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              <strong>Application:</strong> Next.js 15 on Vercel today;
              migrating to Clever Cloud (FR) for an EU-sovereign hosting
              option.
            </li>
            <li>
              <strong>Primary database:</strong> PostgreSQL on Supabase
              <code> aws eu-central-1</code> (Frankfurt). EU-sovereign
              migration target: Scaleway Managed DB (FR) or Infomaniak (CH).
            </li>
            <li>
              <strong>LLM inference:</strong> Anthropic Claude pinned to
              <code> eu.anthropic.com</code> by default. Mistral AI (France)
              is available as an EU-sovereign router target via
              <code> LLM_PROVIDER=mistral</code>.
            </li>
            <li>
              <strong>Embeddings:</strong> OpenAI <code>text-embedding-3-small</code>
              ; Mistral Embed available as an EU-sovereign alternative.
            </li>
            <li>
              <strong>Transactional email:</strong> Resend today; Brevo (FR)
              is the EU-sovereign migration target.
            </li>
            <li>
              <strong>Observability:</strong> Sentry pinned to
              <code> de.sentry.io</code> (Frankfurt); PostHog EU Cloud.
            </li>
            <li>
              <strong>Queues:</strong> BullMQ on Redis (self-host on EU/CH
              infra). Inngest for cron orchestration in the current
              deployment.
            </li>
          </ul>
          <p className="mt-3">
            See the{" "}
            <Link href="/sub-processors" className="text-[var(--color-accent)] hover:underline">
              Sub-processors page
            </Link>{" "}
            for the full vendor list with CLOUD Act exposure marked openly per
            line.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            2. Encryption
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              <strong>In transit:</strong> TLS 1.2+ everywhere. HSTS enabled.
            </li>
            <li>
              <strong>At rest:</strong> database encryption (AES-256) provided
              by the managed DB. Backups encrypted.
            </li>
            <li>
              <strong>Field-level:</strong> sensitive integration secrets
              (Instantly API keys, OAuth refresh tokens roadmap)
              encrypted with AES-256-GCM via <code>ELEVAY_APP_SECRET</code>.
            </li>
            <li>
              <strong>Passwords:</strong> bcrypt with cost factor 12 (post
              FINDING-002 fix), checked against HIBP.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            3. Access control and tenant isolation
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              Multi-tenant data model with <code>tenantId</code> on every
              row. All queries scoped through a request-bound
              <code> AuthContext</code>.
            </li>
            <li>
              Role-based access control (admin, member, viewer).
            </li>
            <li>
              OAuth via Google (Gmail) and Microsoft (Entra) with
              minimum-necessary scopes.
            </li>
            <li>
              MFA (TOTP + WebAuthn) on the roadmap for Q3 2026.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            4. Application security
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              CSP with nonce-based <code>script-src</code> (in progress —
              tracked in <em>security-audit-2026-04-15</em>, finding H11).
            </li>
            <li>
              SSRF guards on user-supplied URL fetches.
            </li>
            <li>
              IDOR prevention via tenant-scoped queries on all write paths.
            </li>
            <li>
              Webhook signature verification on Stripe, Resend, EmailEngine,
              Recall.
            </li>
            <li>
              Cron endpoints authenticated by shared secret with
              constant-time comparison.
            </li>
            <li>
              Prompt-injection mitigation: untrusted user content (emails,
              meeting notes) is wrapped in tagged sections in LLM prompts.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            5. Backups and continuity
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              Database point-in-time recovery (PITR) provided by the managed
              DB — 7-day window on Supabase, extended on the migration
              targets.
            </li>
            <li>
              Application code in version control on GitHub with branch
              protection.
            </li>
            <li>
              Disaster-recovery runbook with target RTO 4h / RPO 1h —
              tested quarterly.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            6. Logging and monitoring
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              Structured application logs (request, tenant, route, latency,
              outcome).
            </li>
            <li>
              Error reporting via Sentry (EU) with PII scrubbing
              (<code>sendDefaultPii: false</code> + <code>beforeSend</code>{" "}
              hook).
            </li>
            <li>
              Centralised log retention (12 months) on the migration roadmap.
            </li>
            <li>
              Audit log of privileged actions (role changes, tenant changes,
              GDPR/nFADP requests).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            7. Sub-processors and data transfers
          </h2>
          <p className="mt-2">
            All sub-processors are listed on the{" "}
            <Link href="/sub-processors" className="text-[var(--color-accent)] hover:underline">
              Sub-processors page
            </Link>{" "}
            with operator jurisdiction and CLOUD Act exposure. Transfers
            outside the EEA rely on European Commission Standard Contractual
            Clauses + supplementary measures (encryption, minimisation,
            regional endpoint pinning). We do not depend on the EU-US Data
            Privacy Framework as a primary transfer basis.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            8. EU-sovereign profile
          </h2>
          <p className="mt-2">
            Customers required to operate under a strict EU-sovereign profile
            (e.g. selling to public-sector, regulated finance, or sovereignty-
            sensitive industries) can opt into the sovereign stack:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li><strong>LLM:</strong> Mistral La Plateforme (FR) instead of Anthropic</li>
            <li><strong>Embeddings:</strong> Mistral Embed instead of OpenAI</li>
            <li><strong>Database:</strong> Scaleway Managed DB (FR) or Infomaniak (CH) instead of Supabase</li>
            <li><strong>Hosting:</strong> Clever Cloud (FR) or Infomaniak (CH) instead of Vercel</li>
            <li><strong>Email:</strong> Brevo (FR) instead of Resend</li>
            <li><strong>Enrichment:</strong> Datagma + Pappers (FR) instead of Apollo</li>
            <li><strong>Observability:</strong> GlitchTip self-host + PostHog self-host on EU/CH infra</li>
          </ul>
          <p className="mt-2">
            Contact <strong>security@elevay.dev</strong> to provision an
            EU-sovereign tenant.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            9. Compliance roadmap
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              <strong>GDPR + nFADP:</strong> in production (data subject
              rights, RoPA, sub-processor manifest, regional pinning).
            </li>
            <li>
              <strong>ISO/IEC 27001:2022:</strong> readiness phase — target
              audit Q2 2027.
            </li>
            <li>
              <strong>SOC 2 type II:</strong> type I assessment Q4 2026,
              type II (6-month observation) Q3 2027.
            </li>
            <li>
              <strong>SecNumCloud 3.2 (ANSSI):</strong> evaluated for the
              EU-sovereign profile once Clever Cloud / Scaleway Cloud Gouv
              qualification stabilises.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            10. Reporting a vulnerability
          </h2>
          <p className="mt-2">
            Email <strong>security@elevay.dev</strong> with details. We
            acknowledge within 24 hours and aim to issue a fix within 14 days
            for critical findings. We do not currently run a paid bug bounty
            but we credit researchers publicly with their consent.
          </p>
        </section>
      </div>
    </div>
  );
}
