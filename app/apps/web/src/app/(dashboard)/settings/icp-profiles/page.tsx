"use client";

/**
 * /settings/icp-profiles — multi-ICP rule-builder (P2, _specs/multi-icp).
 *
 * Lists the tenant's ICPs and lets an admin create / edit / delete
 * them with a composable criteria builder over the field catalog
 * (/api/icp-catalog). Each criterion is field → operator (filtered to
 * what the field allows) → value (widget adapts to the field's
 * value_type). Saving POSTs/PATCHes /api/icps which re-validates and
 * triggers the matrix recompute.
 *
 * The legacy single-ICP page at /settings/icp stays for now (it drives
 * the retro-compat "Default" ICP); this is the new multi-profile home.
 */

import { useCallback, useEffect, useState } from "react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Plus, Trash2, Target, Radar, Archive, RotateCcw } from "lucide-react";

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

type DraftCriterion = {
  fieldKey: string;
  operator: string;
  value: unknown;
  weight: number;
  isRequired: boolean;
};

type DraftIcp = {
  id: string | null;
  name: string;
  description: string;
  status: string;
  priority: number;
  criteria: DraftCriterion[];
};

const EMPTY_DRAFT: DraftIcp = {
  id: null,
  name: "",
  description: "",
  status: "draft",
  priority: 100,
  criteria: [],
};

