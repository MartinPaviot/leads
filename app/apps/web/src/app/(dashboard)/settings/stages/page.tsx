"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* CLE-14: page-action helpers (pure, shared) */
const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });
function definePageAction<P>(a: PageAction<P>): PageAction { return a as unknown as PageAction; }

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

  /**
   * CLE-14 — the single PUT path for the whole stage list, shared by the Save
   * button and the chat action. Drops nameless rows (as the button always did),
   * mirrors the result into local state, and returns {ok,error?} so the action
   * run can report without duplicating the fetch.
   */
  const saveStagesValue = useCallback(
    async (next: Stage[]): Promise<{ ok: boolean; error?: string; saved: Stage[] }> => {
      const valid = next.filter((s) => s.name.trim());
      setSaving(true);
      setError("");
      try {
        const res = await fetch("/api/settings/stages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stages: valid }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true, saved: valid };
      } catch {
        setError("Failed to save stages");
        return { ok: false, error: "Failed to save stages", saved: valid };
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  async function saveStages() {
    await saveStagesValue(stages);
  }

  // CLE-14: register this page's one SAFE config action. Reuses
  // saveStagesValue (the same whole-list PUT the Save button uses).
  const stagesActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "settings.editPipelineStages",
        title: "Edit the pipeline stages",
        description:
          "Replace the full set of pipeline stages (whole-list PUT). Each stage has a name (required) and " +
          "optional id, description, category ('in_progress' | 'done'), aiFillMode ('auto' | 'suggest' | 'off'), " +
          "and wipLimit. Use when the user wants to add, rename, reorder, or remove pipeline stages.",
        params: z.object({
          stages: z
            .array(
              z.object({
                id: z.string().optional(),
                name: z.string().min(1),
                description: z.string().optional(),
                category: z.string().optional(),
                aiFillMode: z.string().optional(),
                wipLimit: z.number().int().positive().optional(),
              }),
            )
            .min(1),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ stages: next }): Promise<PageActionResult> => {
          // Normalise the loosely-typed action input into the page's Stage shape,
          // filling ids/defaults so the saved list round-trips.
          const normalised: Stage[] = next.map((s) => ({
            id: s.id && s.id.trim() ? s.id : crypto.randomUUID(),
            name: s.name,
            description: s.description ?? "",
            category: s.category === "done" ? "done" : "in_progress",
            aiFillMode:
              s.aiFillMode === "auto" || s.aiFillMode === "off" ? s.aiFillMode : "suggest",
            wipLimit: s.wipLimit ?? null,
          }));
          setStages(normalised);
          const r = await saveStagesValue(normalised);
          if (!r.ok) return errResult(r.error ?? "Failed to update the pipeline.");
          const n = r.saved.length;
          if (n === 0) return errResult("Every stage needs a name.");
          return okResult(`Pipeline updated - ${n} stage${n === 1 ? "" : "s"}.`);
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveStagesValue],
  );
  useRegisterPageActions(stagesActions);

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
