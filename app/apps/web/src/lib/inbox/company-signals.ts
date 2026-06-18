/**
 * Select the contact's company-level GTM signals that are still fresh, for the
 * in-thread signal surfacing (INBOX-G04). Pure: reads the signals stored on
 * companies.properties.signals (high/medium relevance only — the same source the
 * draft + scoring paths use, lib/context/prospect-context.ts), drops any past its
 * shelf life via filterFreshSignals (citing a stale signal is the tell of
 * automation — The Method step 7), and returns the compact shape the pane renders.
 * Never throws; no schema migration (signals already live in the JSONB column).
 */
import { filterFreshSignals } from "@/lib/signals/freshness";

export interface ThreadSignal {
  type: string;
  title: string;
  description: string;
}

export function selectFreshCompanySignals(properties: unknown, now: Date = new Date()): ThreadSignal[] {
  const props = (properties ?? {}) as { signals?: unknown };
  if (!Array.isArray(props.signals)) return [];
  const relevant = props.signals.filter(
    (s) => !!s && typeof s === "object" && (((s as Record<string, unknown>).relevance === "high") || ((s as Record<string, unknown>).relevance === "medium")),
  ) as Array<{ type: string; title?: string; description?: string; detectedAt?: string | null }>;
  return filterFreshSignals(relevant, now)
    .slice(0, 5)
    .map((s) => ({
      type: String(s.type ?? ""),
      title: String(s.title ?? s.type ?? ""),
      description: String(s.description ?? ""),
    }))
    .filter((s) => s.type || s.title);
}
