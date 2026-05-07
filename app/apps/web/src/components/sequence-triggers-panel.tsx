"use client";

/**
 * SequenceTriggersPanel — checkbox list of signal types that
 * trigger auto-enrollment into a sequence (P0-2 follow-up).
 *
 * Renders nothing while loading / on fetch failure / on 401-403.
 * Persistence is debounced to keep the UI snappy ; the PUT endpoint
 * is admin-only so non-admin viewers see read-only checkboxes.
 *
 * Empty selection = "no auto-enroll" (sequence still runs from
 * manual enrollment). Tooltip next to each checkbox explains what
 * the signal type means so the founder can pick informed.
 */

import { useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle, Radio } from "lucide-react";

interface TriggerConfigPayload {
  sequenceId: string;
  name: string;
  triggerSignalTypes: string[];
  knownSignalTypes: string[];
}

const SIGNAL_LABELS: Record<string, { label: string; help: string }> = {
  website_visit: {
    label: "Website visit",
    help: "Identified company visited the marketing site (visitor-ID provider matched the IP).",
  },
  post_funding: {
    label: "Post-funding",
    help: "Account closed a funding round in the last 90 days.",
  },
  hiring_signal: {
    label: "Hiring signal",
    help: "Account opened a relevant role (e.g. 'Head of Growth') matching the playbook.",
  },
  product_launch: {
    label: "Product launch",
    help: "Account shipped a new product / feature press-release.",
  },
  leadership_change: {
    label: "Leadership change",
    help: "New executive joined that matches your buyer persona.",
  },
  tech_stack_change: {
    label: "Tech stack change",
    help: "Detected a swap in stack (e.g. moved off competitor).",
  },
  exec_engagement: {
    label: "Exec engagement",
    help: "An executive at the account engaged with content / replied / opened.",
  },
  review_left: {
    label: "Review left",
    help: "Account left a public review (positive or negative) about a peer product.",
  },
  competitor_mention: {
    label: "Competitor mention",
    help: "Account publicly mentioned a competitor — possible churn / switch signal.",
  },
};

interface SequenceTriggersPanelProps {
  sequenceId: string;
}

export function SequenceTriggersPanel({ sequenceId }: SequenceTriggersPanelProps) {
  const [data, setData] = useState<TriggerConfigPayload | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(true); // optimistic ; PUT 403 flips to false

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/sequences/${encodeURIComponent(sequenceId)}/triggers`,
        );
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setHidden(true);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setHidden(true);
          return;
        }
        const payload = (await res.json()) as TriggerConfigPayload;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setHidden(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sequenceId]);

  if (hidden) return null;
  if (!data) return null;

  async function toggle(signalType: string) {
    if (!data) return;
    const before = new Set(data.triggerSignalTypes);
    if (before.has(signalType)) before.delete(signalType);
    else before.add(signalType);
    const next = Array.from(before);
    // Optimistic local update.
    setData({ ...data, triggerSignalTypes: next });
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sequences/${encodeURIComponent(sequenceId)}/triggers`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerSignalTypes: next }),
        },
      );
      if (res.status === 403) {
        setIsAdmin(false);
        setError("Admin role required to change triggers.");
        // Revert.
        setData({ ...data });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { error?: string }).error ?? `Save failed (${res.status})`,
        );
        // Revert to server state (refetch).
        const refresh = await fetch(
          `/api/sequences/${encodeURIComponent(sequenceId)}/triggers`,
        );
        if (refresh.ok) {
          const refreshed = (await refresh.json()) as TriggerConfigPayload;
          setData(refreshed);
        }
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  const selected = new Set(data.triggerSignalTypes);
  const matchAll = selected.size === 0;

  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <header className="flex items-center justify-between p-4">
        <div>
          <h2
            className="flex items-center gap-2 text-[14px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            <Radio size={13} aria-hidden /> Auto-enrollment triggers
          </h2>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {matchAll
              ? "No filter — every signal that lands triggers this sequence (legacy default)."
              : `Triggers on ${selected.size} of ${data.knownSignalTypes.length} signal types.`}
          </p>
        </div>
        {saving && (
          <Loader2
            size={13}
            className="animate-spin"
            style={{ color: "var(--color-text-tertiary)" }}
            aria-hidden
          />
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-lg p-2 text-[11px]"
          style={{
            background: "rgba(220,38,38,0.06)",
            color: "var(--color-error, #b91c1c)",
            border: "1px solid rgba(220,38,38,0.20)",
          }}
        >
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={11} /> {error}
          </span>
        </div>
      )}

      <ul
        className="grid grid-cols-1 gap-2 border-t p-4 md:grid-cols-2"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        {data.knownSignalTypes.map((type) => {
          const isOn = selected.has(type);
          const meta = SIGNAL_LABELS[type] ?? { label: type, help: "" };
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() => isAdmin && toggle(type)}
                disabled={!isAdmin}
                className="flex w-full items-start gap-2 rounded-lg p-2 text-left transition-colors"
                style={{
                  background: isOn
                    ? "var(--color-accent-soft, rgba(99,102,241,0.10))"
                    : "var(--color-bg-card)",
                  border: isOn
                    ? "1px solid var(--color-accent, #6366f1)"
                    : "1px solid var(--color-border-default)",
                  cursor: isAdmin ? "pointer" : "not-allowed",
                  opacity: isAdmin ? 1 : 0.7,
                }}
              >
                <span
                  className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded"
                  style={{
                    background: isOn
                      ? "var(--color-accent, #6366f1)"
                      : "var(--color-bg-page)",
                    border: isOn
                      ? "1px solid var(--color-accent, #6366f1)"
                      : "1px solid var(--color-border-default)",
                  }}
                  aria-hidden
                >
                  {isOn && <Check size={9} style={{ color: "white" }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="text-[12px] font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {meta.label}
                  </span>
                  {meta.help && (
                    <span
                      className="mt-0.5 block text-[10px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {meta.help}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p
        className="border-t px-4 py-2 text-[10px]"
        style={{
          borderColor: "var(--color-border-default)",
          color: "var(--color-text-tertiary)",
        }}
      >
        Manual enrollment still works regardless of triggers. The filter
        only narrows automatic enrollment from the signal pipeline.
      </p>
    </section>
  );
}