export default function IcpProfilesPage() {
  const { toast } = useToast();
  const [list, setList] = useState<IcpListItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogField[]>([]);
  const [draft, setDraft] = useState<DraftIcp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Build TAM per ICP: maps icpId → live inserted count while streaming.
  const [building, setBuilding] = useState<Record<string, number>>({});
  // Archive view: true = show only soft-deleted ICPs so an admin can review
  // and restore them (parity with the Accounts/Contacts archive).
  const [viewDeleted, setViewDeleted] = useState(false);

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
          setBuilding((b) => {
            const next = { ...b };
            delete next[icpId];
            return next;
          });
          return;
        }
        // Parse the NDJSON stream for a live inserted count.
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
              // partial / non-JSON line — ignore
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
    [toast],
  );

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
      toast("Failed to load ICPs", "error");
    } finally {
      setLoading(false);
    }
  }, [toast, viewDeleted]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openEdit(id: string) {
    const res = await fetch(`/api/icps/${id}`);
    if (!res.ok) {
      toast("Failed to load ICP", "error");
      return;
    }
    const data = await res.json();
    setDraft({
      id: data.icp.id,
      name: data.icp.name,
      description: data.icp.description ?? "",
      status: data.icp.status,
      priority: data.icp.priority,
      criteria: (data.criteria ?? []).map(
        (c: { fieldKey: string; operator: string; value: unknown; weight: number; isRequired: boolean }) => ({
          fieldKey: c.fieldKey,
          operator: c.operator,
          value: c.value,
          weight: c.weight,
          isRequired: c.isRequired,
        }),
      ),
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast("Name is required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description || null,
        status: draft.status,
        priority: draft.priority,
        criteria: draft.criteria,
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
      toast(draft.id ? "ICP updated." : "ICP created.", "success");
      setDraft(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setSaving(false);
    }
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
    toast("ICP restored — rescoring companies.", "success");
    refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/icps/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "Delete failed", "error");
      return;
    }
    toast("ICP deleted.", "success");
    refresh();
  }

  return (
    <div>
      <SettingsHeader
        title="ICP profiles"
        subtitle="Define one or more Ideal Customer Profiles. Each scores companies independently — a company can fit one profile and not another."
      />
      <div>
        {!draft && (
          <>
            <div className="mb-4 flex justify-end gap-2">
              {!viewDeleted && (
                <button
                  onClick={() => setDraft({ ...EMPTY_DRAFT })}
                  className="flex items-center gap-1 rounded px-3 py-1.5 text-[12px] font-medium"
                  style={{ color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
                >
                  <Plus size={13} /> New ICP
                </button>
              )}
              <button
                onClick={() => setViewDeleted((v) => !v)}
                className="flex items-center gap-1 rounded px-3 py-1.5 text-[12px] font-medium"
                style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
                title={viewDeleted ? "Back to the active ICPs" : "Review deleted ICPs and restore them"}
              >
                {viewDeleted ? <><RotateCcw size={13} /> Back to active</> : <><Archive size={13} /> Archive</>}
              </button>
            </div>
            {loading && list.length === 0 && (
              <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Loading…</p>
            )}
            {!loading && list.length === 0 && (
              <div className="rounded border p-6 text-center text-[12px]" style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-tertiary)" }}>
                {viewDeleted ? "No deleted ICPs." : "No ICP profiles yet. Create one to start scoring companies against it."}
              </div>
            )}
            <div className="space-y-2">
              {list.map((icp) => (
                <Card key={icp.id}>
                  <CardBody>
                    <div className="flex items-center justify-between gap-3">
                      <button onClick={() => { if (!viewDeleted) openEdit(icp.id); }} className="min-w-0 flex-1 text-left" style={viewDeleted ? { cursor: "default" } : undefined}>
                        <div className="flex items-center gap-2">
                          <Target size={13} style={{ color: "var(--color-accent)" }} />
                          <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{icp.name}</span>
                          <StatusBadge status={icp.status} />
                          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>priority {icp.priority}</span>
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
                            onClick={() => restore(icp.id)}
                            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium"
                            style={{ color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => buildTam(icp.id, icp.name)}
                              disabled={building[icp.id] !== undefined || icp.criteriaCount === 0}
                              title={icp.criteriaCount === 0 ? "Add criteria first" : "Source the TAM for this ICP via Apollo"}
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
                              {building[icp.id] !== undefined ? `Sourcing… ${building[icp.id]}` : "Build TAM"}
                            </button>
                            <button onClick={() => remove(icp.id)} aria-label="Delete ICP" className="rounded p-1.5" style={{ color: "var(--color-text-tertiary)", border: "1px solid var(--color-border-default)" }}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </>
        )}

        {draft && (
          <IcpEditor
            draft={draft}
            catalog={catalog}
            saving={saving}
            onChange={setDraft}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        )}
      </div>
    </div>
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

function IcpEditor({
  draft,
  catalog,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: DraftIcp;
  catalog: CatalogField[];
  saving: boolean;
  onChange: (d: DraftIcp) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function addCriterion() {
    const first = catalog[0];
    if (!first) return;
    onChange({
      ...draft,
      criteria: [
        ...draft.criteria,
        { fieldKey: first.fieldKey, operator: first.operators[0], value: defaultValue(first.operators[0]), weight: 1, isRequired: false },
      ],
    });
  }
  function updateCriterion(i: number, patch: Partial<DraftCriterion>) {
    onChange({
      ...draft,
      criteria: draft.criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    });
  }
  function removeCriterion(i: number) {
    onChange({ ...draft, criteria: draft.criteria.filter((_, idx) => idx !== i) });
  }

  return (
    <Card>
      <CardBody>
        <div className="space-y-3">
          <input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="ICP name (e.g. SaaS scale-up)"
            className="w-full rounded border p-2 text-[14px] font-semibold"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)", color: "var(--color-text-primary)" }}
          />
          <input
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full rounded border p-2 text-[12px]"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)", color: "var(--color-text-primary)" }}
          />
          <div className="flex gap-3">
            <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              Status{" "}
              <select value={draft.status} onChange={(e) => onChange({ ...draft, status: e.target.value })} className="rounded border p-1" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}>
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              Priority{" "}
              <input type="number" min={0} value={draft.priority} onChange={(e) => onChange({ ...draft, priority: Number(e.target.value) })} className="w-16 rounded border p-1" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }} />
            </label>
          </div>

          <div className="border-t pt-3" style={{ borderColor: "var(--color-border-default)" }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Criteria (matched with AND)</span>
              <button onClick={addCriterion} className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-accent)" }}>
                <Plus size={11} /> Add criterion
              </button>
            </div>
            <div className="space-y-2">
              {draft.criteria.map((c, i) => {
                const field = catalog.find((f) => f.fieldKey === c.fieldKey);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded border p-2" style={{ borderColor: "var(--color-border-default)" }}>
                    <select
                      value={c.fieldKey}
                      onChange={(e) => {
                        const f = catalog.find((x) => x.fieldKey === e.target.value);
                        updateCriterion(i, { fieldKey: e.target.value, operator: f?.operators[0] ?? "in", value: defaultValue(f?.operators[0] ?? "in") });
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
                      onChange={(e) => updateCriterion(i, { operator: e.target.value, value: defaultValue(e.target.value) })}
                      className="rounded border p-1 text-[11px]"
                      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}
                    >
                      {(field?.operators ?? ["in"]).map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                    <ValueInput operator={c.operator} value={c.value} onChange={(v) => updateCriterion(i, { value: v })} />
                    <label className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                      <input type="checkbox" checked={c.isRequired} onChange={(e) => updateCriterion(i, { isRequired: e.target.checked })} /> required
                    </label>
                    <label className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                      w<input type="number" min={0} step={1} value={c.weight} onChange={(e) => updateCriterion(i, { weight: Number(e.target.value) })} className="w-10 rounded border p-0.5" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }} />
                    </label>
                    <button onClick={() => removeCriterion(i)} aria-label="Remove criterion" className="ml-auto" style={{ color: "var(--color-text-tertiary)" }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
              {draft.criteria.length === 0 && (
                <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>No criteria yet — an ICP with no criteria matches nothing. Add at least one.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--color-border-default)" }}>
            <button onClick={onCancel} disabled={saving} className="rounded px-3 py-1.5 text-[12px]" style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}>Cancel</button>
            <button onClick={onSave} disabled={saving} className="rounded px-3 py-1.5 text-[12px] font-medium" style={{ color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create ICP"}
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function defaultValue(operator: string): unknown {
  if (operator === "in") return [];
  if (operator === "between") return { min: 0, max: null };
  if (operator === "exists") return true;
  return "";
}

function ValueInput({ operator, value, onChange }: { operator: string; value: unknown; onChange: (v: unknown) => void }) {
  if (operator === "between") {
    const v = (value as { min?: number; max?: number | null }) ?? {};
    return (
      <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        <input type="number" placeholder="min" value={v.min ?? ""} onChange={(e) => onChange({ ...v, min: e.target.value === "" ? null : Number(e.target.value) })} className="w-16 rounded border p-1" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }} />
        –
        <input type="number" placeholder="max" value={v.max ?? ""} onChange={(e) => onChange({ ...v, max: e.target.value === "" ? null : Number(e.target.value) })} className="w-16 rounded border p-1" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }} />
      </span>
    );
  }
  if (operator === "exists") {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value === "true")} className="rounded border p-1 text-[11px]" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}>
        <option value="true">present</option>
        <option value="false">absent</option>
      </select>
    );
  }
  if (operator === "in") {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    return (
      <input
        value={arr.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder="comma, separated, values"
        className="min-w-[180px] flex-1 rounded border p-1 text-[11px]"
        style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}
      />
    );
  }
  // eq / gt / gte / lt / lte / contains — single value
  return (
    <input
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className="min-w-[120px] rounded border p-1 text-[11px]"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-default)" }}
    />
  );
}
