"use client";

import { useState, useEffect, useCallback } from "react";
import { Wand2 } from "lucide-react";
import { SkillSidebar } from "@/components/skills/skill-sidebar";
import { SkillDetail } from "@/components/skills/skill-detail";
import { ExploreGrid } from "@/components/skills/explore-grid";
import { CreateSkillDialog } from "@/components/skills/create-skill-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Plus } from "lucide-react";
// SkillEntry lives in ./_types (a Next page.tsx may only export the default
// component + route config — a named/type export here fails next build).
import type { SkillEntry } from "./_types";

type ViewMode = "list" | "explore";

export default function SkillsPage() {
  const { toast } = useToast();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [forkSource, setForkSource] = useState<SkillEntry | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/skills");
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch (e) {
      console.warn("skills: fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const systemSkills = skills.filter((s) => s.scope === "system");
  const workspaceSkills = skills.filter((s) => s.scope === "workspace");
  const personalSkills = skills.filter((s) => s.scope === "user");

  function handleFork(skill: SkillEntry) {
    setForkSource(skill);
    setCreateDialogOpen(true);
  }

  function handleCreateNew() {
    setForkSource(null);
    setCreateDialogOpen(true);
  }

  async function handleCreateSkill(payload: Record<string, unknown>) {
    try {
      const res = await fetch("/api/settings/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast("Skill created", "success");
        setCreateDialogOpen(false);
        setForkSource(null);
        fetchSkills();
      } else {
        const err = await res.json().catch(() => ({}));
        toast((err as { error?: string }).error || "Failed to create skill", "error");
      }
    } catch {
      toast("Failed to create skill", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header shell — matches the loaded 44px PageHeader (icon + title left,
            view toggle + Create button right) */}
        <div
          className="flex shrink-0 items-center justify-between px-6"
          style={{
            height: "var(--header-height)",
            borderBottom: "1px solid var(--color-border-default)",
          }}
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-[120px] rounded-md" />
            <Skeleton className="h-7 w-[104px] rounded-md" />
          </div>
        </div>

        {/* Content — sidebar + detail pane columns reserved (list view) */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className="flex w-[280px] shrink-0 flex-col overflow-y-auto"
            style={{ background: "var(--color-bg-sidebar)" }}
          >
            <div className="py-2">
              {Array.from({ length: 3 }).map((_, s) => (
                <div key={s}>
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <Skeleton className="h-3 w-3 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                  <div className="space-y-0.5 px-1 pb-1">
                    {Array.from({ length: 3 }).map((_, r) => (
                      <div
                        key={r}
                        className="flex items-center gap-2 px-3 py-1.5"
                      >
                        <Skeleton className="h-3.5 w-3.5 rounded" />
                        <Skeleton
                          className="h-3 rounded"
                          style={{ width: `${55 + ((s * 3 + r) * 13) % 35}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto p-6"
            style={{ borderLeft: "1px solid var(--color-border-default)" }}
          >
            <Skeleton className="h-5 w-44 rounded" />
            <Skeleton className="mt-3 h-3 w-full rounded" />
            <Skeleton className="mt-2 h-3 w-3/4 rounded" />
            <Skeleton className="mt-2 h-3 w-2/3 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden animate-content-in">
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-6"
        style={{
          height: "var(--header-height)",
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-2">
          <Wand2 size={16} style={{ color: "var(--color-accent)" }} />
          <h1
            className="text-[15px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Skills
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div
            className="flex h-7 items-center rounded-md p-0.5"
            style={{
              background: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <button
              onClick={() => setViewMode("list")}
              className="rounded px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: viewMode === "list" ? "var(--color-bg-card)" : "transparent",
                color: viewMode === "list" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                boxShadow: viewMode === "list" ? "var(--shadow-card)" : "none",
              }}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("explore")}
              className="rounded px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: viewMode === "explore" ? "var(--color-bg-card)" : "transparent",
                color: viewMode === "explore" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                boxShadow: viewMode === "explore" ? "var(--shadow-card)" : "none",
              }}
            >
              Explore
            </button>
          </div>

          <Button
            variant="gradient"
            size="sm"
            icon={<Plus size={12} />}
            onClick={handleCreateNew}
          >
            Create skill
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "list" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Sidebar */}
          <SkillSidebar
            systemSkills={systemSkills}
            workspaceSkills={workspaceSkills}
            personalSkills={personalSkills}
            selectedSkill={selectedSkill}
            onSelect={setSelectedSkill}
          />

          {/* Detail panel */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ borderLeft: "1px solid var(--color-border-default)" }}
          >
            {selectedSkill ? (
              <SkillDetail
                skill={selectedSkill}
                onFork={handleFork}
                onRefresh={fetchSkills}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center">
                <Wand2 size={32} style={{ color: "var(--color-text-muted)" }} />
                <p
                  className="mt-3 text-[13px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Select a skill to view details
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <ExploreGrid
            skills={systemSkills}
            onFork={handleFork}
          />
        </div>
      )}

      {/* Create / Fork dialog */}
      {createDialogOpen && (
        <CreateSkillDialog
          forkSource={forkSource}
          onSubmit={handleCreateSkill}
          onClose={() => {
            setCreateDialogOpen(false);
            setForkSource(null);
          }}
        />
      )}
    </div>
  );
}
