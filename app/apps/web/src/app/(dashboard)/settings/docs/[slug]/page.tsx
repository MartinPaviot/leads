import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";
import {
  docSteps,
  estimateReadMinutes,
  getAdjacentDocs,
  getDocBySlug,
} from "@/lib/docs/content";
import { DocBlocks } from "@/components/docs/doc-blocks";
import { SettingsHeader } from "@/components/ui/settings-header";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const step = getDocBySlug(slug);
  return { title: step ? `Step ${step.step}: ${step.title} | Elevay` : "The Method | Elevay" };
}

export default async function SettingsDocStepPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!DOCS_PAGE_ENABLED) notFound();

  const { slug } = await params;
  const step = getDocBySlug(slug);
  if (!step) notFound();

  const { prev, next } = getAdjacentDocs(slug);

  return (
    <div className="px-6">
      <Link
        href="/settings/docs"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium transition-opacity hover:opacity-80"
        style={{ color: "var(--color-accent)" }}
      >
        <ArrowLeft size={13} /> The Method
      </Link>

      <SettingsHeader
        title={`${step.step}. ${step.title}`}
        subtitle={`Step ${step.step} of ${docSteps.length} · ${step.phase} · ${estimateReadMinutes(step)} min read`}
      />

      <DocBlocks blocks={step.blocks} tone="app" />

      <div
        className="mt-10 flex items-stretch justify-between gap-3 pt-5"
        style={{ borderTop: "1px solid var(--color-border-default)" }}
      >
        {prev ? (
          <Link
            href={`/settings/docs/${prev.slug}`}
            className="max-w-[48%] rounded-md px-3 py-2.5 transition-colors"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            <span
              className="text-[10.5px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Step {prev.step}
            </span>
            <span
              className="mt-0.5 block text-[12.5px] font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/settings/docs/${next.slug}`}
            className="max-w-[48%] rounded-md px-3 py-2.5 text-right transition-colors"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            <span
              className="text-[10.5px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Step {next.step}
            </span>
            <span
              className="mt-0.5 block text-[12.5px] font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {next.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </div>
      <div className="h-10" />
    </div>
  );
}
