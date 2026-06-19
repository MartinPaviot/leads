"use client";

import { useRouter } from "next/navigation";
import { Play, GitFork, Pencil, Trash2, Wand2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { SkillEntry } from "@/app/(dashboard)/skills/_types";

interface SkillDetailProps {
  skill: SkillEntry;
  onFork: (skill: SkillEntry) => void;
  onRefresh: () => void;
}

const CATEGORY_VARIANT: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  enrichment: "info",
  scoring: "warning",
  outreach: "success",
  signals: "error",
  intelligence: "neutral",
  custom: "neutral",
};

export function SkillDetail({ skill, onFork, onRefresh }: SkillDetailProps) {
  const router = useRouter();
  const { toast } = useToast();

  function handleRun() {
    router.push(`/chat?skill=${encodeURIComponent(skill.slug)}`);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${skill.name}"?`)) return;
    try {
      const res = await fetch(`/api/settings/skills/${skill.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast("Skill deleted", "success");
        onRefresh();
      } else {
        toast("Failed to delete skill", "error");
      }
    } catch {
      toast("Failed to delete skill", "error");
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--color-accent-soft)" }}
            >
              <Wand2 size={16} style={{ color: "var(--color-accent)" }} />
            </div>
            <div className="min-w-0">
              <h2
                className="truncate text-[16px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {skill.name}
              </h2>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge
                  variant={CATEGORY_VARIANT[skill.category] || "neutral"}
                  size="sm"
                >
                  {skill.category}
                </Badge>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {skill.scope}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="gradient"
            size="sm"
            icon={<Play size={12} />}
            onClick={handleRun}
          >
            Run
          </Button>
          {skill.scope === "system" && (
            <Button
              variant="outline"
              size="sm"
              icon={<GitFork size={12} />}
              onClick={() => onFork(skill)}
            >
              Fork
            </Button>
          )}
          {skill.isEditable && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={12} />}
                onClick={handleDelete}
                style={{ color: "var(--color-error)" }}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="mt-6">
        <h3
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Description
        </h3>
        <p
          className="mt-2 text-[14px] leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {skill.description}
        </p>
      </div>

      {/* Cost estimate */}
      {skill.costEstimate && (
        <div className="mt-5">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Cost Estimate
          </h3>
          <div className="mt-2 flex items-center gap-1.5">
            <Zap size={13} style={{ color: "var(--color-warning)" }} />
            <span
              className="text-[13px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {skill.costEstimate}
            </span>
          </div>
        </div>
      )}

      {/* Steps */}
      {skill.steps && skill.steps.length > 0 && (
        <div className="mt-5">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Steps
          </h3>
          <ol className="mt-2 space-y-1.5">
            {skill.steps.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    background: "var(--color-bg-hover)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Constraints */}
      {skill.constraints && skill.constraints.length > 0 && (
        <div className="mt-5">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Constraints
          </h3>
          <ul className="mt-2 space-y-1">
            {skill.constraints.map((constraint, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[13px]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--color-text-muted)" }}
                />
                <span>{constraint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Parameters */}
      {skill.parameters && skill.parameters.length > 0 && (
        <div className="mt-5">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Parameters
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skill.parameters.map((param, i) => (
              <span
                key={i}
                className="rounded-md px-2 py-1 text-[12px] font-mono"
                style={{
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                {param}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Guidelines */}
      {skill.guidelines && (
        <div className="mt-5">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Guidelines
          </h3>
          <div
            className="mt-2 whitespace-pre-wrap rounded-lg p-3 text-[13px] font-mono leading-relaxed"
            style={{
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {skill.guidelines}
          </div>
        </div>
      )}

      {/* Usage stats */}
      {(skill.useCount > 0 || skill.lastUsedAt) && (
        <div
          className="mt-6 flex items-center gap-4 rounded-lg px-4 py-3"
          style={{
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          {skill.useCount > 0 && (
            <div>
              <span
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Used
              </span>
              <span
                className="ml-1.5 text-[14px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {skill.useCount} {skill.useCount === 1 ? "time" : "times"}
              </span>
            </div>
          )}
          {skill.lastUsedAt && (
            <div>
              <span
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Last used
              </span>
              <span
                className="ml-1.5 text-[13px]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {new Date(skill.lastUsedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
