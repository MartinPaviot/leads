import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS_PAGE_ENABLED } from "@/lib/docs/page-visibility";
import {
  docsByCategory,
  estimateReadMinutes,
  getAdjacentDocs,
  getDocBySlug,
} from "@/lib/docs/content";
import { DocBlocks } from "@/components/docs/doc-blocks";
import { DocsShell } from "../_components/docs-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getDocBySlug(slug);
  if (!article) return { title: "Documentation | Elevay" };
  return {
    title: `${article.title} | Elevay Docs`,
    description: article.description,
  };
}

export default async function DocArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!DOCS_PAGE_ENABLED) notFound();

  const { slug } = await params;
  const article = getDocBySlug(slug);
  if (!article) notFound();

  const groups = docsByCategory();
  const { prev, next } = getAdjacentDocs(slug);

  return (
    <DocsShell>
      <div className="mx-auto flex max-w-[1240px] gap-12 px-6 pb-24 pt-12">
        {/* Docs nav */}
        <aside className="hidden w-[230px] shrink-0 lg:block">
          <nav aria-label="Documentation" className="sticky top-[84px]">
            <Link
              href="/docs"
              className="text-[13px] font-semibold text-gray-500 transition-colors hover:text-gray-900"
            >
              All documentation
            </Link>
            {groups.map((group) => (
              <div key={group.category} className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {group.category}
                </p>
                <ul className="space-y-1">
                  {group.articles.map((a) => {
                    const active = a.slug === article.slug;
                    return (
                      <li key={a.slug}>
                        <Link
                          href={`/docs/${a.slug}`}
                          aria-current={active ? "page" : undefined}
                          className={`block rounded-md px-2.5 py-1.5 text-[13px] leading-snug transition-colors ${
                            active
                              ? "bg-gray-100 font-medium text-gray-900"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          {a.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Article */}
        <main className="min-w-0 max-w-[720px] flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
            {article.category} &middot; {estimateReadMinutes(article)} min read
          </p>
          <h1 className="mt-2 text-[30px] font-bold leading-[1.2] tracking-[-0.5px] text-gray-900">
            {article.title}
          </h1>
          <p className="mt-3 text-[16px] leading-[1.7] text-gray-600">
            {article.description}
          </p>
          <hr className="my-7 border-gray-100" />
          <DocBlocks blocks={article.blocks} tone="marketing" />

          <div className="mt-12 flex items-stretch justify-between gap-4 border-t border-gray-100 pt-6">
            {prev ? (
              <Link
                href={`/docs/${prev.slug}`}
                className="group max-w-[48%] rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300"
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  Previous
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
                  Next
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
