"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Play, Pause } from "lucide-react";

interface WorkflowDef {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: string;
    conditions?: Record<string, string>;
  };
  actions: Array<{
    type: string;
    params: Record<string, string>;
  }>;
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
}

const TRIGGER_TYPES = [
  { value: "deal_stage_changed", label: "Deal stage changed" },
  { value: "contact_created", label: "New contact created" },
  { value: "email_received", label: "Email received" },
  { value: "task_due", label: "Task due" },
];

const ACTION_TYPES = [
  { value: "send_notification", label: "Send notification" },
  { value: "create_task", label: "Create task" },
  { value: "call_webhook", label: "Call webhook" },
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: "",
    triggerType: "deal_stage_changed",
    conditionKey: "",
    conditionValue: "",
    actionType: "send_notification",
    actionTitle: "",
    actionBody: "",
    actionUrl: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/workflows")
      .then((r) => r.ok ? r.json() : { workflows: [] })
      .then((data) => setWorkflows(data.workflows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveWorkflows(updated: WorkflowDef[]) {
    setSaving(true);
    try {
      await fetch("/api/settings/workflows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflows: updated }),
      });
    } catch { /* */ }
    setSaving(false);
  }

  function createWorkflow() {
    if (!newWorkflow.name.trim()) return;
    const wf: WorkflowDef = {
      id: crypto.randomUUID(),
      name: newWorkflow.name.trim(),
      enabled: true,
      trigger: {
        type: newWorkflow.triggerType,
        ...(newWorkflow.conditionKey && newWorkflow.conditionValue
          ? { conditions: { [newWorkflow.conditionKey]: newWorkflow.conditionValue } }
          : {}),
      },
      actions: [{
        type: newWorkflow.actionType,
        params: {
          ...(newWorkflow.actionTitle ? { title: newWorkflow.actionTitle } : {}),
          ...(newWorkflow.actionBody ? { body: newWorkflow.actionBody } : {}),
          ...(newWorkflow.actionUrl ? { url: newWorkflow.actionUrl } : {}),
        },
      }],
      createdAt: new Date().toISOString(),
      runCount: 0,
    };
    const updated = [...workflows, wf];
    setWorkflows(updated);
    saveWorkflows(updated);
    setShowCreate(false);
    setNewWorkflow({ name: "", triggerType: "deal_stage_changed", conditionKey: "", conditionValue: "", actionType: "send_notification", actionTitle: "", actionBody: "", actionUrl: "" });
  }

  function toggleWorkflow(id: string) {
    const updated = workflows.map((w) => w.id === id ? { ...w, enabled: !w.enabled } : w);
    setWorkflows(updated);
    saveWorkflows(updated);
  }

  function deleteWorkflow(id: string) {
    const updated = workflows.filter((w) => w.id !== id);
    setWorkflows(updated);
    saveWorkflows(updated);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
            Workflows
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            Automate actions when events happen in your CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}>
            Beta
          </span>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
            style={{ background: "var(--color-accent)" }}>
            <Plus size={13} /> Create workflow
          </button>
        </div>
      </div>

      {/* Create workflow form */}
      {showCreate && (
        <div className="mt-4 rounded-lg p-4 space-y-3" style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-accent)" }}>
          <div>
            <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Name</label>
            <input value={newWorkflow.name} onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
              placeholder="e.g. Notify on deal progression"
              className="mt-1 h-8 w-full rounded-md px-3 text-[13px] outline-none"
              style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>When</label>
              <select value={newWorkflow.triggerType} onChange={(e) => setNewWorkflow({ ...newWorkflow, triggerType: e.target.value })}
                className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }}>
                {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Then</label>
              <select value={newWorkflow.actionType} onChange={(e) => setNewWorkflow({ ...newWorkflow, actionType: e.target.value })}
                className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }}>
                {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          {newWorkflow.triggerType === "deal_stage_changed" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Condition: field</label>
                <input value={newWorkflow.conditionKey} onChange={(e) => setNewWorkflow({ ...newWorkflow, conditionKey: e.target.value })}
                  placeholder="e.g. newStage" className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                  style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }} />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>equals</label>
                <input value={newWorkflow.conditionValue} onChange={(e) => setNewWorkflow({ ...newWorkflow, conditionValue: e.target.value })}
                  placeholder="e.g. proposal" className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                  style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }} />
              </div>
            </div>
          )}
          {newWorkflow.actionType === "send_notification" && (
            <div>
              <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Notification message</label>
              <input value={newWorkflow.actionTitle} onChange={(e) => setNewWorkflow({ ...newWorkflow, actionTitle: e.target.value })}
                placeholder="e.g. Deal moved to proposal stage!" className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }} />
            </div>
          )}
          {newWorkflow.actionType === "call_webhook" && (
            <div>
              <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Webhook URL</label>
              <input value={newWorkflow.actionUrl} onChange={(e) => setNewWorkflow({ ...newWorkflow, actionUrl: e.target.value })}
                placeholder="https://..." className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                style={{ background: "var(--color-bg-muted)", border: "0.5px solid var(--color-border-moderate)", color: "var(--color-text-primary)" }} />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={createWorkflow} disabled={!newWorkflow.name.trim() || saving}
              className="rounded-md px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
              style={{ background: "var(--color-accent)" }}>
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-md px-4 py-1.5 text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Workflows list */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg" style={{ background: "var(--color-bg-muted)" }} />)}
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-lg py-12 text-center" style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
            <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>No workflows yet.</p>
            <button onClick={() => setShowCreate(true)} className="mt-2 text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
              + Create your first workflow
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.map((wf) => (
              <div key={wf.id} className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)", opacity: wf.enabled ? 1 : 0.5 }}>
                <button onClick={() => toggleWorkflow(wf.id)} className="flex h-7 w-7 items-center justify-center rounded-md"
                  style={{ color: wf.enabled ? "var(--color-success)" : "var(--color-text-muted)" }}>
                  {wf.enabled ? <Play size={14} /> : <Pause size={14} />}
                </button>
                <div className="flex-1">
                  <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{wf.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    When {TRIGGER_TYPES.find((t) => t.value === wf.trigger.type)?.label || wf.trigger.type}
                    {wf.trigger.conditions && Object.entries(wf.trigger.conditions).map(([k, v]) => ` (${k} = ${v})`)}
                    {" → "}
                    {wf.actions.map((a) => ACTION_TYPES.find((at) => at.value === a.type)?.label || a.type).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {wf.runCount} run{wf.runCount !== 1 ? "s" : ""}
                  </p>
                  {wf.lastRunAt && (
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      Last: {new Date(wf.lastRunAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button onClick={() => deleteWorkflow(wf.id)} className="flex h-7 w-7 items-center justify-center rounded-md"
                  style={{ color: "var(--color-text-muted)" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
