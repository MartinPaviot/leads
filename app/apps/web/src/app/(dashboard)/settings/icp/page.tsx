"use client";

/**
 * /settings/icp — THE ICP surface (Phase 1, _specs/icp-unification R4).
 *
 * Replaces both the legacy flat form (its product fields moved to
 * /settings/product) and the raw rule-builder at /settings/icp-profiles
 * (which now redirects here).
 *
 * List: profiles ordered by priority — the ORDER is the priority
 * (drag to reorder, R4.2). Editor: guided sections built on the
 * CriterionList tag-list primitive (R4.3b) with a per-section
 * importance control (R4.4); criteria the widgets cannot express live
 * under "Advanced criteria" (R4.6); a profile created outside the
 * editor (AI / API, no uiState) renders everything as Advanced (R4.7).
 * Saving persists uiState + regenerates criteria server-side, mirrors
 * the flats when rank 1, then polls the recompute summary to show the
 * real consequence: "N regraded (X up, Y down)" (R7.1).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  Plus, Trash2, Target, Radar, Archive, RotateCcw, GripVertical,
  ChevronDown, ChevronRight, ArrowLeft, Sparkles,
} from "lucide-react";
import {
  CriterionList, AmountField, ImportanceSelect, SourcingOnlyHint,
} from "@/components/icp/criterion-list";
import {
  INDUSTRIES, COMPANY_SIZES, GEOGRAPHIES, JOB_SENIORITIES,
} from "@/lib/config/icp-constants";
import {
  parseUiState, parseSourcingFilters, splitCriteria, criteriaToUiState,
  EMPTY_UI_STATE, EMPTY_SOURCING_FILTERS, DEFAULT_IMPORTANCE,
  type IcpUiState, type SourcingFilters, type Importance, type ImportanceSection,
} from "@/lib/icp/ui-state";

type CatalogField = {
  fieldKey: string;
  label: string;
  source: string;
  valueType: string;
  operators: string[];
  isCustom: boolean;
};

type IcpListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: number;
  criteriaCount: number;
  fitCount: number;
};

type AdvancedCriterion = {
  fieldKey: string;
  operator: string;
  value: unknown;
  weight: number;
  isRequired: boolean;
};

type Draft = {
  id: string | null;
  name: string;
  description: string;
  status: string;
  priority: number;
  uiState: IcpUiState;
  sourcingFilters: SourcingFilters;
  advanced: AdvancedCriterion[];
  /** False for pre-Phase-1 / AI profiles → everything renders Advanced. */
  hasUiState: boolean;
  fitCount: number | null;
};

type RecomputeSummary = {
  at: string;
  companies: number;
  regradedUp: number;
  regradedDown: number;
  unowned: number;
  icps: number;
};

type InferCandidate = {
  name: string;
  description: string | null;
  priority: number;
  criteria: AdvancedCriterion[];
  valid: boolean;
  validationError: string | null;
};

function newDraft(priority: number): Draft {
  return {
    id: null,
    name: "",
    description: "",
    status: "draft",
    priority,
    uiState: { ...EMPTY_UI_STATE, importance: {} },
    sourcingFilters: { ...EMPTY_SOURCING_FILTERS },
    advanced: [],
    hasUiState: true,
    fitCount: null,
  };
}

