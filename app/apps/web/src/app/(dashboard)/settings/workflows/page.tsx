"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Play, Pause, ChevronUp, ChevronDown, Pencil, Sparkles, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

interface ActionDraft {
  id: string;
  type: string;
  params: Record<string, string>;
}

interface WorkflowDef {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; conditions?: Record<string, string> };
  actions: Array<{ type: string; params: Record<string, string> }>;
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
}

interface Draft {
  id?: string;
  name: string;
  triggerType: string;
  conditionKey: string;
  conditionValue: string;
  actions: ActionDraft[];
}

const TRIGGER_TYPES = [
  { value: "deal_stage_changed", label: "Deal stage changed" },
  { value: "deal_won", label: "Deal won" },
  { value: "deal_lost", label: "Deal lost" },
  { value: "contact_created", label: "New contact created" },
  { value: "account_created", label: "New account created" },
  { value: "email_received", label: "Email received" },
  { value: "task_due", label: "Task due" },
  { value: "score_changed", label: "Score changed" },
  { value: "enrichment_completed", label: "Enrichment completed" },
  { value: "sequence_reply_received", label: "Sequence reply received" },
  { value: "meeting_completed", label: "Meeting completed" },
] as const;

const ACTION_TYPES = [
  { value: "send_notification", label: "Send notification" },
  { value: "create_task", label: "Create task" },
  { value: "send_email", label: "Send email" },
  { value: "enroll_sequence", label: "Enroll in sequence" },
  { value: "assign_owner", label: "Assign owner" },
  { value: "add_tag", label: "Add tag" },
  { value: "update_field", label: "Update field" },
  { value: "call_webhook", label: "Call webhook" },
  { value: "ai_action", label: "AI action" },
] as const;

const TRIGGERS_WITH_CONDITION = new Set([
  "deal_stage_changed",
  "score_changed",
  "enrichment_completed",
  "sequence_reply_received",
]);

function emptyDraft(): Draft {
  return {
    name: "",
    triggerType: "deal_stage_changed",
    conditionKey: "",
    conditionValue: "",
    actions: [{ id: crypto.randomUUID(), type: "send_notification", params: {} }],
  };
}

function workflowToDraft(wf: WorkflowDef): Draft {
  const conditions = wf.trigger.conditions || {};
  const condKeys = Object.keys(conditions);
  return {
    id: wf.id,
    name: wf.name,
    triggerType: wf.trigger.type,
    conditionKey: condKeys[0] || "",
    conditionValue: condKeys[0] ? conditions[condKeys[0]] : "",
    actions: wf.actions.map((a) => ({
      id: crypto.randomUUID(),
      type: a.type,
      params: { ...a.params },
    })),
  };
}

function draftToWorkflow(draft: Draft, existing?: WorkflowDef): WorkflowDef {
  const id = draft.id || existing?.id || crypto.randomUUID();
  const conditions =
    draft.conditionKey && draft.conditionValue
      ? { [draft.conditionKey]: draft.conditionValue }
      : undefined;
  return {
    id,
    name: draft.name.trim(),
    enabled: existing?.enabled ?? true,
    trigger: {
      type: draft.triggerType,
      ...(conditions ? { conditions } : {}),
    },
    actions: draft.actions.map((a) => ({ type: a.type, params: a.params })),
    createdAt: existing?.createdAt || new Date().toISOString(),
    lastRunAt: existing?.lastRunAt,
    runCount: existing?.runCount ?? 0,
  };
}

interface NlParsedResult {
  name: string;
  trigger: { type: string; conditions?: Record<string, string> };
  actions: Array<{ type: string; params: Record<string, string> }>;
}

