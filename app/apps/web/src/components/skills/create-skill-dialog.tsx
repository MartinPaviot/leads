"use client";

import { useState } from "react";
import { X, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SkillEntry } from "@/app/(dashboard)/skills/page";

interface CreateSkillDialogProps {
  forkSource: SkillEntry | null;
  onSubmit: (payload: Record<string, unknown>) => void;
  onClose: () => void;
}

export function CreateSkillDialog({
  forkSource,
  onSubmit,
  onClose,
}: CreateSkillDialogProps) {
  const [name, setName] = useState(
    forkSource ? `${forkSource.name} (copy)` : ""
  );
  const [description, setDescription] = useState(
    forkSource?.description || ""
  );
  const [scope, setScope] = useState<"workspace" | "user">("workspace");
  const [steps, setSteps] = useState<string[]>(
    forkSource?.steps || []
  );
  const [constraints, setConstraints] = useState<string[]>(
    forkSource?.constraints || []
  );
  const [guidelines, setGuidelines] = useState(
    forkSource?.guidelines || ""
  );
  const [submitting, setSubmitting] = useState(false);

  function addStep() {
    setSteps([...steps, ""]);
  }

  function updateStep(index: number, value: string) {
    const updated = [...steps];
    updated[index] = value;
    setSteps(updated);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function addConstraint() {
    setConstraints([...constraints, ""]);
  }

  function updateConstraint(index: number, value: string) {
    const updated = [...constraints];
    updated[index] = value;
    setConstraints(updated);
  }

  function removeConstraint(index: number) {
    setConstraints(constraints.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);

    const payload: Record<string, unknown> = forkSource
      ? {
          forkFromId: forkSource.slug,
          name: name.trim(),
          scope,
        }
      : {
          name: name.trim(),
          description: description.trim(),
          scope,
          steps: steps.filter((s) => s.trim()),
          constraints: constraints.filter((c) => c.trim()),
          guidelines: guidelines.trim(),
        };

    await onSubmit(payload);
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-xl p-6 shadow-xl"
        style={{
          background: "var(--color-bg-card)",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {forkSource ? `Fork: ${forkSource.name}` : "New Skill"}
          </h3>
          <button
            onClick={onClose}
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label
              className="block text-[12px] font-medium mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly pipeline digest"
            />
          </div>

          {/* Description (hidden for fork since it copies from source) */}
          {!forkSource && (
            <div>
              <label
                className="block text-[12px] font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this skill do?"
              />
            </div>
          )}

          {/* Scope */}
          <div>
            <label
              className="block text-[12px] font-medium mb-1.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Scope
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "workspace"}
                  onChange={() => setScope("workspace")}
                  className="accent-[var(--color-accent)]"
                />
                <span
                  className="text-[13px]"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Workspace
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "user"}
                  onChange={() => setScope("user")}
                  className="accent-[var(--color-accent)]"
                />
                <span
                  className="text-[13px]"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Personal
                </span>
              </label>
            </div>
          </div>

          {/* Steps (hidden for fork) */}
          {!forkSource && (
            <div>
              <label
                className="flex items-center justify-between text-[12px] font-medium mb-1.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span>Steps</span>
                <button
                  type="button"
                  onClick={addStep}
                  className="flex items-center gap-1 text-[11px] font-medium transition-colors"
                  style={{ color: "var(--color-accent)" }}
                >
                  <Plus size={11} />
                  Add step
                </button>
              </label>
              {steps.length === 0 ? (
                <p
                  className="text-[12px] py-2"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No steps added. Add steps to define a workflow, or use guidelines for a free-form skill.
                </p>
              ) : (
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                        style={{
                          background: "var(--color-bg-hover)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <Input
                        value={step}
                        onChange={(e) => updateStep(i, e.target.value)}
                        placeholder={`Step ${i + 1}`}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--color-text-muted)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--color-error)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--color-text-muted)";
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Constraints (hidden for fork) */}
          {!forkSource && (
            <div>
              <label
                className="flex items-center justify-between text-[12px] font-medium mb-1.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span>Constraints</span>
                <button
                  type="button"
                  onClick={addConstraint}
                  className="flex items-center gap-1 text-[11px] font-medium transition-colors"
                  style={{ color: "var(--color-accent)" }}
                >
                  <Plus size={11} />
                  Add constraint
                </button>
              </label>
              {constraints.length === 0 ? (
                <p
                  className="text-[12px] py-2"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No constraints added.
                </p>
              ) : (
                <div className="space-y-2">
                  {constraints.map((constraint, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={constraint}
                        onChange={(e) => updateConstraint(i, e.target.value)}
                        placeholder={`Constraint ${i + 1}`}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeConstraint(i)}
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--color-text-muted)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--color-error)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--color-text-muted)";
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Guidelines (hidden for fork) */}
          {!forkSource && (
            <div>
              <label
                className="block text-[12px] font-medium mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Guidelines{" "}
                <span style={{ color: "var(--color-text-muted)" }}>
                  (optional)
                </span>
              </label>
              <textarea
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                placeholder="Free-form instructions for the agent when running this skill..."
                className="w-full rounded-lg p-3 text-[13px] font-mono outline-none"
                rows={5}
                style={{
                  background: "var(--color-bg-muted)",
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-primary)",
                  resize: "vertical",
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gradient"
            size="sm"
            icon={<Check size={12} />}
            onClick={handleSubmit}
            loading={submitting}
            disabled={!name.trim()}
          >
            {forkSource ? "Fork skill" : "Create skill"}
          </Button>
        </div>
      </div>
    </div>
  );
}
