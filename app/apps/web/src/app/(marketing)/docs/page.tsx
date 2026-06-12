import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";
import {
  CATEGORY_TAGLINES,
  docsByCategory,
  estimateReadMinutes,
} from "@/lib/docs/content";
import { DocsShell } from "./_components/docs-shell";

export const metadata: Metadata = {
  title: "Documentation | Elevay",
  description:
    "How Elevay works and the playbooks behind it: building and maintaining your TAM, and running every outbound channel as an early-stage founder.",
};

export default function DocsIndexPage() {
  if (!DOCS_PAGE_ENABLED) notFound();

  const groups = docsByCategory();

  return (
    <DocsShell>
      <main className="mx-auto max-w-[860px] px-6 pb-24 pt-14">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-gray-400">
          Documentation
        </p>
        <h1 className="mt-2 text-[34px] font-bold tracking-[-0.5px] text-gray-900">
          The method behind the machine
        </h1>
        <p className="mt-3 max-w-[640px] text-[16px] leading-[1.7] text-gray-600">
          Elevay is a revenue engine with a methodology built in. These pages
          document that methodology: what an operational TAM is and how to keep
          it alive, and the playbook for every outbound channel, sized for
          founder-led sales.
        </p>

        {groups.map((group) => (
          <section key={group.category} className="mt-12">
            <h2 className="text-[14px] font-semibold uppercase tracking-wider text-gray-500">
              {group.category}
            </h2>
            <p className="mt-1 text-[14px] text-gray-500">
              {CATEGORY_TAGLINES[group.category]}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {group.articles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/docs/${article.slug}`}
                  className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)]"
                >
                  <h3 className="text-[16px] font-semibold text-gray-900 group-hover:text-[#2C6BED]">
                    {article.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] leading-[1.6] text-gray-600">
                    {article.description}
                  </p>
                  <p className="mt-3 text-[12px] font-medium text-gray-400">
                    {estimateReadMinutes(article)} min read
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </DocsShell>
  );
}