export default function IcpPage() {
  const { toast } = useToast();
  const [list, setList] = useState<IcpListItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogField[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState<Record<string, number>>({});
  const [viewDeleted, setViewDeleted] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [inferring, setInferring] = useState(false);
  const [candidates, setCandidates] = useState<InferCandidate[] | null>(null);
  // Diff-after-save (R7.1)
  const [rescoring, setRescoring] = useState(false);
  const [diff, setDiff] = useState<RecomputeSummary | null>(null);
  const pollStop = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [icpsRes, catRes] = await Promise.all([
        fetch(`/api/icps${viewDeleted ? "?deleted=true" : ""}`),
        fetch("/api/icp-catalog"),
      ]);
      if (icpsRes.ok) setList((await icpsRes.json()).icps ?? []);
      if (catRes.ok) setCatalog((await catRes.json()).fields ?? []);
    } catch {
      toast("Failed to load ICP profiles", "error");
    } finally {
      setLoading(false);
    }
  }, [toast, viewDeleted]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => () => { pollStop.current = true; }, []);

  // ── Diff-after-save poll (R7.1) — 3 s cadence, 60 s cap ──
  const pollRecompute = useCallback(async (since: string) => {
    setRescoring(true);
    setDiff(null);
    pollStop.current = false;
    const deadline = Date.now() + 60_000;
    const tick = async () => {
      if (pollStop.current) return;
      try {
        const res = await fetch("/api/icps/recompute-status");
        if (res.ok) {
          const data = (await res.json()) as { lastIcpRecompute: RecomputeSummary | null };
          const s = data.lastIcpRecompute;
          if (s && s.at > since) {
            setDiff(s);
            setRescoring(false);
            return;
          }
        }
      } catch {
        // transient — keep polling until the deadline
      }
      if (Date.now() < deadline) setTimeout(tick, 3_000);
      else setRescoring(false); // "still running" — the banner just stops
    };
    setTimeout(tick, 3_000);
  }, []);

  // ── Editor open / save ──

  async function openEdit(item: IcpListItem) {
    const res = await fetch(`/api/icps/${item.id}`);
    if (!res.ok) {
      toast("Failed to load the profile", "error");
      return;
    }
    const data = await res.json();
    const meta = (data.icp.metadata ?? {}) as Record<string, unknown>;
    const parsedUi = meta.uiState != null ? parseUiState(meta.uiState) : null;
    const parsedSf = meta.sourcingFilters != null ? parseSourcingFilters(meta.sourcingFilters) : null;
    const hasUiState = !!parsedUi && parsedUi.ok;
    const criteria: AdvancedCriterion[] = (data.criteria ?? []).map(
      (c: AdvancedCriterion) => ({
        fieldKey: c.fieldKey, operator: c.operator, value: c.value,
        weight: c.weight, isRequired: c.isRequired,
      }),
    );
    setDiff(null);
    setDraft({
      id: data.icp.id,
      name: data.icp.name,
      description: data.icp.description ?? "",
      status: data.icp.status,
      priority: data.icp.priority,
      uiState: hasUiState ? parsedUi.value : { ...EMPTY_UI_STATE, importance: {} },
      sourcingFilters: parsedSf && parsedSf.ok ? parsedSf.value : { ...EMPTY_SOURCING_FILTERS },
      advanced: splitCriteria(criteria, hasUiState).advanced,
      hasUiState,
      fitCount: item.fitCount,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast("Name is required", "error");
      return;
    }
    setSaving(true);
    const since = new Date().toISOString();
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description || null,
        status: draft.status,
        priority: draft.priority,
        metadata: draft.hasUiState
          ? { uiState: draft.uiState, sourcingFilters: draft.sourcingFilters }
          : undefined,
        criteria: draft.advanced,
      };
      const res = draft.id
        ? await fetch(`/api/icps/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/icps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? `Save failed (${res.status})`, "error");
        return;
      }
      toast(draft.id ? "Profile saved." : "Profile created.", "success");
      if (!draft.id && data.id) {
        setDraft({ ...draft, id: data.id });
      }
      refresh();
      if (draft.status === "active") void pollRecompute(since);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  // ── List actions ──

  async function remove(id: string) {
    const res = await fetch(`/api/icps/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Delete failed", "error");
      return;
    }
    toast("Profile deleted.", "success");
    refresh();
  }

  async function restore(id: string) {
    const res = await fetch("/api/icps/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Restore failed", "error");
      return;
    }
    toast("Profile restored — rescoring companies.", "success");
    refresh();
  }

  async function persistOrder(items: IcpListItem[]) {
    const res = await fetch("/api/icps/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: items.map((i) => i.id) }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Reorder failed", "error");
      refresh();
      return;
    }
    toast("Order saved — profile 1 owns matching companies first.", "success");
  }

  const buildTam = useCallback(
    async (icpId: string, icpName: string) => {
      setBuilding((b) => ({ ...b, [icpId]: 0 }));
      try {
        const res = await fetch("/api/tam/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icpId, targetCount: 200 }),
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({}));
          toast(d.error ?? `Build failed (${res.status})`, "error");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let inserted = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as { type: string; message?: string };
              if (ev.type === "company.inserted") {
                inserted++;
                setBuilding((b) => ({ ...b, [icpId]: inserted }));
              } else if (ev.type === "error" && ev.message) {
                toast(`Build error: ${ev.message}`, "error");
              }
            } catch {
              // partial line — ignore
            }
          }
        }
        toast(`Sourced ${inserted} companies for "${icpName}".`, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Network error", "error");
      } finally {
        setBuilding((b) => {
          const next = { ...b };
          delete next[icpId];
          return next;
        });
        refresh();
      }
    },
    [toast, refresh],
  );

  // ── AI inference (R4.8) ──

  async function suggestWithAi() {
    setInferring(true);
    setCandidates(null);
    try {
      const res = await fetch("/api/icps/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? `Inference failed (${res.status})`, "error");
        return;
      }
      const cands = (data.candidates ?? []) as InferCandidate[];
      if (cands.length === 0) {
        toast("No candidates — fill your Product & Voice description first.", "error");
        return;
      }
      setCandidates(cands);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setInferring(false);
    }
  }

  function reviewCandidate(c: InferCandidate) {
    // Adopt the AI's criteria into the widgets; leftovers go Advanced.
    const { uiState, advanced } = criteriaToUiState(c.criteria);
    setCandidates(null);
    setDiff(null);
    setDraft({
      ...newDraft(list.length),
      name: c.name,
      description: c.description ?? "",
      uiState,
      advanced,
    });
  }

  // ── Render ──

  return (
    <div>
      <SettingsHeader
        title="ICP"
        subtitle="Your Ideal Customer Profiles. Companies are scored against each profile — the first matching profile owns the company, drives sourcing and feeds the flat targeting your scripts and chat use."
      />

      {!draft && (
        <ProfileList
          list={list}
          loading={loading}
          viewDeleted={viewDeleted}
          building={building}
          dragIndex={dragIndex}
          inferring={inferring}
          onToggleDeleted={() => setViewDeleted((v) => !v)}
          onNew={() => { setDiff(null); setDraft(newDraft(list.length)); }}
          onSuggest={suggestWithAi}
          onEdit={openEdit}
          onDelete={remove}
          onRestore={restore}
          onBuild={buildTam}
          onDragIndex={setDragIndex}
          onReorder={(next) => {
            setList(next);
            void persistOrder(next);
          }}
        />
      )}

      {!draft && candidates && (
        <CandidatePanel
          candidates={candidates}
          onClose={() => setCandidates(null)}
          onReview={reviewCandidate}
        />
      )}

      {draft && (
        <ProfileEditor
          draft={draft}
          catalog={catalog}
          saving={saving}
          rescoring={rescoring}
          diff={diff}
          onChange={setDraft}
          onSave={save}
          onBack={() => { pollStop.current = true; setDraft(null); setDiff(null); setRescoring(false); refresh(); }}
        />
      )}
    </div>
  );
}

