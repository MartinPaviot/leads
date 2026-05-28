"use client";

/**
 * Playbook page (B4b, _specs/pilae-machine R11.2).
 *
 * Read-side : list every captured entry filtered by type, sorted by
 * perf_score DESC NULLS LAST. Write-side : a manual-add form so the
 * founder can type in an objection / accroche / question they heard
 * outside any captured activity.
 *
 * The LLM extractor that fans `playbook/capture-from-activity` events
 * from Recall.ai transcripts and reply-handler analyses is a separate
 * follow-up (B4-LLM-extractor). The capture sink is already shipped
 * in d7ed10a and consumes whatever producer fires the event.
 */

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PLAYBOOK_ENTRY_TYPES } from "@/lib/playbook/capture";
import { Plus, Star } from "lucide-react";

type PlaybookEntry = {
  id: string;
  type: string;
  content: string;
  sourceActivityId: string | null;
  outcomeLabel: string | null;
  perfScore: number | null;
  createdAt: string;
  updatedAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  objection: "Objections",
  accroche: "Accroches",
  question: "Questions",
};

export default function PlaybookPage() {
  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fetchEntries = useCallback(async (type: string) => {
    setLoading(true);
    setError(null);
    try {
      const url =
        type === "all"
          ? "/api/playbook"
          : `/api/playbook?type=${encodeURIComponent(type)}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(typeFilter);
  }, [typeFilter, fetchEntries]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Playbook"
        subtitle="Objections, accroches, questions — distilled from every call, meeting, reply."
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            <FilterChip
              active={typeFilter === "all"}
              label="All"
              onClick={() => setTypeFilter("all")}
            />
            {PLAYBOOK_ENTRY_TYPES.map((t) => (
              <FilterChip
                key={t}
                active={typeFilter === t}
                label={TYPE_LABELS[t] ?? t}
                onClick={() => setTypeFilter(t)}
              />
            ))}
          </div>
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="flex items-center gap-1 rounded px-3 py-1 text-[12px] font-medium"
            style={{
              color: "var(--color-text-primary)",
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <Plus size={12} />
            <span>{addOpen ? "Cancel" : "Add entry"}</span>
          </button>
        </div>

        {addOpen && (
          <AddEntryForm
            onClose={() => setAddOpen(false)}
            onAdded={() => {
              setAddOpen(false);
              fetchEntries(typeFilter);
            }}
          />
        )}

        {error && (
          <div
            className="mb-3 rounded border p-3 text-[12px]"
            style={{
              borderColor: "var(--color-error)",
              color: "var(--color-error)",
              background: "var(--color-bg-card)",
            }}
          >
            {error}
          </div>
        )}

        {loading && entries.length === 0 && (
          <p
            className="text-[12px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Loading…
          </p>
        )}
        {!loading && entries.length === 0 && (
          <EmptyState />
        )}
        <div className="space-y-2">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active
          ? "var(--color-accent)"
          : "var(--color-bg-card)",
        color: active ? "#fff" : "var(--color-text-secondary)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {label}
    </button>
  );
}

function EntryCard({ entry }: { entry: PlaybookEntry }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className="rounded-full px-1.5 py-0.5 font-medium uppercase tracking-wider"
                style={{
                  background: "var(--color-bg-card)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                {TYPE_LABELS[entry.type] ?? entry.type}
              </span>
              {entry.outcomeLabel && (
                <span style={{ color: "var(--color-text-tertiary)" }}>
                  outcome: {entry.outcomeLabel}
                </span>
              )}
            </div>
            <p
              className="mt-2 text-[13px] leading-relaxed"
              style={{ color: "var(--color-text-primary)" }}
            >
              {entry.content}
            </p>
          </div>
          <PerfBadge score={entry.perfScore} />
        </div>
      </CardBody>
    </Card>
  );
}

function PerfBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span
        className="shrink-0 text-[11px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        unrated
      </span>
    );
  }
  const pct = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "var(--color-success)"
      : score >= 0.4
        ? "var(--color-warning)"
        : "var(--color-error)";
  return (
    <div
      className="flex shrink-0 items-center gap-1 text-[11px] font-medium"
      style={{ color }}
    >
      <Star size={12} />
      <span>{pct}%</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded border p-6 text-center text-[12px]"
      style={{
        borderColor: "var(--color-border-default)",
        color: "var(--color-text-tertiary)",
      }}
    >
      No entries yet. The capture Inngest fn fans in from calls,
      meetings, and replies once the LLM extractor is wired — or use{" "}
      <strong style={{ color: "var(--color-text-secondary)" }}>
        Add entry
      </strong>{" "}
      to record one directly.
    </div>
  );
}

function AddEntryForm({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [type, setType] = useState<string>(PLAYBOOK_ENTRY_TYPES[0]);
  const [content, setContent] = useState("");
  const [outcomeLabel, setOutcomeLabel] = useState("");
  const [perfScore, setPerfScore] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { type, content };
      if (outcomeLabel.trim()) body.outcomeLabel = outcomeLabel.trim();
      if (perfScore.trim()) {
        const n = Number.parseFloat(perfScore);
        if (Number.isFinite(n)) body.perfScore = n;
      }
      const res = await fetch("/api/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          (data as { error?: string }).error ??
            `Add failed (${res.status})`,
        );
        return;
      }
      setContent("");
      setOutcomeLabel("");
      setPerfScore("");
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="mb-4 rounded border p-4"
      style={{
        borderColor: "var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      <div className="flex flex-wrap gap-2">
        {PLAYBOOK_ENTRY_TYPES.map((t) => (
          <FilterChip
            key={t}
            active={type === t}
            label={TYPE_LABELS[t] ?? t}
            onClick={() => setType(t)}
          />
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What was said? (5-2000 chars)"
        rows={3}
        className="mt-3 w-full rounded border p-2 text-[12px]"
        style={{
          borderColor: "var(--color-border-default)",
          background: "var(--color-bg-default)",
          color: "var(--color-text-primary)",
        }}
      />
      <div className="mt-3 flex gap-2">
        <input
          value={outcomeLabel}
          onChange={(e) => setOutcomeLabel(e.target.value)}
          placeholder="Outcome label (optional)"
          className="flex-1 rounded border p-2 text-[12px]"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-default)",
            color: "var(--color-text-primary)",
          }}
        />
        <input
          value={perfScore}
          onChange={(e) => setPerfScore(e.target.value)}
          placeholder="Perf 0..1"
          className="w-24 rounded border p-2 text-[12px]"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-default)",
            color: "var(--color-text-primary)",
          }}
        />
      </div>
      {err && (
        <p
          className="mt-2 text-[11px]"
          style={{ color: "var(--color-error)" }}
        >
          {err}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="rounded px-3 py-1 text-[12px] font-medium"
          style={{
            color: "var(--color-text-secondary)",
            background: "transparent",
            border: "1px solid var(--color-border-default)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting || content.trim().length < 5}
          className="rounded px-3 py-1 text-[12px] font-medium"
          style={{
            color: "#fff",
            background: "var(--color-accent)",
            border: "1px solid var(--color-accent)",
            opacity:
              submitting || content.trim().length < 5 ? 0.6 : 1,
          }}
        >
          {submitting ? "Adding…" : "Add entry"}
        </button>
      </div>
    </div>
  );
}
