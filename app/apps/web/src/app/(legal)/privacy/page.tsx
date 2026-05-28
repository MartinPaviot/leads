import type { Metadata } from "next";
import Link from "next/link";
import dpas from "@/data/dpas.json";

export const metadata: Metadata = {
  title: "Privacy Policy | Elevay",
  description:
    "How Elevay collects, uses, and protects personal data under GDPR (EU) and nFADP (Switzerland).",
};

interface SubProcessor {
  name: string;
  purpose: string;
  region: string;
  operatorJurisdiction: string;
  cloudActExposure: string;
  dpaStatus: string;
  dpaUrl: string | null;
  notes?: string;
}

export default function PrivacyPage() {
  const subProcessors = (dpas.subProcessors as SubProcessor[]) ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Last updated: {dpas.lastUpdated}
      </p>

      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
        {/* 1. Data Controller */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            1. Data Controller
          </h2>
          <p className="mt-3">
            The data controller for personal data processed through Elevay is:
          </p>
          <ul className="mt-2 list-none space-y-1 pl-0">
            <li><strong>Company:</strong> Elevay</li>
            <li><strong>Country:</strong> France</li>
            <li><strong>Email:</strong> privacy@elevay.dev</li>
            <li><strong>Data Protection Officer:</strong> privacy@elevay.dev</li>
            <li><strong>Security contact:</strong> security@elevay.dev</li>
          </ul>
          <p className="mt-2">
            This Privacy Policy explains how we collect, use, store, and protect
            your personal data when you use Elevay in compliance with the General
            Data Protection Regulation (GDPR), the French Data Protection Act
            (Loi Informatique et Libertés), the Swiss Federal Act on Data
            Protection (nFADP), and other applicable data protection laws.
          </p>
        </section>

        {/* 2. Data We Collect */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            2. Data We Collect
          </h2>

          <h3 className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">
            2.1 Account Data
          </h3>
          <p className="mt-2">When you create an account, we collect:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Name and email address</li>
            <li>Authentication credentials (via Google OAuth, Microsoft Entra, or email/password)</li>
            <li>Profile picture (if provided via OAuth)</li>
            <li>Company/organization name</li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">
            2.2 Customer Data (CRM Data)
          </h3>
          <p className="mt-2">Data you upload or create within the Service:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Contact information (names, emails, phone numbers, job titles, LinkedIn URLs)</li>
            <li>Company information (names, domains, industry, size, revenue)</li>
            <li>Deal/opportunity data (names, stages, values, notes)</li>
            <li>Email content (sent and received through connected mailboxes)</li>
            <li>Meeting transcripts (when you enable the meeting bot)</li>
            <li>Notes, tasks, and activity records</li>
            <li>Outbound email sequences and templates</li>
            <li>Chat conversations with the AI assistant</li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">
            2.3 Usage Data
          </h3>
          <p className="mt-2">We automatically collect:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Pages visited, features used, and actions taken within the Service</li>
            <li>Browser type, operating system, and device information</li>
            <li>IP address and approximate country (via Vercel/Cloudflare geo headers)</li>
            <li>Timestamps and session duration</li>
            <li>Error logs and performance data</li>
          </ul>

          <h3 className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">
            2.4 Enrichment Data
          </h3>
          <p className="mt-2">
            When you trigger enrichment, we retrieve additional public information
            about your contacts and companies from third-party providers:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Company firmographic data (industry, employee count, revenue, funding)</li>
            <li>Contact professional data (job title, department, seniority)</li>
            <li>Social media profiles and public web data</li>
          </ul>
        </section>

        {/* 3. How We Process Data */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            3. How We Process Data
          </h2>

          <h3 className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">
            3.1 Core Service Delivery
          </h3>
          <p className="mt-2">
            We process your data to provide the CRM, email sequencing, pipeline
            management, and analytics features of the Service.
          </p>

          <h3 className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">
            3.2 AI and LLM Processing
          </h3>
          <p className="mt-2">Elevay uses AI to power features such as:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li><strong>Email generation:</strong> contact data and context sent to the configured LLM provider to generate drafts.</li>
            <li><strong>Lead scoring:</strong> contact and company data analysed by AI models.</li>
            <li><strong>Deal coaching:</strong> deal history and interactions processed for recommendations.</li>
            <li><strong>Natural language querying:</strong> questions and relevant CRM data processed to generate answers with citations.</li>
            <li><strong>Summarisation:</strong> meetings, emails, and activity history summarised by AI.</li>
          </ul>
          <p className="mt-2">
            We minimise the data sent to AI providers to what is strictly
            necessary. We do not allow AI providers to use your data for model
            training. By default, requests are routed to the EU endpoint of our
            primary LLM provider (<code>eu.anthropic.com</code>). Customers who
            require a fully EU-sovereign LLM may opt into Mistral AI (France) via
            their workspace settings — see the{" "}
            <Link href="/security" className="text-[var(--color-accent)] hover:underline">
              Security page
            </Link>{" "}
            for details.
          </p>

          <h3 className="mt-4 text-lg font-medium text-[var(--color-text-primary)]">
            3.3 Data Enrichment
          </h3>
          <p className="mt-2">
            Company domains and contact email addresses may be sent to enrichment
            APIs to retrieve publicly available business information. This
            processing occurs only when you actively trigger enrichment.
          </p>
        </section>

        {/* 4. Legal Basis */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            4. Legal Basis for Processing
          </h2>
          <p className="mt-3">Under GDPR and nFADP, we rely on:</p>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li>
              <strong>Performance of contract (Art. 6(1)(b) GDPR):</strong>{" "}
              processing necessary to provide the Service.
            </li>
            <li>
              <strong>Legitimate interest (Art. 6(1)(f) GDPR):</strong> for
              security, fraud prevention, service improvement and analytics. We
              maintain a documented Legitimate Interest Assessment.
            </li>
            <li>
              <strong>Consent (Art. 6(1)(a) GDPR):</strong> for optional features
              (e.g. enrichment, analytics cookies, meeting recording). You may
              withdraw consent at any time.
            </li>
            <li>
              <strong>Legal obligation (Art. 6(1)(c) GDPR):</strong> for
              accounting and tax record-keeping (10-year retention).
            </li>
          </ul>
        </section>

        {/* 5. Data Retention */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            5. Data Retention
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li><strong>Account data:</strong> duration of your account plus 30 days post-deletion (for recovery).</li>
            <li><strong>Customer Data (CRM):</strong> duration of your account. Deleted within 30 days of account closure or upon GDPR/nFADP erasure request.</li>
            <li><strong>Usage and analytics data:</strong> retained in anonymised form for up to 24 months.</li>
            <li><strong>Email opt-out records:</strong> retained indefinitely to ensure ongoing unsubscribe compliance (only the suppressed email address is kept).</li>
            <li><strong>Billing records:</strong> 10 years (French Code de commerce, Art. L123-22).</li>
            <li><strong>Inactive prospects:</strong> deleted after 3 years from last contact (GDPR retention guidance for B2B prospecting).</li>
          </ul>
        </section>

        {/* 6. Your Rights */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            6. Your Rights
          </h2>
          <p className="mt-3">
            As a data subject under GDPR or nFADP, you have the rights below.
            Exercise them at <strong>privacy@elevay.dev</strong> — we respond
            within 30 days.
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li><strong>Access (Art. 15):</strong> request a copy of all personal data we hold; use the export feature or contact us.</li>
            <li><strong>Rectification (Art. 16):</strong> request correction of inaccurate data.</li>
            <li><strong>Erasure (Art. 17):</strong> request deletion within 30 days.</li>
            <li><strong>Portability (Art. 20):</strong> receive your data in a structured, machine-readable format (JSON).</li>
            <li><strong>Restriction (Art. 18):</strong> request that we restrict processing in certain circumstances.</li>
            <li><strong>Objection (Art. 21):</strong> object to processing based on legitimate interest, including profiling.</li>
            <li><strong>Withdraw consent:</strong> where processing is consent-based, you may withdraw at any time.</li>
            <li><strong>Lodge a complaint:</strong> with the CNIL (France), the FDPIC (Switzerland), or your local supervisory authority.</li>
          </ul>
        </section>

        {/* 7. Sub-processors */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            7. Sub-processors
          </h2>
          <p className="mt-3">
            We use the third-party sub-processors below to deliver the Service.
            The full canonical list, updated as it changes, is published on the{" "}
            <Link href="/sub-processors" className="text-[var(--color-accent)] hover:underline">
              Sub-processors page
            </Link>
            .
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="pb-2 pr-4 font-medium text-[var(--color-text-primary)]">Provider</th>
                  <th className="pb-2 pr-4 font-medium text-[var(--color-text-primary)]">Purpose</th>
                  <th className="pb-2 pr-4 font-medium text-[var(--color-text-primary)]">Data residency</th>
                  <th className="pb-2 font-medium text-[var(--color-text-primary)]">Operator jurisdiction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-default)]">
                {subProcessors.map((sp) => (
                  <tr key={sp.name}>
                    <td className="py-2 pr-4 align-top">{sp.name}</td>
                    <td className="py-2 pr-4 align-top">{sp.purpose}</td>
                    <td className="py-2 pr-4 align-top">{sp.region}</td>
                    <td className="py-2 align-top">{sp.operatorJurisdiction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            We maintain Data Processing Agreements (DPAs) with all sub-processors
            referenced above. The DPA registry — with current status and links —
            is on the{" "}
            <Link href="/sub-processors" className="text-[var(--color-accent)] hover:underline">
              Sub-processors page
            </Link>
            . We will notify subscribers at least 30 days in advance of any new
            sub-processor.
          </p>
        </section>

        {/* 8. International Transfers */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            8. International Data Transfers
          </h2>
          <p className="mt-3">
            Several sub-processors are headquartered outside the EEA (mainly in
            the United States). For each transfer of personal data outside the
            EEA we rely on:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>European Commission Standard Contractual Clauses (SCCs), 2021 modules</li>
            <li>Adequacy decisions where they apply (e.g. UK, Switzerland)</li>
            <li>Supplementary measures: data minimisation, in-transit and at-rest encryption, regional endpoint pinning where available</li>
          </ul>
          <p className="mt-2">
            We do not rely on the EU-US Data Privacy Framework as a primary
            transfer basis given ongoing judicial scrutiny in the EU. Our
            Transfer Impact Assessment is reviewed annually and on each
            sub-processor change.
          </p>
          <p className="mt-2">
            Customers who require zero data transfer outside the EU/CH may
            choose the EU-sovereign profile (Mistral AI for LLM, Brevo for
            transactional email, Datagma/Pappers for enrichment). See the{" "}
            <Link href="/security" className="text-[var(--color-accent)] hover:underline">
              Security page
            </Link>
            .
          </p>
        </section>

        {/* 9. Cookies */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            9. Cookies and Tracking
          </h2>
          <p className="mt-3">Elevay uses the following types of cookies:</p>
          <ul className="mt-2 list-disc space-y-2 pl-6">
            <li><strong>Strictly necessary:</strong> required for authentication and session management. Cannot be disabled.</li>
            <li><strong>Functional:</strong> remember your preferences (sidebar state, filter selections).</li>
            <li><strong>Analytics:</strong> set only with your consent. We use PostHog EU Cloud.</li>
          </ul>
          <p className="mt-2">
            We do not use third-party advertising cookies. We do not sell your
            data to advertisers.
          </p>
        </section>

        {/* 10. Security */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            10. Data Security
          </h2>
          <p className="mt-3">
            See the{" "}
            <Link href="/security" className="text-[var(--color-accent)] hover:underline">
              Security page
            </Link>{" "}
            for a full description of our technical and organisational measures,
            including encryption, access control, backups, incident response,
            and our ISO 27001 / SOC 2 roadmap.
          </p>
        </section>

        {/* 11. Children */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            11. Children&apos;s Privacy
          </h2>
          <p className="mt-3">
            Elevay is not intended for individuals under 18. We do not knowingly
            collect personal data from children. If we learn that we have, we
            delete it promptly.
          </p>
        </section>

        {/* 12. Changes */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            12. Changes to This Policy
          </h2>
          <p className="mt-3">
            We may update this Privacy Policy from time to time. We will notify
            you of material changes at least 30 days in advance by email or
            in-app notification. The &quot;Last updated&quot; date at the top reflects
            the current version. Past versions are retained internally for audit
            purposes.
          </p>
        </section>

        {/* 13. Contact DPO */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            13. Contact &amp; Data Protection Officer
          </h2>
          <p className="mt-3">
            For privacy-related questions, to exercise your rights, or to
            contact our Data Protection Officer:
          </p>
          <ul className="mt-2 list-none space-y-1 pl-0">
            <li><strong>Email:</strong> privacy@elevay.dev</li>
            <li><strong>Security:</strong> security@elevay.dev</li>
            <li><strong>Company:</strong> Elevay</li>
            <li><strong>Country:</strong> France</li>
          </ul>
          <p className="mt-3">
            You have the right to lodge a complaint with the French data
            protection authority:
          </p>
          <ul className="mt-2 list-none space-y-1 pl-0">
            <li>
              <strong>CNIL</strong> — Commission Nationale de l&apos;Informatique
              et des Libertés
            </li>
            <li>3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France</li>
            <li>
              <strong>Web:</strong>{" "}
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                www.cnil.fr
              </a>
            </li>
          </ul>
          <p className="mt-3">
            Swiss data subjects may lodge a complaint with the Swiss Federal
            Data Protection and Information Commissioner:
          </p>
          <ul className="mt-2 list-none space-y-1 pl-0">
            <li><strong>FDPIC / EDÖB / PFPDT</strong></li>
            <li>Feldeggweg 1, 3003 Bern, Switzerland</li>
            <li>
              <strong>Web:</strong>{" "}
              <a
                href="https://www.edoeb.admin.ch"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                www.edoeb.admin.ch
              </a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
