import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";
import {
  docSteps,
  docsByPhase,
  estimateReadMinutes,
  getAdjacentDocs,
  getDocBySlug,
} from "@/lib/docs/content";
import { DocBlocks } from "@/components/docs/doc-blocks";
import { DocsShell } from "../_components/docs-shell";
import { ScrollActiveStep } from "../_components/scroll-active-step";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const step = getDocBySlug(slug);
  if (!step) return { title: "The Method | Elevay" };
  return {
    title: `Step ${step.step}: ${step.title} | Elevay Method`,
    description: step.description,
  };
}

export default async function DocStepPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!DOCS_PAGE_ENABLED) notFound();

  const { slug } = await params;
  const step = getDocBySlug(slug);
  if (!step) notFound();

  const groups = docsByPhase();
  const { prev, next } = getAdjacentDocs(slug);

  return (
    <DocsShell>
      <div className="mx-auto flex max-w-[1240px] gap-12 px-6 pb-24 pt-12">
        {/* Method steps nav. With 19 steps the nav outgrows short viewports,
            and a sticky element without internal overflow pins its top and
            makes the bottom items unreachable. max-height + overflow-y keeps
            every step reachable by scrolling inside the sidebar itself. */}
        <aside className="hidden w-[250px] shrink-0 lg:block">
          <nav
            aria-label="Method steps"
            className="sticky top-[84px] max-h-[calc(100vh-100px)] overflow-y-auto overscroll-contain pb-8 pr-2"
          >
            <ScrollActiveStep />
            <Link
              href="/docs"
              className="text-[13px] font-semibold text-gray-500 transition-colors hover:text-gray-900"
            >
              The Method
            </Link>
            {groups.map((group) => (
              <div key={group.phase} className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {group.phase}
                </p>
                <ul className="space-y-0.5">
                  {group.steps.map((s) => {
                    const active = s.slug === step.slug;
                    return (
                      <li key={s.slug}>
                        <Link
                          href={`/docs/${s.slug}`}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-baseline gap-2 rounded-md px-2.5 py-1.5 text-[13px] leading-snug transition-colors ${
                            active
                              ? "bg-gray-100 font-medium text-gray-900"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          <span
                            className={`shrink-0 text-[11.5px] font-semibold tabular-nums ${
                              active ? "text-[#2C6BED]" : "text-gray-400"
                            }`}
                          >
                            {s.step}.
                          </span>
                          {s.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Step content */}
        <main className="min-w-0 max-w-[720px] flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
            Step {step.step} of {docSteps.length} &middot; {step.phase} &middot;{" "}
            {estimateReadMinutes(step)} min read
          </p>
          <h1 className="mt-2 text-[30px] font-bold leading-[1.2] tracking-[-0.5px] text-gray-900">
            {step.title}
          </h1>
          <p className="mt-3 text-[16px] leading-[1.7] text-gray-600">{step.description}</p>
          <hr className="my-7 border-gray-100" />
          <DocBlocks blocks={step.blocks} tone="marketing" />

          <div className="mt-12 flex items-stretch justify-between gap-4 border-t border-gray-100 pt-6">
            {prev ? (
              <Link
                href={`/docs/${prev.slug}`}
                className="group max-w-[48%] rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300"
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  Step {prev.step}
                </span>
                <span className="mt-0.5 block text-[13.5px] font-medium text-gray-700 group-hover:text-gray-900">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/docs/${next.slug}`}
                className="group max-w-[48%] rounded-lg border border-gray-200 px-4 py-3 text-right transition-colors hover:border-gray-300"
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  Step {next.step}
                </span>
                <span className="mt-0.5 block text-[13.5px] font-medium text-gray-700 group-hover:text-gray-900">
                  {next.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
          </div>
        </main>
      </div>
    </DocsShell>
  );
}
