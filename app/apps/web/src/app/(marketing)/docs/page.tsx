import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";
import {
  PHASE_TAGLINES,
  docSteps,
  docsByPhase,
  estimateReadMinutes,
} from "@/lib/docs/content";
import { DocsShell } from "./_components/docs-shell";

export const metadata: Metadata = {
  title: "The Method | Elevay",
  description:
    "The Elevay method for going from zero to one million of revenue, founder-led: the doctrine, building your TAM, running every outbound channel, and the learning loops that compound. With worked examples.",
};

export default function DocsIndexPage() {
  if (!DOCS_PAGE_ENABLED) notFound();

  const groups = docsByPhase();

  return (
    <DocsShell>
      <main className="mx-auto max-w-[860px] px-6 pb-24 pt-14">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-gray-400">
          The Method
        </p>
        <h1 className="mt-2 text-[34px] font-bold tracking-[-0.5px] text-gray-900">
          From zero to one million, founder-led
        </h1>
        <p className="mt-3 max-w-[640px] text-[16px] leading-[1.7] text-gray-600">
          One method for one journey: the road from your first customer to your
          first million of revenue, with the founder selling the whole way.
          {" "}{docSteps.length} steps, read in order: the doctrine, the market
          machine, the playbook for every outbound channel, and the loops that
          make it compound. Every step ends with a worked example and with what
          Elevay automates for you.
        </p>

        {groups.map((group, gi) => (
          <section key={group.phase} className="mt-12">
            <div className="flex items-baseline gap-3">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-gray-400">
                Phase {gi + 1}
              </span>
              <h2 className="text-[18px] font-semibold tracking-[-0.2px] text-gray-900">
                {group.phase}
              </h2>
            </div>
            <p className="mt-1 text-[14px] text-gray-500">{PHASE_TAGLINES[group.phase]}</p>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
              {group.steps.map((step, i) => (
                <Link
                  key={step.slug}
                  href={`/docs/${step.slug}`}
                  className={`group flex items-start gap-4 bg-white px-5 py-4 transition-colors hover:bg-gray-50 ${
                    i > 0 ? "border-t border-gray-100" : ""
                  }`}
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold text-white"
                    style={{ background: "#2C6BED" }}
                  >
                    {step.step}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-semibold text-gray-900 group-hover:text-[#2C6BED]">
                      {step.title}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-[1.6] text-gray-600">
                      {step.description}
                    </span>
                  </span>
                  <span className="mt-1 shrink-0 text-[12px] font-medium text-gray-400">
                    {estimateReadMinutes(step)} min
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-12 text-[13.5px] leading-[1.7] text-gray-500">
          Start at step 1. The method assumes nothing except that you are a
          founder who has to sell what you build, and that the first million is
          yours to close.
        </p>
      </main>
    </DocsShell>
  );
}
