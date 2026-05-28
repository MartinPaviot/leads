import type { Metadata } from "next";
import Link from "next/link";
import dpas from "@/data/dpas.json";

export const metadata: Metadata = {
  title: "Sub-processors | Elevay",
  description:
    "Canonical list of Elevay sub-processors with data residency, operator jurisdiction, CLOUD Act exposure and DPA status.",
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

function CloudActBadge({ value }: { value: string }) {
  const isYes = value === "yes";
  const className = isYes
    ? "rounded bg-[var(--color-warning-bg,#3a2a13)] px-1.5 py-0.5 text-xs text-[var(--color-warning,#f5a623)]"
    : "rounded bg-[var(--color-success-bg,#13301f)] px-1.5 py-0.5 text-xs text-[var(--color-success,#4ade80)]";
  return <span className={className}>{value}</span>;
}

export default function SubProcessorsPage() {
  const subProcessors = (dpas.subProcessors as SubProcessor[]) ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
        Sub-processors
      </h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Last updated: {dpas.lastUpdated}
      </p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
        <p>
          This is the canonical, machine-readable list of all third parties
          that may process personal data on Elevay&apos;s behalf. It is
          generated from <code>src/data/dpas.json</code> in our application
          source — the page can never drift from the actual configuration.
        </p>

        <p>
          <strong>Notification policy.</strong> {dpas.notificationPolicy}
        </p>

        <p>
          <strong>CLOUD Act column.</strong> &quot;yes&quot; means the
          sub-processor is headquartered in a jurisdiction (mainly the United
          States) whose law allows extraterritorial data requests regardless
          of where data is stored. Data residency in the EU does not eliminate
          CLOUD Act exposure when the operator is US-headquartered. This
          distinction is documented openly because it matters for
          sovereignty-sensitive customers.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="pb-2 pr-3 font-medium text-[var(--color-text-primary)]">Provider</th>
                <th className="pb-2 pr-3 font-medium text-[var(--color-text-primary)]">Purpose</th>
                <th className="pb-2 pr-3 font-medium text-[var(--color-text-primary)]">Data residency</th>
                <th className="pb-2 pr-3 font-medium text-[var(--color-text-primary)]">Operator jurisdiction</th>
                <th className="pb-2 pr-3 font-medium text-[var(--color-text-primary)]">CLOUD Act</th>
                <th className="pb-2 font-medium text-[var(--color-text-primary)]">DPA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {subProcessors.map((sp) => (
                <tr key={sp.name}>
                  <td className="py-3 pr-3 align-top">
                    <strong>{sp.name}</strong>
                    {sp.notes && (
                      <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {sp.notes}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3 align-top">{sp.purpose}</td>
                  <td className="py-3 pr-3 align-top">{sp.region}</td>
                  <td className="py-3 pr-3 align-top">{sp.operatorJurisdiction}</td>
                  <td className="py-3 pr-3 align-top">
                    <CloudActBadge value={sp.cloudActExposure} />
                  </td>
                  <td className="py-3 align-top">
                    {sp.dpaUrl ? (
                      <a
                        href={sp.dpaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        {sp.dpaStatus}
                      </a>
                    ) : (
                      <span>{sp.dpaStatus}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-8 rounded-lg border border-[var(--color-border-default)] p-4">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Subscribe to sub-processor change notifications
          </h2>
          <p className="mt-2">
            Email <strong>security@elevay.dev</strong> with subject{" "}
            <em>&quot;subscribe sub-processor notifications&quot;</em> to
            receive 30-day advance notice of any new sub-processor.
          </p>
        </section>

        <p className="mt-8 text-sm text-[var(--color-text-muted)]">
          See the{" "}
          <Link href="/privacy" className="text-[var(--color-accent)] hover:underline">
            Privacy Policy
          </Link>{" "}
          for legal bases, retention and data subject rights, and the{" "}
          <Link href="/security" className="text-[var(--color-accent)] hover:underline">
            Security page
          </Link>{" "}
          for technical controls.
        </p>
      </div>
    </div>
  );
}
