"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * MONACO-PARITY-03 — premium upsell on the 7-phase wizard.
 *
 * Sam Blond's Monaco bundles the Forward-Deployed AE in every
 * contract. Elevay's hybrid : self-serve wizard (the 7 phases) is
 * default, $299 founder-led session is the premium upgrade for
 * tenants who want the human in the loop. Pricing decision rationale:
 * $299 ≈ 25 min of Martin's billable time at a margin that recovers
 * once the tenant converts to the $999/mo subscription.
 */
export function FounderLedUpsell() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/founder-led-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "wizard_header" }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Checkout unavailable.");
        return;
      }
      window.location.href = data.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{
        background: "linear-gradient(135deg, var(--color-accent-soft, rgba(99,102,241,0.10)), rgba(217,119,6,0.08))",
        border: "1px solid var(--color-accent, #6366f1)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "var(--color-accent, #6366f1)",
            color: "white",
          }}
        >
          <Sparkles size={16} />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Want to skip ahead with Martin?
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            30 min live with the founder — ICP refinement, signal configuration, voice match, deal review. One-time $299.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              style={{
                background: "var(--color-accent, #6366f1)",
                color: "white",
              }}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Book founder-led session — $299
            </button>
            {error && (
              <span className="text-[11px]" style={{ color: "var(--color-error, #b91c1c)" }}>
                {error}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
