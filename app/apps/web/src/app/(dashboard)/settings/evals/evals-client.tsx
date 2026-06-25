"use client";

import { useEffect, useState, useCallback } from "react";
import { FlaskConical, Plus, Play, ChevronRight, ChevronDown, Check, X, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/ui/settings-header";

interface Dataset { id: string; name: string; description: string | null; caseCount: number; createdAt: string }
interface EvalCase { id: string; input: string; expectedOutput: string | null; tags: string[]; createdAt: string }
interface Run { id: string; datasetId: string; model: string; graderModel: string; status: string; summary: Record<string, unknown>; createdAt: string }
interface Result { id: string; caseId: string; input: string; expectedOutput: string | null; agentOutput: string | null; score: number; pass: boolean; graderReasoning: string | null; tags: string[]; latencyMs: number }

export default function EvalsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [runDetail, setRunDetail] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseInput, setNewCaseInput] = useState("");
  const [newCaseExpected, setNewCaseExpected] = useState("");
  const [newCaseTags, setNewCaseTags] = useState("");
  const [showNewDataset, setShowNewDataset] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [seeding, setSeeding] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [dsRes, runRes] = await Promise.all([
        fetch("/api/eval/datasets"), fetch("/api/eval/runs"),
      ]);
      if (dsRes.ok) setDatasets((await dsRes.json()).datasets || []);
      if (runRes.ok) setRuns((await runRes.json()).runs || []);
      // Both lanes down = a real failure, not just an empty harness (dev-only
      // page, so a console-readable banner is enough — no toast wired here).
      if (!dsRes.ok && !runRes.ok) setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function loadCases(datasetId: string) {
    setSelectedDataset(datasetId);
    setSelectedRun(null);
    const res = await fetch(`/api/eval/datasets/${datasetId}/cases`);
    if (res.ok) setCases((await res.json()).cases || []);
  }

  async function loadRun(runId: string) {
    setSelectedRun(runId);
    const res = await fetch(`/api/eval/runs/${runId}`);
    if (res.ok) {
      const data = await res.json();
      setRunDetail(data.run);
      setResults(data.results || []);
    }
  }

  async function createDataset() {
    if (!newDatasetName.trim()) return;
    await fetch("/api/eval/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDatasetName }),
    });
    setNewDatasetName("");
    setShowNewDataset(false);
    fetchData();
  }

  async function addCase() {
    if (!selectedDataset || !newCaseInput.trim()) return;
    await fetch(`/api/eval/datasets/${selectedDataset}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: newCaseInput,
        expectedOutput: newCaseExpected || null,
        tags: newCaseTags.split(",").map(t => t.trim()).filter(Boolean),
      }),
    });
    setNewCaseInput(""); setNewCaseExpected(""); setNewCaseTags("");
    setShowNewCase(false);
    loadCases(selectedDataset);
  }

  async function triggerRun(datasetId: string) {
    await fetch("/api/eval/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId }),
    });
    fetchData();
  }

  async function seedFromChat() {
    setSeeding(true);
    const body: Record<string, unknown> = {};
    if (selectedDataset) body.datasetId = selectedDataset;
    await fetch("/api/eval/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSeeding(false);
    fetchData();
  }

  const datasetRuns = selectedDataset ? runs.filter(r => r.datasetId === selectedDataset) : [];
  const summary = runDetail?.summary as Record<string, unknown> | undefined;
  const regressions = (summary?.regressions || []) as Array<{ caseId: string; input: string; previousScore: number; currentScore: number }>;

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
        <div className="flex items-center gap-3">
          <FlaskConical size={18} style={{ color: "var(--color-accent)" }} />
          <div>
            <SettingsHeader
              title="Agent Evaluations"
              subtitle="Automated quality testing with LLM-as-judge grading"
            />
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center gap-3 px-6 py-2 text-[12px]" style={{ color: "var(--color-error, #b91c1c)", borderBottom: "1px solid var(--color-border-default)" }}>
          <span>Couldn&apos;t load eval datasets/runs. This is not an empty harness — the request failed.</span>
          <button onClick={fetchData} className="ml-auto font-medium underline">Retry</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Datasets */}
        <div className="w-72 overflow-auto" style={{ borderRight: "1px solid var(--color-border-default)" }}>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
            <span className="text-[12px] font-semibold" style={{ color: "var(--color-text-tertiary)" }}>
              DATASETS
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={seedFromChat} disabled={seeding}
                icon={<FlaskConical size={11} />} style={{ color: "var(--color-accent)" }}>
                {seeding ? "Seeding..." : "Seed"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowNewDataset(true)}
                icon={<Plus size={11} />} />
            </div>
          </div>

          {showNewDataset && (
            <div className="p-3" style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
              <input value={newDatasetName} onChange={e => setNewDatasetName(e.target.value)}
                placeholder="Dataset name" className="w-full rounded p-2 text-[12px] outline-none"
                style={{ background: "var(--color-bg-muted)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
                onKeyDown={e => e.key === "Enter" && createDataset()} />
              <div className="mt-2 flex gap-1">
                <Button variant="solid" size="sm" onClick={createDataset}>Create</Button>
                <Button variant="ghost" size="sm" onClick={() => setShowNewDataset(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {datasets.map(ds => (
            <button key={ds.id} onClick={() => loadCases(ds.id)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors"
              style={{
                borderBottom: "0.5px solid var(--color-border-default)",
                background: selectedDataset === ds.id ? "var(--color-bg-hover)" : "transparent",
              }}>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate"
                  style={{ color: "var(--color-text-primary)" }}>{ds.name}</div>
                <div className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {ds.caseCount} cases
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "var(--color-text-muted)" }} />
            </button>
          ))}

          {datasets.length === 0 && !loading && (
            <div className="p-4 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              No datasets yet. Create one or seed from chat history.
            </div>
          )}
        </div>

        {/* Right: Cases + Runs + Results */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {!selectedDataset && !selectedRun && (
            <div className="flex h-full items-center justify-center">
              <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                Select a dataset to view cases and run evaluations
              </p>
            </div>
          )}

          {selectedDataset && !selectedRun && (
            <>
              {/* Actions */}
              <div className="mb-4 flex items-center gap-2">
                <Button variant="solid" size="sm" icon={<Play size={12} />}
                  onClick={() => triggerRun(selectedDataset)}>
                  Run Eval
                </Button>
                <Button variant="outline" size="sm" icon={<Plus size={12} />}
                  onClick={() => setShowNewCase(true)}>
                  Add Case
                </Button>
                <span className="ml-auto text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {cases.length} cases
                </span>
              </div>

              {/* New case form */}
              {showNewCase && (
                <div className="mb-4 rounded-lg p-4"
                  style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                  <div className="space-y-2">
                    <textarea value={newCaseInput} onChange={e => setNewCaseInput(e.target.value)}
                      placeholder="User query (input)" rows={2}
                      className="w-full rounded p-2 text-[12px] outline-none"
                      style={{ background: "var(--color-bg-muted)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }} />
                    <textarea value={newCaseExpected} onChange={e => setNewCaseExpected(e.target.value)}
                      placeholder="Expected output (optional)" rows={2}
                      className="w-full rounded p-2 text-[12px] outline-none"
                      style={{ background: "var(--color-bg-muted)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }} />
                    <input value={newCaseTags} onChange={e => setNewCaseTags(e.target.value)}
                      placeholder="Tags (comma-separated: recall, reasoning, tool_use)"
                      className="w-full rounded p-2 text-[12px] outline-none"
                      style={{ background: "var(--color-bg-muted)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }} />
                    <div className="flex gap-1">
                      <Button variant="solid" size="sm" onClick={addCase}>Add</Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowNewCase(false)}>Cancel</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Previous runs */}
              {datasetRuns.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase"
                    style={{ color: "var(--color-text-tertiary)" }}>Recent Runs</h3>
                  <div className="space-y-1">
                    {datasetRuns.map(run => {
                      const s = run.summary as Record<string, unknown> | undefined;
                      const passRate = s?.passRate as number | undefined;
                      return (
                        <button key={run.id} onClick={() => loadRun(run.id)}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors"
                          style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                          <span className={`h-2 w-2 rounded-full ${run.status === "completed" ? "bg-green-500" : run.status === "running" ? "animate-pulse bg-yellow-500" : "bg-gray-400"}`} />
                          <span className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                            {new Date(run.createdAt).toLocaleDateString()} — {run.model}
                          </span>
                          {passRate !== undefined && (
                            <span className="ml-auto text-[12px] font-semibold"
                              style={{ color: passRate >= 0.7 ? "oklch(0.6 0.15 145)" : "oklch(0.6 0.2 25)" }}>
                              {(passRate * 100).toFixed(0)}%
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cases list */}
              <h3 className="mb-2 text-[11px] font-semibold uppercase"
                style={{ color: "var(--color-text-tertiary)" }}>Cases</h3>
              <div className="space-y-1">
                {cases.map(c => (
                  <div key={c.id} className="rounded-md px-3 py-2"
                    style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                    <div className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                      {c.input.slice(0, 120)}{c.input.length > 120 ? "..." : ""}
                    </div>
                    {(c.tags as string[]).length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {(c.tags as string[]).map(tag => (
                          <span key={tag} className="rounded-full px-2 py-0.5 text-[9px]"
                            style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Run results view */}
          {selectedRun && runDetail && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedRun(null); setRunDetail(null); }}
                className="mb-4">&larr; Back to dataset</Button>

              {/* Summary cards */}
              <div className="mb-4 grid grid-cols-4 gap-3">
                <div className="rounded-lg p-3 text-center"
                  style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                  <div className="text-[20px] font-bold"
                    style={{ color: (summary?.passRate as number) >= 0.7 ? "oklch(0.6 0.15 145)" : "oklch(0.6 0.2 25)" }}>
                    {((summary?.passRate as number || 0) * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Pass Rate</div>
                </div>
                <div className="rounded-lg p-3 text-center"
                  style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                  <div className="text-[20px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                    {((summary?.meanScore as number || 0) * 100).toFixed(0)}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Mean Score</div>
                </div>
                <div className="rounded-lg p-3 text-center"
                  style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                  <div className="text-[20px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                    {summary?.totalCases as number || 0}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Cases</div>
                </div>
                <div className="rounded-lg p-3 text-center"
                  style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                  <div className="text-[20px] font-bold"
                    style={{ color: regressions.length > 0 ? "oklch(0.6 0.2 25)" : "oklch(0.6 0.15 145)" }}>
                    {regressions.length}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Regressions</div>
                </div>
              </div>

              {/* Regressions alert */}
              {regressions.length > 0 && (
                <div className="mb-4 rounded-lg p-3"
                  style={{ background: "oklch(0.95 0.05 25)", border: "1px solid oklch(0.8 0.1 25)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} style={{ color: "oklch(0.5 0.2 25)" }} />
                    <span className="text-[12px] font-semibold" style={{ color: "oklch(0.4 0.2 25)" }}>
                      {regressions.length} regression{regressions.length !== 1 ? "s" : ""} detected
                    </span>
                  </div>
                  {regressions.map((r, i) => (
                    <div key={i} className="text-[11px] mt-1" style={{ color: "oklch(0.4 0.15 25)" }}>
                      &ldquo;{r.input}&rdquo; — was {(r.previousScore * 100).toFixed(0)}%, now {(r.currentScore * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
              )}

              {/* Results table */}
              <div className="space-y-2">
                {results.map(r => (
                  <div key={r.id} className="rounded-lg overflow-hidden"
                    style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
                    <div className="flex items-center gap-2 px-3 py-2"
                      style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
                      {r.pass
                        ? <Check size={13} style={{ color: "oklch(0.6 0.15 145)" }} />
                        : <X size={13} style={{ color: "oklch(0.6 0.2 25)" }} />}
                      <span className="flex-1 truncate text-[12px]"
                        style={{ color: "var(--color-text-primary)" }}>
                        {r.input?.slice(0, 80)}
                      </span>
                      <span className="text-[12px] font-semibold"
                        style={{ color: r.pass ? "oklch(0.6 0.15 145)" : "oklch(0.6 0.2 25)" }}>
                        {((r.score || 0) * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        {r.latencyMs}ms
                      </span>
                    </div>
                    {r.graderReasoning && (
                      <div className="px-3 py-2 text-[11px]"
                        style={{ color: "var(--color-text-secondary)" }}>
                        {r.graderReasoning.slice(0, 300)}{r.graderReasoning.length > 300 ? "..." : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