/* ── List view ──────────────────────────────────────────────────── */

function ProfileList({
  list, loading, viewDeleted, building, dragIndex, inferring,
  onToggleDeleted, onNew, onSuggest, onEdit, onDelete, onRestore, onBuild,
  onDragIndex, onReorder,
}: {
  list: IcpListItem[];
  loading: boolean;
  viewDeleted: boolean;
  building: Record<string, number>;
  dragIndex: number | null;
  inferring: boolean;
  onToggleDeleted: () => void;
  onNew: () => void;
  onSuggest: () => void;
  onEdit: (item: IcpListItem) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onBuild: (id: string, name: string) => void;
  onDragIndex: (i: number | null) => void;
  onReorder: (next: IcpListItem[]) => void;
}) {
  return (
    <>
      <div className="mb-4 flex justify-end gap-2">
        {!viewDeleted && (
          <>
            <button
              onClick={onSuggest}
              disabled={inferring}
              className="flex items-center gap-1 rounded px-3 py-1.5 text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)", opacity: inferring ? 0.6 : 1 }}
            >
              <Sparkles size={13} /> {inferring ? "Inferring…" : "Suggest with AI"}
            </button>
            <button
              onClick={onNew}
              className="flex items-center gap-1 rounded px-3 py-1.5 text-[12px] font-medium"
              style={{ color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
            >
              <Plus size={13} /> New profile
            </button>
          </>
        )}
        <button
          onClick={onToggleDeleted}
          className="flex items-center gap-1 rounded px-3 py-1.5 text-[12px] font-medium"
          style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
          title={viewDeleted ? "Back to the active profiles" : "Review deleted profiles and restore them"}
        >
          {viewDeleted ? <><RotateCcw size={13} /> Back to active</> : <><Archive size={13} /> Archive</>}
        </button>
      </div>

      {loading && list.length === 0 && (
        <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Loading…</p>
      )}
      {!loading && list.length === 0 && (
        <div className="rounded border p-6 text-center text-[12px]" style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-tertiary)" }}>
          {viewDeleted
            ? "No deleted profiles."
            : "No ICP profiles yet. Create one — or let the AI suggest a starting point from your product."}
        </div>
      )}

      <div className="space-y-2">
        {list.map((icp, index) => (
          <div
            key={icp.id}
            draggable={!viewDeleted}
            onDragStart={() => onDragIndex(index)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex === null || dragIndex === index) return;
              const next = [...list];
              const [moved] = next.splice(dragIndex, 1);
              next.splice(index, 0, moved);
              onDragIndex(index);
              onReorder(next);
            }}
            onDragEnd={() => onDragIndex(null)}
          >
            <Card>
              <CardBody>
                <div className="flex items-center justify-between gap-3">
                  {!viewDeleted && (
                    <span
                      className="flex shrink-0 cursor-grab items-center gap-1 text-[11px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                      title="Drag to reorder — the first matching profile owns the company"
                    >
                      <GripVertical size={13} /> {index + 1}
                    </span>
                  )}
                  <button
                    onClick={() => { if (!viewDeleted) onEdit(icp); }}
                    className="min-w-0 flex-1 text-left"
                    style={viewDeleted ? { cursor: "default" } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <Target size={13} style={{ color: "var(--color-accent)" }} />
                      <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{icp.name}</span>
                      <StatusBadge status={icp.status} />
                    </div>
                    {icp.description && (
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{icp.description}</p>
                    )}
                    <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                      {icp.criteriaCount} criteria · {icp.fitCount} companies fit
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {viewDeleted ? (
                      <button
                        onClick={() => onRestore(icp.id)}
                        className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium"
                        style={{ color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
                      >
                        <RotateCcw size={12} /> Restore
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onBuild(icp.id, icp.name)}
                          disabled={building[icp.id] !== undefined || icp.criteriaCount === 0}
                          title={icp.criteriaCount === 0 ? "Add criteria first" : "Source companies matching this profile"}
                          className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            color: building[icp.id] !== undefined ? "var(--color-text-tertiary)" : "#fff",
                            background: building[icp.id] !== undefined ? "var(--color-bg-card)" : "var(--color-accent)",
                            border: "1px solid var(--color-accent)",
                            opacity: icp.criteriaCount === 0 ? 0.5 : 1,
                            cursor: icp.criteriaCount === 0 ? "not-allowed" : "pointer",
                          }}
                        >
                          <Radar size={12} />
                          {building[icp.id] !== undefined ? `Sourcing… ${building[icp.id]}` : "Source companies"}
                        </button>
                        <button
                          onClick={() => onDelete(icp.id)}
                          aria-label="Delete profile"
                          className="rounded p-1.5"
                          style={{ color: "var(--color-text-tertiary)", border: "1px solid var(--color-border-default)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "active" ? "var(--color-success)" : status === "archived" ? "var(--color-text-tertiary)" : "var(--color-warning)";
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider" style={{ color, border: `1px solid ${color}` }}>
      {status}
    </span>
  );
}

/* ── AI candidates panel (R4.8) ─────────────────────────────────── */

function CandidatePanel({
  candidates, onClose, onReview,
}: {
  candidates: InferCandidate[];
  onClose: () => void;
  onReview: (c: InferCandidate) => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          AI suggestions — review before saving (nothing is created yet)
        </span>
        <button onClick={onClose} className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>Dismiss</button>
      </div>
      <div className="space-y-2">
        {candidates.map((c, i) => (
          <Card key={i}>
            <CardBody>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles size={12} style={{ color: "var(--color-accent)" }} />
                    <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                  </div>
                  {c.description && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{c.description}</p>
                  )}
                  <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                    {c.criteria.length} criteria
                    {!c.valid && c.validationError && (
                      <span style={{ color: "var(--color-error)" }}> · {c.validationError}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => onReview(c)}
                  disabled={!c.valid}
                  title={c.valid ? "Open in the editor as a draft" : c.validationError ?? "Invalid candidate"}
                  className="shrink-0 rounded px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    color: c.valid ? "#fff" : "var(--color-text-tertiary)",
                    background: c.valid ? "var(--color-accent)" : "var(--color-bg-card)",
                    border: "1px solid var(--color-border-default)",
                    cursor: c.valid ? "pointer" : "not-allowed",
                  }}
                >
                  Review in editor
                </button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── Editor ─────────────────────────────────────────────────────── */

function ProfileEditor({
  draft, catalog, saving, rescoring, diff, onChange, onSave, onBack,
}: {
  draft: Draft;
  catalog: CatalogField[];
  saving: boolean;
  rescoring: boolean;
  diff: RecomputeSummary | null;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const ui = draft.uiState;

  // R7.2 — the sourcing-side consequence: a live Apollo TAM estimate
  // for the current targeting. Fetched once when the editor opens
  // (estimates burn an Apollo call; the refresh button re-runs it).
  const [tamEstimate, setTamEstimate] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const estimate = useCallback(async (state: IcpUiState, sf: SourcingFilters) => {
    const hasTargeting =
      state.industries.length > 0 || state.geographies.length > 0 ||
      state.companySizes.length > 0 || state.keywords.length > 0;
    if (!hasTargeting) {
      setTamEstimate(null);
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch("/api/tam/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: state.industries,
          keywords: state.keywords,
          companySizes: state.companySizes,
          geographies: state.geographies,
          excludeGeographies: sf.excludeGeographies,
          technologies: state.technologies,
          hiringTitles: state.hiringTitles,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setTamEstimate(typeof data.total === "number" ? data.total : null);
    } catch {
      setTamEstimate(null);
    } finally {
      setEstimating(false);
    }
  }, []);
  useEffect(() => {
    if (draft.hasUiState) void estimate(draft.uiState, draft.sourcingFilters);
    // Once per editor open — refresh is manual (Apollo credits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);
  const setUi = (patch: Partial<IcpUiState>) =>
    onChange({ ...draft, uiState: { ...ui, ...patch } });
  const setImp = (section: ImportanceSection, v: Importance) =>
    setUi({ importance: { ...ui.importance, [section]: v } });
  const impOf = (section: ImportanceSection): Importance =>
    ui.importance[section] ?? DEFAULT_IMPORTANCE[section];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          <ArrowLeft size={13} /> Profiles
        </button>
        <div className="flex items-center gap-2">
          <StatusToggle
            status={draft.status}
            onChange={(s) => onChange({ ...draft, status: s })}
          />
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded px-3 py-1.5 text-[12px] font-medium"
            style={{ color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : draft.id ? "Save profile" : "Create profile"}
          </button>
        </div>
      </div>

      {(rescoring || diff) && (
        <div
          className="mb-4 rounded border px-3 py-2 text-[12px]"
          style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)", background: "var(--color-bg-card)" }}
        >
          {rescoring && <span>Profile saved — rescoring your companies…</span>}
          {diff && (
            <span>
              {diff.companies} companies rescored — <strong>{diff.regradedUp} up</strong>, {diff.regradedDown} down, {diff.unowned} match no profile.
            </span>
          )}
        </div>
      )}

      <Card>
        <CardBody>
          <div className="space-y-3">
            <Input
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="Profile name — e.g. Fondations romandes"
            />
            <Input
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              placeholder="Description (optional)"
            />

            {draft.hasUiState ? (
              <>
                <SectionTitle>Who they are</SectionTitle>
                <Row label="Industries" importance={impOf("industries")} onImportance={(v) => setImp("industries", v)}>
                  <CriterionList values={ui.industries} onChange={(v) => setUi({ industries: v })} options={INDUSTRIES} placeholder="Search industries…" />
                </Row>
                <Row label="Company size" importance={impOf("companySizes")} onImportance={(v) => setImp("companySizes", v)}>
                  <div className="flex flex-wrap gap-2">
                    {COMPANY_SIZES.map((size) => {
                      const selected = ui.companySizes.includes(size);
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            setUi({
                              companySizes: selected
                                ? ui.companySizes.filter((s) => s !== size)
                                : [...ui.companySizes, size],
                            })
                          }
                          className="rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
                          style={{
                            background: selected ? "var(--color-accent-soft)" : "var(--color-bg-card)",
                            color: selected ? "var(--color-accent)" : "var(--color-text-secondary)",
                            border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border-default)"}`,
                          }}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </Row>
                <Row label="Geographies" importance={impOf("geographies")} onImportance={(v) => setImp("geographies", v)}>
                  <CriterionList
                    values={ui.geographies}
                    onChange={(v) => setUi({ geographies: v })}
                    options={GEOGRAPHIES}
                    allowFreeText
                    placeholder="Search or type a region and press Enter — e.g. Vaud"
                  />
                </Row>
                <Row label={<>Exclude<SourcingOnlyHint /></>}>
                  <CriterionList
                    values={draft.sourcingFilters.excludeGeographies}
                    onChange={(v) => onChange({ ...draft, sourcingFilters: { ...draft.sourcingFilters, excludeGeographies: v } })}
                    options={GEOGRAPHIES}
                    allowFreeText
                    placeholder="Search or type a region to exclude…"
                  />
                </Row>
                <Row label="Annual revenue (USD)" importance={impOf("revenue")} onImportance={(v) => setImp("revenue", v)}>
                  <div className="flex items-center gap-2">
                    <AmountField value={ui.revenueMin} onChange={(v) => setUi({ revenueMin: v })} placeholder="$ Min" />
                    <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>to</span>
                    <AmountField value={ui.revenueMax} onChange={(v) => setUi({ revenueMax: v })} placeholder="$ Max" />
                  </div>
                </Row>

                <SectionTitle>What they use &amp; say</SectionTitle>
                <Row label="Technologies" importance={impOf("technologies")} onImportance={(v) => setImp("technologies", v)}>
                  <CriterionList values={ui.technologies} onChange={(v) => setUi({ technologies: v })} placeholder="Type a technology and press Enter — e.g. WordPress" />
                </Row>
                <Row label="Keywords" importance={impOf("keywords")} onImportance={(v) => setImp("keywords", v)}>
                  <CriterionList values={ui.keywords} onChange={(v) => setUi({ keywords: v })} placeholder="Type a keyword and press Enter — e.g. fondation" />
                </Row>
                <Row label={<>Recently funded<SourcingOnlyHint /></>}>
                  <select
                    value={draft.sourcingFilters.fundingRecencyDays === null ? "" : String(draft.sourcingFilters.fundingRecencyDays)}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        sourcingFilters: {
                          ...draft.sourcingFilters,
                          fundingRecencyDays: e.target.value ? Number(e.target.value) : null,
                        },
                      })
                    }
                    className="w-full rounded border p-2 text-[13px]"
                    style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)", color: "var(--color-text-primary)" }}
                  >
                    <option value="">Any time</option>
                    <option value="90">Last 90 days</option>
                    <option value="180">Last 6 months</option>
                    <option value="365">Last 12 months</option>
                  </select>
                </Row>
                <Row label="Total raised (USD)" importance={impOf("totalFunding")} onImportance={(v) => setImp("totalFunding", v)}>
                  <div className="flex items-center gap-2">
                    <AmountField value={ui.totalFundingMin} onChange={(v) => setUi({ totalFundingMin: v })} placeholder="$ Min" />
                    <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>to</span>
                    <AmountField value={ui.totalFundingMax} onChange={(v) => setUi({ totalFundingMax: v })} placeholder="$ Max" />
                  </div>
                </Row>
                <Row label="Hiring" importance={impOf("hiring")} onImportance={(v) => setImp("hiring", v)}>
                  <div className="space-y-2">
                    <AmountField value={ui.minJobOpenings} onChange={(v) => setUi({ minJobOpenings: v })} placeholder="Min active job postings — e.g. 1" />
                    <CriterionList values={ui.hiringTitles} onChange={(v) => setUi({ hiringTitles: v })} placeholder="Hiring for titles — type and press Enter" />
                  </div>
                </Row>

                <SectionTitle hint="Finds contacts at matching companies — does not score companies">
                  Who to talk to
                </SectionTitle>
                <Row label="Seniorities">
                  <CriterionList values={ui.seniorities} onChange={(v) => setUi({ seniorities: v })} options={JOB_SENIORITIES} placeholder="Search seniorities…" />
                </Row>
                <Row label="Titles">
                  <CriterionList values={ui.personTitles} onChange={(v) => setUi({ personTitles: v })} placeholder="Type a title and press Enter — e.g. CEO" />
                </Row>
              </>
            ) : (
              <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                This profile was created outside the editor — its criteria are listed under Advanced below. They keep working as-is; anything you add through widgets later will join them.
              </p>
            )}

            <AdvancedSection
              advanced={draft.advanced}
              catalog={catalog}
              alwaysOpen={!draft.hasUiState}
              onChange={(advanced) => onChange({ ...draft, advanced })}
            />

            <div
              className="flex items-center justify-end gap-3 border-t pt-3 text-[11px]"
              style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
            >
              {draft.fitCount !== null && (
                <span>{draft.fitCount} companies fit this profile at 50% or more</span>
              )}
              {draft.hasUiState && (
                <span className="flex items-center gap-1">
                  {estimating
                    ? "Estimating Apollo TAM…"
                    : tamEstimate !== null
                      ? `~${tamEstimate.toLocaleString()} in Apollo TAM`
                      : null}
                  <button
                    type="button"
                    onClick={() => estimate(draft.uiState, draft.sourcingFilters)}
                    disabled={estimating}
                    className="rounded border px-1.5 py-0.5 text-[10px]"
                    style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-tertiary)" }}
                    title="Re-estimate the Apollo TAM for the current targeting"
                  >
                    Estimate
                  </button>
                </span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="border-t pt-3 first:border-t-0" style={{ borderColor: "var(--color-border-default)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        {children}
      </span>
      {hint && (
        <span className="ml-2 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>— {hint}</span>
      )}
    </div>
  );
}

function Row({
  label, importance, onImportance, children,
}: {
  label: ReactNode;
  importance?: Importance;
  onImportance?: (v: Importance) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-44 shrink-0 pt-2 text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      {importance !== undefined && onImportance && (
        <div className="shrink-0 pt-1">
          <ImportanceSelect value={importance} onChange={onImportance} />
        </div>
      )}
    </div>
  );
}

function StatusToggle({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  if (status === "archived") {
    return (
      <button
        onClick={() => onChange("draft")}
        className="rounded px-2.5 py-1.5 text-[11px] font-medium"
        style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
        title="This profile is archived — click to bring it back as a draft"
      >
        Archived — restore to draft
      </button>
    );
  }
  return (
    <div className="flex overflow-hidden rounded border" style={{ borderColor: "var(--color-border-default)" }}>
      {(["draft", "active"] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className="px-2.5 py-1.5 text-[11px] font-medium capitalize"
          style={{
            background: status === s ? "var(--color-accent-soft)" : "var(--color-bg-card)",
            color: status === s ? "var(--color-accent)" : "var(--color-text-tertiary)",
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/* ── Advanced criteria (R4.6) — every value is a tag list, never
      comma-separated text (R4.3b) ─────────────────────────────────── */

function defaultValueFor(operator: string): unknown {
  if (operator === "in") return [];
  if (operator === "between") return { min: 0, max: null };
  if (operator === "exists") return true;
  return "";
}

function AdvancedSection({
  advanced, catalog, alwaysOpen, onChange,
}: {
  advanced: AdvancedCriterion[];
  catalog: CatalogField[];
  alwaysOpen: boolean;
  onChange: (next: AdvancedCriterion[]) => void;
}) {
  const [open, setOpen] = useState(alwaysOpen || advanced.length > 0);

  function add() {
    const first = catalog[0];
    if (!first) return;
    onChange([
      ...advanced,
      { fieldKey: first.fieldKey, operator: first.operators[0], value: defaultValueFor(first.operators[0]), weight: 1, isRequired: false },
    ]);
    setOpen(true);
  }
  function update(i: number, patch: Partial<AdvancedCriterion>) {
    onChange(advanced.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    onChange(advanced.filter((_, idx) => idx !== i));
  }

  const impOf = (c: AdvancedCriterion): Importance =>
    c.isRequired ? "must" : c.weight >= 2 ? "important" : "nice";
  const applyImp = (i: number, v: Importance) =>
    update(i, v === "must" ? { isRequired: true, weight: 1 } : { isRequired: false, weight: v === "important" ? 3 : 1 });

  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--color-border-default)" }}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-[12px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Advanced criteria{advanced.length > 0 ? ` (${advanced.length})` : ""}
        </button>
        <button onClick={add} className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-accent)" }}>
          <Plus size={11} /> Add criterion
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {advanced.length === 0 && (
            <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              For anything the sections above cannot express — custom properties, signals, funding stages…
            </p>
          )}
          {advanced.map((c, i) => {
            const field = catalog.find((f) => f.fieldKey === c.fieldKey);
            return (
              <div key={i} className="flex flex-wrap items-start gap-2 rounded border p-2" style={{ borderColor: "var(--color-border-default)" }}>
                <select
                  value={c.fieldKey}
                  onChange={(e) => {
                    const f = catalog.find((x) => x.fieldKey === e.target.value);
                    update(i, { fieldKey: e.target.value, operator: f?.operators[0] ?? "in", value: defaultValueFor(f?.operators[0] ?? "in") });
                  }}
                  className="rounded border p-1 text-[11px]"
                  style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}
                >
                  {catalog.map((f) => (
                    <option key={f.fieldKey} value={f.fieldKey}>{f.label}</option>
                  ))}
                </select>
                <select
                  value={c.operator}
                  onChange={(e) => update(i, { operator: e.target.value, value: defaultValueFor(e.target.value) })}
                  className="rounded border p-1 text-[11px]"
                  style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}
                >
                  {(field?.operators ?? ["in"]).map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                <div className="min-w-[220px] flex-1">
                  <AdvancedValue operator={c.operator} value={c.value} onChange={(v) => update(i, { value: v })} />
                </div>
                <ImportanceSelect value={impOf(c)} onChange={(v) => applyImp(i, v)} />
                <button onClick={() => remove(i)} aria-label="Remove criterion" className="pt-1.5" style={{ color: "var(--color-text-tertiary)" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdvancedValue({
  operator, value, onChange,
}: {
  operator: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (operator === "between") {
    const v = (value as { min?: number | null; max?: number | null }) ?? {};
    return (
      <div className="flex items-center gap-2">
        <AmountField value={v.min ?? null} onChange={(n) => onChange({ ...v, min: n })} placeholder="Min" />
        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>to</span>
        <AmountField value={v.max ?? null} onChange={(n) => onChange({ ...v, max: n })} placeholder="Max" />
      </div>
    );
  }
  if (operator === "exists") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "true")}
        className="rounded border p-1 text-[11px]"
        style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}
      >
        <option value="true">present</option>
        <option value="false">absent</option>
      </select>
    );
  }
  if (operator === "in") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    // R4.3b: a tag list — never comma-separated text.
    return (
      <CriterionList values={arr} onChange={(v) => onChange(v)} placeholder="Type a value and press Enter" />
    );
  }
  if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") {
    return (
      <AmountField
        value={typeof value === "number" ? value : null}
        onChange={(n) => onChange(n)}
        placeholder="Value"
      />
    );
  }
  // eq / contains — single text value
  return (
    <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="Value" />
  );
}