const NL_EXAMPLES = [
  "Every time a deal reaches proposal stage, create a task to send a case study within 2 days",
  "When a new contact is created, send a welcome notification and assign to the sales team",
  "When a deal is won, send a congratulations notification and create an onboarding task",
  "If an email is received, create a follow-up task and send a notification",
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // NL Builder state
  const [showNlModal, setShowNlModal] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [nlResult, setNlResult] = useState<NlParsedResult | null>(null);
  const [nlError, setNlError] = useState("");
  const [nlConfirming, setNlConfirming] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/workflows")
      // Was `r.ok ? r.json() : { workflows: [] }` — a 500 silently became an
      // empty list. Reject so the error banner shows instead of "no workflows".
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load workflows"))))
      .then((data) => setWorkflows(data.workflows || []))
      .catch(() => setError("Failed to load workflows"))
      .finally(() => setLoading(false));
  }, []);

  async function persist(updated: WorkflowDef[]): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/workflows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflows: updated }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workflow changes");
      // The editor (saveDraft) keeps local state so the user can retry; the
      // one-click toggle/delete callers revert on a false return so the row
      // doesn't show a state that never persisted.
      return false;
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    setDraft(emptyDraft());
    setShowEditor(true);
    setError("");
  }

  function startEdit(wf: WorkflowDef) {
    setDraft(workflowToDraft(wf));
    setShowEditor(true);
    setError("");
  }

  function cancelEditor() {
    setShowEditor(false);
    setDraft(emptyDraft());
    setError("");
  }

  function addAction() {
    if (draft.actions.length >= 20) {
      setError("Maximum 20 actions per workflow");
      return;
    }
    setDraft({
      ...draft,
      actions: [
        ...draft.actions,
        { id: crypto.randomUUID(), type: "send_notification", params: {} },
      ],
    });
  }

  function removeAction(id: string) {
    if (draft.actions.length <= 1) {
      setError("At least 1 action is required");
      return;
    }
    setDraft({ ...draft, actions: draft.actions.filter((a) => a.id !== id) });
  }

  function moveAction(id: string, direction: -1 | 1) {
    const idx = draft.actions.findIndex((a) => a.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= draft.actions.length) return;
    const next = [...draft.actions];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft({ ...draft, actions: next });
  }

  function updateAction(id: string, patch: Partial<Pick<ActionDraft, "type" | "params">>) {
    setDraft({
      ...draft,
      actions: draft.actions.map((a) =>
        a.id === id
          ? {
              ...a,
              ...(patch.type !== undefined ? { type: patch.type, params: {} } : {}),
              ...(patch.params !== undefined ? { params: patch.params } : {}),
            }
          : a,
      ),
    });
  }

  async function saveDraft() {
    if (!draft.name.trim()) {
      setError("Name is required");
      return;
    }
    if (draft.actions.length < 1) {
      setError("At least 1 action is required");
      return;
    }
    const existing = draft.id ? workflows.find((w) => w.id === draft.id) : undefined;
    const wf = draftToWorkflow(draft, existing);
    const updated = existing
      ? workflows.map((w) => (w.id === wf.id ? wf : w))
      : [...workflows, wf];
    setWorkflows(updated);
    await persist(updated);
    setShowEditor(false);
    setDraft(emptyDraft());
  }

  async function toggleWorkflow(id: string) {
    const previous = workflows;
    const updated = workflows.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w));
    setWorkflows(updated);
    const ok = await persist(updated);
    // Was fire-and-forget: a failed save left the toggle visually flipped even
    // though it never persisted (silent stale divergence). Revert on failure.
    if (!ok) setWorkflows(previous);
  }

  async function deleteWorkflow(id: string) {
    const previous = workflows;
    const updated = workflows.filter((w) => w.id !== id);
    setWorkflows(updated);
    const ok = await persist(updated);
    if (!ok) setWorkflows(previous);
  }

  async function parseNl() {
    if (!nlInput.trim()) { setNlError("Describe your workflow first"); return; }
    setNlParsing(true);
    setNlError("");
    setNlResult(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Parse this workflow description into a structured workflow definition. Return ONLY valid JSON with this exact shape: { "name": "short name", "trigger": { "type": "one of: deal_stage_changed, deal_won, deal_lost, contact_created, account_created, email_received, task_due, score_changed, enrichment_completed, sequence_reply_received, meeting_completed", "conditions": {} }, "actions": [{ "type": "one of: send_notification, create_task, send_email, enroll_sequence, assign_owner, add_tag, update_field, call_webhook, ai_action", "params": {} }] }. Description: "${nlInput}"`,
          }],
        }),
      });
      if (!res.ok) throw new Error("Parse failed");
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || data.content || data.text || "";
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as NlParsedResult;
        setNlResult(parsed);
      } else {
        // Was a silent fallback to a canned send_notification workflow, so the
        // user believed their description was parsed when the model returned
        // nothing usable. Surface it instead.
        setNlError("Couldn't turn that into a workflow. Try rephrasing, or build it manually below.");
      }
    } catch {
      setNlError("Couldn't reach the workflow parser. Try again, or build it manually below.");
    } finally {
      setNlParsing(false);
    }
  }

  async function confirmNlWorkflow() {
    if (!nlResult) return;
    setNlConfirming(true);
    const wf: WorkflowDef = {
      id: crypto.randomUUID(),
      name: nlResult.name,
      enabled: true,
      trigger: nlResult.trigger,
      actions: nlResult.actions,
      createdAt: new Date().toISOString(),
      runCount: 0,
    };
    const updated = [...workflows, wf];
    setWorkflows(updated);
    await persist(updated);
    setShowNlModal(false);
    setNlInput("");
    setNlResult(null);
    setNlConfirming(false);
  }

  function cancelNlModal() {
    setShowNlModal(false);
    setNlInput("");
    setNlResult(null);
    setNlError("");
  }

  function confirmDelete(id: string) {
    setDeleteConfirmId(id);
  }

  function executeDelete() {
    if (!deleteConfirmId) return;
    deleteWorkflow(deleteConfirmId);
    setDeleteConfirmId(null);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-[24px] font-semibold"
            style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
          >
            Workflows
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            Automate one or more actions when an event happens in your CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="warning" size="md">Beta</Badge>
          <Button
            variant="outline"
            size="sm"
            icon={<Sparkles size={13} />}
            onClick={() => setShowNlModal(true)}
            disabled={showEditor}
          >
            Build with AI
          </Button>
          <Button
            variant="gradient"
            size="sm"
            icon={<Plus size={13} />}
            onClick={startCreate}
            disabled={showEditor}
          >
            Create workflow
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-error)" }}>
          {error}
        </p>
      )}

      {showEditor && (
        <Card className="mt-4" style={{ border: "1px solid var(--color-accent)" }}>
          <CardBody>
            <div className="space-y-3">
              <Input
                label="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Notify on deal progression"
              />
              <div>
                <label
                  className="text-[11px] font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  When
                </label>
                <select
                  value={draft.triggerType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      triggerType: e.target.value,
                      conditionKey: "",
                      conditionValue: "",
                    })
                  }
                  className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                  style={{
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border-default)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {TRIGGERS_WITH_CONDITION.has(draft.triggerType) && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      label="Condition: field"
                      value={draft.conditionKey}
                      onChange={(e) => setDraft({ ...draft, conditionKey: e.target.value })}
                      placeholder={
                        draft.triggerType === "score_changed"
                          ? "e.g. scoreDirection"
                          : draft.triggerType === "deal_stage_changed"
                            ? "e.g. newStage"
                            : "e.g. field name"
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="equals"
                      value={draft.conditionValue}
                      onChange={(e) => setDraft({ ...draft, conditionValue: e.target.value })}
                      placeholder={
                        draft.triggerType === "score_changed"
                          ? "e.g. increased"
                          : draft.triggerType === "deal_stage_changed"
                            ? "e.g. proposal"
                            : "e.g. value"
                      }
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label
                    className="text-[11px] font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Then run these actions ({draft.actions.length})
                  </label>
                  <button
                    type="button"
                    onClick={addAction}
                    className="text-[11px] font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    + Add action
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {draft.actions.map((action, i) => (
                    <div
                      key={action.id}
                      className="rounded-md p-2"
                      style={{ background: "var(--color-bg-hover)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          #{i + 1}
                        </span>
                        <select
                          value={action.type}
                          onChange={(e) => updateAction(action.id, { type: e.target.value })}
                          className="h-7 flex-1 rounded-md px-2 text-[12px] outline-none"
                          style={{
                            background: "var(--color-bg-card)",
                            border: "1px solid var(--color-border-default)",
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {ACTION_TYPES.map((a) => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="icon"
                          size="sm"
                          onClick={() => moveAction(action.id, -1)}
                          disabled={i === 0}
                        >
                          <ChevronUp size={13} />
                        </Button>
                        <Button
                          variant="icon"
                          size="sm"
                          onClick={() => moveAction(action.id, 1)}
                          disabled={i === draft.actions.length - 1}
                        >
                          <ChevronDown size={13} />
                        </Button>
                        <Button
                          variant="icon"
                          size="sm"
                          onClick={() => removeAction(action.id)}
                          disabled={draft.actions.length <= 1}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                      <div className="mt-2">
                        <ActionParams
                          action={action}
                          onChange={(params) => updateAction(action.id, { params })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={saveDraft}
                  disabled={!draft.name.trim() || saving}
                >
                  {draft.id ? "Save changes" : "Create"}
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEditor}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg"
                style={{ background: "var(--color-bg-hover)" }}
              />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <Card>
            <div className="py-12 text-center">
              <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                No workflows yet.
              </p>
              <button
                onClick={startCreate}
                className="mt-2 text-[12px] font-medium"
                style={{ color: "var(--color-accent)" }}
              >
                + Create your first workflow
              </button>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {workflows.map((wf) => {
              const triggerLabel =
                TRIGGER_TYPES.find((t) => t.value === wf.trigger.type)?.label || wf.trigger.type;
              const conditionStr = wf.trigger.conditions
                ? Object.entries(wf.trigger.conditions)
                    .map(([k, v]) => ` (${k} = ${v})`)
                    .join("")
                : "";
              const actionChain = wf.actions
                .map((a) => ACTION_TYPES.find((at) => at.value === a.type)?.label || a.type)
                .join(" → ");
              return (
                <Card key={wf.id} style={{ opacity: wf.enabled ? 1 : 0.65 }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Button
                      variant="icon"
                      size="sm"
                      onClick={() => toggleWorkflow(wf.id)}
                      style={{
                        color: wf.enabled
                          ? "var(--color-success)"
                          : "var(--color-text-muted)",
                      }}
                      title={wf.enabled ? "Disable workflow" : "Enable workflow"}
                    >
                      {wf.enabled ? <Play size={14} /> : <Pause size={14} />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className="text-[13px] font-medium truncate"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {wf.name}
                        </p>
                        <Badge variant={wf.enabled ? "success" : "neutral"} size="sm">
                          {wf.enabled ? "Active" : "Paused"}
                        </Badge>
                        <Badge variant="info" size="sm">
                          {triggerLabel}
                        </Badge>
                      </div>
                      <p
                        className="text-[11px] mt-0.5 truncate"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        When {triggerLabel}
                        {conditionStr} → {actionChain}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center gap-1" title="Steps">
                        <Hash size={10} style={{ color: "var(--color-text-muted)" }} />
                        <span className="text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
                          {wf.actions.length} step{wf.actions.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="text-right">
                        <p
                          className="text-[11px] tabular-nums"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {wf.runCount} run{wf.runCount !== 1 ? "s" : ""}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {wf.lastRunAt
                            ? `Last: ${new Date(wf.lastRunAt).toLocaleDateString()}`
                            : `Created ${new Date(wf.createdAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Button variant="icon" size="sm" onClick={() => startEdit(wf)} title="Edit">
                      <Pencil size={13} />
                    </Button>
                    <Button variant="icon" size="sm" onClick={() => confirmDelete(wf.id)} title="Delete">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* NL Builder Modal */}
      <Modal
        open={showNlModal}
        onClose={cancelNlModal}
        title="Build workflow with AI"
        size="lg"
        footer={
          nlResult ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setNlResult(null); setNlInput(""); }}>
                Start over
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={confirmNlWorkflow}
                disabled={nlConfirming}
                loading={nlConfirming}
              >
                {nlConfirming ? "Saving..." : "Confirm & save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={cancelNlModal}>
                Cancel
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={parseNl}
                disabled={nlParsing || !nlInput.trim()}
                loading={nlParsing}
                icon={nlParsing ? undefined : <Sparkles size={12} />}
              >
                {nlParsing ? "Parsing..." : "Build"}
              </Button>
            </>
          )
        }
      >
        {!nlResult ? (
          <div className="space-y-4">
            <Textarea
              label="Describe your workflow in plain English"
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              placeholder="e.g. Every time a deal reaches proposal stage, create a check-in task for 5 days later and send the case study email."
              style={{ minHeight: 120 }}
              autoFocus
            />
            {nlError && (
              <p className="text-[12px]" style={{ color: "var(--color-error)" }}>{nlError}</p>
            )}
            <div>
              <p className="text-[11px] font-medium mb-2" style={{ color: "var(--color-text-tertiary)" }}>
                Try an example:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {NL_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setNlInput(ex)}
                    className="rounded-full px-2.5 py-1 text-[11px] text-left transition-colors"
                    style={{
                      background: "var(--color-bg-hover)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-default)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="rounded-lg p-3"
              style={{ background: "var(--color-accent-soft)", border: "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)" }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-accent)" }}>
                Parsed Workflow
              </p>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Name</p>
                  <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{nlResult.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Trigger</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="info" size="sm">
                      {TRIGGER_TYPES.find(t => t.value === nlResult.trigger.type)?.label || nlResult.trigger.type}
                    </Badge>
                    {nlResult.trigger.conditions && Object.keys(nlResult.trigger.conditions).length > 0 && (
                      <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                        {Object.entries(nlResult.trigger.conditions).map(([k, v]) => `${k} = ${v}`).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--color-text-tertiary)" }}>
                    Actions ({nlResult.actions.length})
                  </p>
                  <div className="space-y-1.5">
                    {nlResult.actions.map((action, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-md p-2"
                        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                      >
                        <span className="text-[10px] font-bold" style={{ color: "var(--color-text-tertiary)" }}>
                          #{i + 1}
                        </span>
                        <Badge variant="neutral" size="sm">
                          {ACTION_TYPES.find(a => a.value === action.type)?.label || action.type}
                        </Badge>
                        {Object.keys(action.params).length > 0 && (
                          <span className="text-[11px] truncate" style={{ color: "var(--color-text-secondary)" }}>
                            {Object.values(action.params).filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              Review the parsed workflow above. Click &ldquo;Confirm & save&rdquo; to create it, or &ldquo;Start over&rdquo; to try a different description.
            </p>
          </div>
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete workflow"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={executeDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          Are you sure you want to delete this workflow? This action cannot be undone.
        </p>
      </Modal>
    </>
  );
}

function ActionParams({
  action,
  onChange,
}: {
  action: ActionDraft;
  onChange: (params: Record<string, string>) => void;
}) {
  const set = (key: string, value: string) => onChange({ ...action.params, [key]: value });

  switch (action.type) {
    case "send_notification":
      return (
        <Input
          label="Notification message"
          value={action.params.title || ""}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Deal moved to proposal stage!"
        />
      );
    case "send_email":
      return (
        <div className="space-y-2">
          <Input
            label="Subject"
            value={action.params.subject || ""}
            onChange={(e) => set("subject", e.target.value)}
            placeholder="e.g. Follow-up on your inquiry"
          />
          <Input
            label="Body"
            value={action.params.body || ""}
            onChange={(e) => set("body", e.target.value)}
            placeholder="Email body text"
          />
        </div>
      );
    case "enroll_sequence":
      return (
        <Input
          label="Sequence ID"
          value={action.params.sequenceId || ""}
          onChange={(e) => set("sequenceId", e.target.value)}
          placeholder="Paste the sequence ID to enroll contacts into"
        />
      );
    case "assign_owner":
      return (
        <Input
          label="Owner user ID"
          value={action.params.ownerId || ""}
          onChange={(e) => set("ownerId", e.target.value)}
          placeholder="User ID to assign as owner"
        />
      );
    case "add_tag":
      return (
        <Input
          label="Tag"
          value={action.params.tag || ""}
          onChange={(e) => set("tag", e.target.value)}
          placeholder="e.g. high-priority, hot-lead"
        />
      );
    case "update_field":
      return (
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Field name"
              value={action.params.fieldName || ""}
              onChange={(e) => set("fieldName", e.target.value)}
              placeholder="e.g. status"
            />
          </div>
          <div className="flex-1">
            <Input
              label="New value"
              value={action.params.fieldValue || ""}
              onChange={(e) => set("fieldValue", e.target.value)}
              placeholder="e.g. qualified"
            />
          </div>
        </div>
      );
    case "ai_action":
      return (
        <Input
          label="AI instruction"
          value={action.params.instruction || ""}
          onChange={(e) => set("instruction", e.target.value)}
          placeholder="e.g. Draft a congratulations email for this deal"
        />
      );
    case "call_webhook":
      return (
        <Input
          label="Webhook URL"
          value={action.params.url || ""}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://..."
        />
      );
    case "create_task":
      return (
        <Input
          label="Task title"
          value={action.params.title || ""}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Call the new contact within 24h"
        />
      );
    default:
      return null;
  }
}
