"use client";

/**
 * Bundles view (INBOX-T03) — newsletter/promo senders grouped into one
 * collapsible source each, so subscription noise is cleared in a batch
 * instead of one-by-one. Read model is `bundleConversations`; the only
 * action here is "Mark all done" (reuses the per-key triage verb).
 * Bulk-unsubscribe + a dedicated bulk endpoint are residual.
 */

import { Newspaper } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { timeAgo } from "./_time-ago";
import type { BundleSource } from "@/lib/inbox/bundle";
import { useT } from "@/lib/i18n/locale";

export function BundlesView({
  bundles,
  onClear,
  clearing,
}: {
  bundles: BundleSource[];
  onClear: (sender: string, keys: string[]) => void;
  /** Sender currently being cleared, for the row's loading state. */
  clearing: string | null;
}) {
  const t = useT();
  if (bundles.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<Newspaper size={20} />}
          title={t("inbox.bundles.empty.title")}
          description={t("inbox.bundles.empty.desc")}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-2">
        {bundles.map((b) => (
          <div
            key={b.sender}
            className="flex items-center gap-3 rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-elevated)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {b.label}
                </span>
                <span
                  className="shrink-0 rounded-full px-2 text-[11px] font-medium"
                  style={{ background: "var(--color-badge-0-bg)", color: "var(--color-badge-0)" }}
                >
                  {b.count}
                </span>
                {b.latestAt && (
                  <span className="ml-auto shrink-0 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {timeAgo(b.latestAt)}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                {b.latestSubject}
              </div>
              <div
                className="mt-0.5 truncate text-[11px]"
                style={{ color: "var(--color-text-tertiary)" }}
                title={b.whyBundled}
              >
                {t("inbox.bundles.bundledPrefix", { whyBundled: b.whyBundled })}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onClear(b.sender, b.keys)}
              disabled={clearing === b.sender}
              loading={clearing === b.sender}
            >
              {t("inbox.bundles.markAllDone")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
