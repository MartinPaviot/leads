import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";
import {
  PHASE_TAGLINES,
  docSteps,
  docsByPhase,
  estimateReadMinutes,
} from "@/lib/docs/content";
import { SettingsHeader } from "@/components/ui/settings-header";

export const metadata = { title: "The Method | Elevay" };

export default function SettingsDocsIndexPage() {
  if (!DOCS_PAGE_ENABLED) notFound();

  const groups = docsByPhase();

  return (
    <div className="px-6">
      <SettingsHeader
        title="The Method"
        subtitle={`From zero to one million of revenue, founder-led, in ${docSteps.length} ordered steps: doctrine, the road, the market machine, every outbound channel, and the learning loops. Each step ends with a worked example.`}
      />

      {groups.map((group, gi) => (
        <section key={group.phase} className="mb-8">
          <div
            className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Phase {gi + 1}: {group.phase}
          </div>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--color-text-tertiary)" }}>
            {PHASE_TAGLINES[group.phase]}
          </p>
          <div
            className="overflow-hidden rounded-lg"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            {group.steps.map((step, i) => (
              <Link
                key={step.slug}
                href={`/settings/docs/${step.slug}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors"
                style={{
                  borderTop: i > 0 ? "1px solid var(--color-border-default)" : undefined,
                  background: "var(--color-bg-card)",
                }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                >
                  {step.step}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[13.5px] font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {step.title}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-[12.5px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {step.description}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {estimateReadMinutes(step)} min
                  </span>
                  <ChevronRight
                    size={14}
                    className="opacity-40 transition-opacity group-hover:opacity-80"
                    style={{ color: "var(--color-text-tertiary)" }}
                  />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
