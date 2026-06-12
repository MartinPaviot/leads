import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";
import {
  CATEGORY_TAGLINES,
  docsByCategory,
  estimateReadMinutes,
} from "@/lib/docs/content";
import { SettingsHeader } from "@/components/ui/settings-header";

export const metadata = { title: "Documentation | Elevay" };

export default function SettingsDocsIndexPage() {
  if (!DOCS_PAGE_ENABLED) notFound();

  const groups = docsByCategory();

  return (
    <div className="px-6">
      <SettingsHeader
        title="Documentation"
        subtitle="The methodology behind Elevay: how to build and maintain your TAM, and the playbook for every outbound channel."
      />

      {groups.map((group) => (
        <section key={group.category} className="mb-8">
          <div
            className="mb-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {group.category}
          </div>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--color-text-tertiary)" }}>
            {CATEGORY_TAGLINES[group.category]}
          </p>
          <div
            className="overflow-hidden rounded-lg"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            {group.articles.map((article, i) => (
              <Link
                key={article.slug}
                href={`/settings/docs/${article.slug}`}
                className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors"
                style={{
                  borderTop: i > 0 ? "1px solid var(--color-border-default)" : undefined,
                  background: "var(--color-bg-card)",
                }}
              >
                <div className="min-w-0">
                  <div
                    className="text-[13.5px] font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {article.title}
                  </div>
                  <div
                    className="mt-0.5 truncate text-[12.5px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {article.description}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {estimateReadMinutes(article)} min
                  </span>
                  <ChevronRight
                    size={14}
                    className="opacity-40 transition-opacity group-hover:opacity-80"
                    style={{ color: "var(--color-text-tertiary)" }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
