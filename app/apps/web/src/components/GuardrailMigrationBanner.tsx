"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";

/**
 * One-shot banner surfaced for tenants whose legacy `agentApprovalMode`
 * was `"auto"` before the WS-1 migration. The migration remaps `auto`
 * to `auto-high-confidence` (which now requires per-action confidence
 * thresholds), so the user deserves to know their autonomous sends
 * may behave differently.
 *
 * Dismissal is persisted via PUT `/api/settings/workspace` setting
 * `ws1MigrationBannerDismissedAt`. The banner never re-appears for
 * that tenant after dismissal.
 *
 * Component is small on purpose — it's a transitional surface,
 * not a long-lived one. Slated for removal in a follow-up cleanup
 * PR once every migrated tenant has dismissed it.
 */

interface GuardrailMigrationBannerProps {
  /** Whether the banner should render. Computed by the parent from
   *  `settings.ws1MigrationBannerDismissedAt` being absent AND the
   *  tenant being in the migrated-from-auto cohort. */
  show: boolean;
}

export function GuardrailMigrationBanner({ show }: GuardrailMigrationBannerProps) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    setVisible(show);
  }, [show]);

  const dismiss = useCallback(async () => {
    setVisible(false); // optimistic
    try {
      await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ws1MigrationBannerDismissedAt: new Date().toISOString(),
        }),
      });
    } catch (err) {
      // If the dismissal PUT fails, the banner re-renders on the next
      // /home load. Acceptable — nothing is lost.
      console.warn("guardrail-migration-banner: dismiss PUT failed", err);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md p-3"
      style={{
        background: "rgba(44,107,237,.06)",
        border: "1px solid rgba(44,107,237,.3)",
      }}
    >
      <ShieldAlert
        size={16}
        style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }}
      />
      <div className="flex-1">
        <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
          We&apos;ve added sending protections to Orion
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          Your approval mode is now <strong>Auto (high-confidence actions only)</strong>.
          Review in <a href="/settings/autonomy" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>Settings → Autonomy</a>.
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => void dismiss()}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-tertiary)",
          padding: 0,
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
