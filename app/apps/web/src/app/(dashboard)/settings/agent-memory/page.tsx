"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Settings → Agent memory — renders the unified snapshot from
 * /api/agent-memory, grouped by category. The first visit flips
 * `agentMemoryPanelDiscovered` server-side, which unlocks the
 * progressive-autonomy nudge engine (WS-1 T2+T4 sequencing gate).
 *
 * Minimal UX for now — read-only list with an export button. Edit /
 * delete per-entry is a follow-up scoped as a small PR.
 */

type MemoryCategory =
  | "inferred-from-website"
  | "inferred-from-inbox"
  | "explicit-setting"
  | "user-provided-knowledge"
  | "past-conversation-summary"
  | "learned-preference";

interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  label: string;
  value: string;
  source: string;
  confidence?: number;
  editable: boolean;
}

interface TrustEvent {
  id: string;
  eventType: string;
  scoreDelta: number;
  newScore: number;
  reason: string | null;
  createdAt: string;
}

interface Snapshot {
  tenantId: string;
  generatedAt: string;
  entries: MemoryEntry[];
  trustScore: number | null;
  trustEventLog: TrustEvent[];
}

const CATEGORY_ORDER: MemoryCategory[] = [
  "explicit-setting",
  "inferred-from-website",
  "inferred-from-inbox",
  "user-provided-knowledge",
  "past-conversation-summary",
  "learned-preference",
];

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  "inferred-from-website": "From your website",
  "inferred-from-inbox": "From your identity / inbox",
  "explicit-setting": "Your explicit settings",
  "user-provided-knowledge": "Knowledge you taught me",
  "past-conversation-summary": "Past conversation summaries",
  "learned-preference": "What I've learned from you",
};

export default function AgentMemoryPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-memory");
      if (!res.ok) return;
      setSnapshot((await res.json()) as Snapshot);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function exportJson() {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `elevay-agent-memory-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const grouped: Record<MemoryCategory, MemoryEntry[]> = {
    "inferred-from-website": [],
    "inferred-from-inbox": [],
    "explicit-setting": [],
    "user-provided-knowledge": [],
    "past-conversation-summary": [],
    "learned-preference": [],
  };
  for (const entry of snapshot?.entries ?? []) {
    grouped[entry.category].push(entry);
  }

  return (
    <>
      <SettingsHeader
        title="Agent memory"
        subtitle="Everything the agent knows about you — source, confidence, editable where applicable."
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Generated {snapshot ? new Date(snapshot.generatedAt).toLocaleString() : "…"}
          </p>
          <Button size="sm" variant="outline" onClick={exportJson} disabled={!snapshot}>
            <Download size={13} /> Export JSON
          </Button>
        </div>

        {loading && !snapshot && (
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                <Loader2 size={12} className="animate-spin" /> Building snapshot…
              </div>
            </CardBody>
          </Card>
        )}

        {snapshot &&
          CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            return (
              <Card key={cat}>
                <CardBody>
                  <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {CATEGORY_LABEL[cat]}
                  </h2>
                  <dl className="mt-2 space-y-2">
                    {items.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3">
                        <dt
                          className="min-w-[140px] text-[11px] font-medium"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {entry.label}
                        </dt>
                        <dd className="flex-1 text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                          {entry.value}
                          <div className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                            <Sparkles size={9} style={{ display: "inline", marginRight: 3 }} />
                            {entry.source}
                            {typeof entry.confidence === "number" &&
                              ` · confidence ${(entry.confidence * 100).toFixed(0)}%`}
                          </div>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardBody>
              </Card>
            );
          })}

        {snapshot && snapshot.trustEventLog.length > 0 && (
          <Card>
            <CardBody>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Trust-score change log
              </h2>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                Current score: {((snapshot.trustScore ?? 0) * 100).toFixed(0)}%. Higher scores unlock suggestions to relax your approval mode.
              </p>
              <ul className="mt-2 space-y-1 text-[11px]">
                {snapshot.trustEventLog.slice(0, 20).map((e) => (
                  <li key={e.id}>
                    <span style={{ color: "var(--color-text-tertiary)" }}>
                      {new Date(e.createdAt).toLocaleString()} ·
                    </span>{" "}
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {e.eventType}
                    </span>{" "}
                    <span
                      style={{
                        color:
                          e.scoreDelta > 0
                            ? "rgb(22,163,74)"
                            : e.scoreDelta < 0
                              ? "rgb(220,38,38)"
                              : "var(--color-text-tertiary)",
                      }}
                    >
                      {e.scoreDelta > 0 ? "+" : ""}
                      {e.scoreDelta.toFixed(2)}
                    </span>
                    {e.reason && (
                      <span style={{ color: "var(--color-text-tertiary)" }}>
                        {" · "}
                        {e.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
