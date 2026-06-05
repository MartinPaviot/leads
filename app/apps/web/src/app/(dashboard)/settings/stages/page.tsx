"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";

interface Stage {
  id: string;
  name: string;
  description: string;
  category: "in_progress" | "done";
  aiFillMode: "auto" | "suggest" | "off";
  // Y9 — optional WIP limit, in-progress stages only.
  wipLimit?: number | null;
}

export default function StagesSettingsPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/stages")
      .then((r) => r.json())
      .then((data) => setStages(data.stages || []))
      .catch(() => setError("Failed to load stages"))
      .finally(() => setLoading(false));
  }, []);

  function updateStage(id: string, field: keyof Stage, value: string) {
    setStages(stages.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }

  // Y9 — wipLimit is numeric + nullable, so it can't go through the
  // string-keyed updateStage helper. Empty / zero / non-numeric clears
  // the limit (returns to "no cap" on the kanban).
  function updateStageWipLimit(id: string, raw: string) {
    const parsed = Number.parseInt(raw, 10);
    const next = raw.trim() === "" || !Number.isFinite(parsed) || parsed <= 0 ? null : parsed;
    setStages(stages.map((s) => (s.id === id ? { ...s, wipLimit: next } : s)));
  }

  function addStage(category: "in_progress" | "done") {
    setStages([...stages, { id: crypto.randomUUID(), name: "", description: "", category, aiFillMode: "suggest" }]);
  }

  function removeStage(id: string) {
    setStages(stages.filter((s) => s.id !== id));
  }

  async function saveStages() {
    const valid = stages.filter((s) => s.name.trim());
    setSaving(true);
    setError("");
    try {
      await fetch("/api/settings/stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: valid }),
      });
    } catch {
      setError("Failed to save stages");
    } finally {
      setSaving(false);
    }
  }

  const inProgress = stages.filter((s) => s.category === "in_progress");
  const done = stages.filter((s) => s.category === "done");

  const stageColors: Record<number, string> = {
    0: "bg-[var(--color-text-tertiary)]",
    1: "bg-[var(--color-text-tertiary)]",
    2: "bg-amber-400",
    3: "bg-amber-400",
    4: "bg-emerald-400",
  };

  return (
    <>
      <SettingsHeader
        title="Opportunity stages"
        subtitle="Each stage represents a milestone in a deal. Describing each stage enables Elevay to track stages automatically based on activity."
      />

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
          ))}
        </div>
      ) : (
        <>
          {/* In progress */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-tertiary)]">In progress</span>
              <button
                onClick={() => addStage("in_progress")}
                className="text-xs text-[var(--color-accent)] hover:opacity-90"
              >
                +
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {inProgress.map((stage, i) => (
                <Card key={stage.id}>
                  <div className="flex items-start gap-3 p-3">
                    <div className={`mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full ${stageColors[i] || "bg-emerald-400"}`} />
                    <div className="flex-1 space-y-1">
                      <input
                        value={stage.name}
                        onChange={(e) => updateStage(stage.id, "name", e.target.value)}
                        placeholder="Stage name"
                        className="w-full bg-transparent text-sm font-medium text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
                      />
                      <input
                        value={stage.description}
                        onChange={(e) => updateStage(stage.id, "description", e.target.value)}
                        placeholder="Description (AI reads this for auto-progression)"
                        className="w-full bg-transparent text-xs text-[var(--color-text-tertiary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
                      />
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] font-medium" style={{ color: "var(--color-text-muted)" }}>AI:</span>
                        {(["auto", "suggest", "off"] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => updateStage(stage.id, "aiFillMode", mode)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors"
                            style={{
                              background: stage.aiFillMode === mode ? "var(--color-accent-soft)" : "transparent",
                              color: stage.aiFillMode === mode ? "var(--color-accent)" : "var(--color-text-muted)",
                            }}
                          >
                            {mode}
                          </button>
                        ))}
                        {/* Y9 — WIP limit input. Blank = no cap. */}
                        <span className="ml-3 text-[10px] font-medium" style={{ color: "var(--color-text-muted)" }}>WIP limit:</span>
                        <input
                          type="number"
                          min={1}
                          value={stage.wipLimit ?? ""}
                          onChange={(e) => updateStageWipLimit(stage.id, e.target.value)}
                          placeholder="—"
                          className="w-14 rounded px-1 py-0.5 text-[10px]"
                          style={{
                            background: "var(--color-bg-page)",
                            color: "var(--color-text-primary)",
                            border: "1px solid var(--color-border-default)",
                          }}
                          aria-label={`WIP limit for ${stage.name || "stage"}`}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => removeStage(stage.id)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400"
                    >
                      &times;
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Done */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-tertiary)]">Done</span>
              <button
                onClick={() => addStage("done")}
                className="text-xs text-[var(--color-accent)] hover:opacity-90"
              >
                +
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {done.map((stage) => (
                <Card key={stage.id}>
                  <div className="flex items-start gap-3 p-3">
                    <div className="mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: "var(--color-info)" }} />
                    <div className="flex-1 space-y-1">
                      <input
                        value={stage.name}
                        onChange={(e) => updateStage(stage.id, "name", e.target.value)}
                        placeholder="Stage name"
                        className="w-full bg-transparent text-sm font-medium text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
                      />
                      <input
                        value={stage.description}
                        onChange={(e) => updateStage(stage.id, "description", e.target.value)}
                        placeholder="Description"
                        className="w-full bg-transparent text-xs text-[var(--color-text-tertiary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
                      />
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] font-medium" style={{ color: "var(--color-text-muted)" }}>AI:</span>
                        {(["auto", "suggest", "off"] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => updateStage(stage.id, "aiFillMode", mode)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors"
                            style={{
                              background: stage.aiFillMode === mode ? "var(--color-accent-soft)" : "transparent",
                              color: stage.aiFillMode === mode ? "var(--color-accent)" : "var(--color-text-muted)",
                            }}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => removeStage(stage.id)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400"
                    >
                      &times;
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="gradient"
              onClick={saveStages}
              loading={saving}
            >
              {saving ? "Saving..." : "Save stages"}
            </Button>
            {error && <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}
          </div>
        </>
      )}
    </>
  );
}
