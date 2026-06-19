"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Wand2 } from "lucide-react";
import type { SkillEntry } from "@/app/(dashboard)/skills/_types";

interface SkillSidebarProps {
  systemSkills: SkillEntry[];
  workspaceSkills: SkillEntry[];
  personalSkills: SkillEntry[];
  selectedSkill: SkillEntry | null;
  onSelect: (skill: SkillEntry) => void;
}

interface CollapsibleSectionProps {
  title: string;
  count: number;
  skills: SkillEntry[];
  selectedSkill: SkillEntry | null;
  onSelect: (skill: SkillEntry) => void;
  defaultOpen?: boolean;
}

function CollapsibleSection({
  title,
  count,
  skills,
  selectedSkill,
  onSelect,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors"
        style={{ color: "var(--color-text-tertiary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">{title}</span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: "var(--color-bg-hover)",
            color: "var(--color-text-muted)",
          }}
        >
          {count}
        </span>
      </button>

      {open && (
        <div className="space-y-0.5 px-1 pb-1">
          {skills.length === 0 ? (
            <div
              className="px-3 py-3 text-[12px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              No skills yet
            </div>
          ) : (
            skills.map((skill) => {
              const isSelected = selectedSkill?.id === skill.id;
              return (
                <button
                  key={skill.id}
                  onClick={() => onSelect(skill)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-all duration-150"
                  style={{
                    background: isSelected
                      ? "var(--color-accent-soft)"
                      : "transparent",
                    color: isSelected
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                    boxShadow: isSelected
                      ? "inset 3px 0 0 0 var(--color-accent)"
                      : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "var(--color-bg-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <Wand2
                    size={14}
                    className="shrink-0"
                    style={{
                      color: isSelected ? "var(--color-accent)" : undefined,
                      opacity: isSelected ? 1 : 0.5,
                    }}
                  />
                  <span className="truncate text-[13px] font-medium">
                    {skill.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function SkillSidebar({
  systemSkills,
  workspaceSkills,
  personalSkills,
  selectedSkill,
  onSelect,
}: SkillSidebarProps) {
  return (
    <div
      className="flex w-[280px] shrink-0 flex-col overflow-y-auto"
      style={{ background: "var(--color-bg-sidebar)" }}
    >
      <div className="py-2">
        <CollapsibleSection
          title="System"
          count={systemSkills.length}
          skills={systemSkills}
          selectedSkill={selectedSkill}
          onSelect={onSelect}
          defaultOpen
        />

        <div
          className="mx-3 my-1"
          style={{ borderTop: "1px solid var(--color-border-default)" }}
        />

        <CollapsibleSection
          title="Workspace"
          count={workspaceSkills.length}
          skills={workspaceSkills}
          selectedSkill={selectedSkill}
          onSelect={onSelect}
          defaultOpen
        />

        <div
          className="mx-3 my-1"
          style={{ borderTop: "1px solid var(--color-border-default)" }}
        />

        <CollapsibleSection
          title="Personal"
          count={personalSkills.length}
          skills={personalSkills}
          selectedSkill={selectedSkill}
          onSelect={onSelect}
          defaultOpen
        />
      </div>
    </div>
  );
}
