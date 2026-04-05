"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
];

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
    actionSequenceId: "",
    actionOwnerId: "",
    actionTag: "",
    actionFieldName: "",
    actionFieldValue: "",
    actionInstruction: "",
    actionSubject: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/workflows")
      .then((r) => r.ok ? r.json() : { workflows: [] })
      .then((data) => setWorkflows(data.workflows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveWorkflows(updated: WorkflowDef[]) {
    setSaving(true);
    setError("");
    try {
      await fetch("/api/settings/workflows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflows: updated }),
      });
    } catch {
      setError("Failed to save workflow changes");
    }
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
          ...(newWorkflow.actionSequenceId ? { sequenceId: newWorkflow.actionSequenceId } : {}),
          ...(newWorkflow.actionOwnerId ? { ownerId: newWorkflow.actionOwnerId } : {}),
          ...(newWorkflow.actionTag ? { tag: newWorkflow.actionTag } : {}),
          ...(newWorkflow.actionFieldName ? { fieldName: newWorkflow.actionFieldName } : {}),
          ...(newWorkflow.actionFieldValue ? { fieldValue: newWorkflow.actionFieldValue } : {}),
          ...(newWorkflow.actionInstruction ? { instruction: newWorkflow.actionInstruction } : {}),
          ...(newWorkflow.actionSubject ? { subject: newWorkflow.actionSubject } : {}),
        },
      }],
      createdAt: new Date().toISOString(),
      runCount: 0,
    };
    const updated = [...workflows, wf];
    setWorkflows(updated);
    saveWorkflows(updated);
    setShowCreate(false);
    setNewWorkflow({ name: "", triggerType: "deal_stage_changed", conditionKey: "", conditionValue: "", actionType: "send_notification", actionTitle: "", actionBody: "", actionUrl: "", actionSequenceId: "", actionOwnerId: "", actionTag: "", actionFieldName: "", actionFieldValue: "", actionInstruction: "", actionSubject: "" });
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
          <Badge variant="warning" size="md">Beta</Badge>
          <Button variant="gradient" size="sm" icon={<Plus size={13} />} onClick={() => setShowCreate(true)}>
            Create workflow
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}

      {/* Create workflow form */}
      {showCreate && (
        <Card className="mt-4" style={{ border: "1px solid var(--color-accent)" }}>
          <CardBody>
            <div className="space-y-3">
              <Input
                label="Name"
                value={newWorkflow.name}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                placeholder="e.g. Notify on deal progression"
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>When</label>
                  <select value={newWorkflow.triggerType} onChange={(e) => setNewWorkflow({ ...newWorkflow, triggerType: e.target.value })}
                    className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
                    {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Then</label>
                  <select value={newWorkflow.actionType} onChange={(e) => setNewWorkflow({ ...newWorkflow, actionType: e.target.value })}
                    className="mt-1 h-8 w-full rounded-md px-3 text-[12px] outline-none"
                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
                    {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
              {["deal_stage_changed", "score_changed", "enrichment_completed", "sequence_reply_received"].includes(newWorkflow.triggerType) && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      label="Condition: field"
                      value={newWorkflow.conditionKey}
                      onChange={(e) => setNewWorkflow({ ...newWorkflow, conditionKey: e.target.value })}
                      placeholder={newWorkflow.triggerType === "score_changed" ? "e.g. scoreDirection" : newWorkflow.triggerType === "deal_stage_changed" ? "e.g. newStage" : "e.g. field name"}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="equals"
                      value={newWorkflow.conditionValue}
                      onChange={(e) => setNewWorkflow({ ...newWorkflow, conditionValue: e.target.value })}
                      placeholder={newWorkflow.triggerType === "score_changed" ? "e.g. increased" : newWorkflow.triggerType === "deal_stage_changed" ? "e.g. proposal" : "e.g. value"}
                    />
                  </div>
                </div>
              )}
              {newWorkflow.actionType === "send_notification" && (
                <Input
                  label="Notification message"
                  value={newWorkflow.actionTitle}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, actionTitle: e.target.value })}
                  placeholder="e.g. Deal moved to proposal stage!"
                />
              )}
              {newWorkflow.actionType === "send_email" && (
                <div className="space-y-2">
                  <Input
                    label="Subject"
                    value={newWorkflow.actionSubject}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, actionSubject: e.target.value })}
                    placeholder="e.g. Follow-up on your inquiry"
                  />
                  <Input
                    label="Body"
                    value={newWorkflow.actionBody}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, actionBody: e.target.value })}
                    placeholder="Email body text"
                  />
                </div>
              )}
              {newWorkflow.actionType === "enroll_sequence" && (
                <Input
                  label="Sequence ID"
                  value={newWorkflow.actionSequenceId}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, actionSequenceId: e.target.value })}
                  placeholder="Paste the sequence ID to enroll contacts into"
                />
              )}
              {newWorkflow.actionType === "assign_owner" && (
                <Input
                  label="Owner user ID"
                  value={newWorkflow.actionOwnerId}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, actionOwnerId: e.target.value })}
                  placeholder="User ID to assign as owner"
                />
              )}
              {newWorkflow.actionType === "add_tag" && (
                <Input
                  label="Tag"
                  value={newWorkflow.actionTag}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, actionTag: e.target.value })}
                  placeholder="e.g. high-priority, hot-lead"
                />
              )}
              {newWorkflow.actionType === "update_field" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      label="Field name"
                      value={newWorkflow.actionFieldName}
                      onChange={(e) => setNewWorkflow({ ...newWorkflow, actionFieldName: e.target.value })}
                      placeholder="e.g. status"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="New value"
                      value={newWorkflow.actionFieldValue}
                      onChange={(e) => setNewWorkflow({ ...newWorkflow, actionFieldValue: e.target.value })}
                      placeholder="e.g. qualified"
                    />
                  </div>
                </div>
              )}
              {newWorkflow.actionType === "ai_action" && (
                <Input
                  label="AI instruction"
                  value={newWorkflow.actionInstruction}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, actionInstruction: e.target.value })}
                  placeholder="e.g. Draft a congratulations email for this deal"
                />
              )}
              {newWorkflow.actionType === "call_webhook" && (
                <Input
                  label="Webhook URL"
                  value={newWorkflow.actionUrl}
                  onChange={(e) => setNewWorkflow({ ...newWorkflow, actionUrl: e.target.value })}
                  placeholder="https://..."
                />
              )}
              <div className="flex gap-2">
                <Button variant="gradient" size="sm" onClick={createWorkflow} disabled={!newWorkflow.name.trim() || saving}>
                  Create
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Workflows list */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />)}
          </div>
        ) : workflows.length === 0 ? (
          <Card>
            <div className="py-12 text-center">
              <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>No workflows yet.</p>
              <button onClick={() => setShowCreate(true)} className="mt-2 text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
                + Create your first workflow
              </button>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {workflows.map((wf) => (
              <Card key={wf.id} style={{ opacity: wf.enabled ? 1 : 0.5 }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <Button variant="icon" size="sm" onClick={() => toggleWorkflow(wf.id)}
                    style={{ color: wf.enabled ? "var(--color-success)" : "var(--color-text-muted)" }}>
                    {wf.enabled ? <Play size={14} /> : <Pause size={14} />}
                  </Button>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{wf.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      When {TRIGGER_TYPES.find((t) => t.value === wf.trigger.type)?.label || wf.trigger.type}
                      {wf.trigger.conditions && Object.entries(wf.trigger.conditions).map(([k, v]) => ` (${k} = ${v})`)}
                      {" -> "}
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
                  <Button variant="icon" size="sm" onClick={() => deleteWorkflow(wf.id)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
