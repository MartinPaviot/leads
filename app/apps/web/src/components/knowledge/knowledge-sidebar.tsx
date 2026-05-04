"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  scope: string;
  isEditable: boolean;
  isStale: boolean;
  updatedAt: string | null;
  createdAt: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  icp: "ICP",
  competitors: "Competitors",
  objections: "Objections",
  product: "Product",
  process: "Process",
  context: "Context",
  custom: "Custom",
};

const CATEGORY_VARIANTS: Record<string, "info" | "warning" | "success" | "error" | "neutral"> = {
  icp: "info",
  competitors: "warning",
  objections: "error",
  product: "success",
  process: "neutral",
  context: "neutral",
  custom: "neutral",
};

interface KnowledgeSidebarProps {
  entries: KnowledgeEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClick: () => void;
}

function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors"
      style={{ color: "var(--color-text-tertiary)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span>{label}</span>
      <span
        className="ml-auto rounded-full px-1.5 text-[10px] font-medium"
        style={{
          background: "var(--color-bg-hover)",
          color: "var(--color-text-tertiary)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function EntryRow({
  entry,
  selected,
  onClick,
}: {
  entry: KnowledgeEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const categoryLabel = CATEGORY_LABELS[entry.category] || entry.category;
  const categoryVariant = CATEGORY_VARIANTS[entry.category] || "neutral";

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-all duration-150"
      style={{
        background: selected ? "var(--color-accent-soft)" : "transparent",
        color: selected
          ? "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        boxShadow: selected
          ? "inset 3px 0 0 0 var(--color-accent)"
          : undefined,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--color-bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <FileText
        size={14}
        className="shrink-0"
        style={{
          color: selected ? "var(--color-accent)" : undefined,
          opacity: selected ? 1 : 0.5,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{entry.title}</div>
      </div>
      <Badge variant={categoryVariant} size="sm">
        {categoryLabel}
      </Badge>
    </button>
  );
}

function EmptySection({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="px-3 py-4 text-center">
      <p
        className="text-[12px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        No entries yet
      </p>
      <button
        onClick={onAddClick}
        className="mt-2 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
        style={{
          color: "var(--color-accent)",
          border: "1px solid var(--color-border-default)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Plus size={12} />
        Add knowledge
      </button>
    </div>
  );
}

export function KnowledgeSidebar({
  entries,
  selectedId,
  onSelect,
  onAddClick,
}: KnowledgeSidebarProps) {
  const [workspaceExpanded, setWorkspaceExpanded] = useState(true);
  const [personalExpanded, setPersonalExpanded] = useState(true);

  const workspaceEntries = entries.filter((e) => e.scope === "workspace");
  const personalEntries = entries.filter((e) => e.scope === "user");

  return (
    <div
      className="flex h-full w-[280px] shrink-0 flex-col"
      style={{ borderRight: "1px solid var(--color-border-default)" }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-4"
        style={{
          height: "var(--header-height)",
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        <span
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Knowledge
        </span>
        <button
          onClick={onAddClick}
          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          title="Add knowledge"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Entry list */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {/* Workspace section */}
        <SectionHeader
          label="Workspace"
          count={workspaceEntries.length}
          expanded={workspaceExpanded}
          onToggle={() => setWorkspaceExpanded(!workspaceExpanded)}
        />
        {workspaceExpanded && (
          <div className="space-y-0.5 px-1">
            {workspaceEntries.length === 0 ? (
              <EmptySection onAddClick={onAddClick} />
            ) : (
              workspaceEntries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  selected={selectedId === entry.id}
                  onClick={() => onSelect(entry.id)}
                />
              ))
            )}
          </div>
        )}

        {/* Personal section */}
        <div className="mt-2">
          <SectionHeader
            label="Personal"
            count={personalEntries.length}
            expanded={personalExpanded}
            onToggle={() => setPersonalExpanded(!personalExpanded)}
          />
          {personalExpanded && (
            <div className="space-y-0.5 px-1">
              {personalEntries.length === 0 ? (
                <EmptySection onAddClick={onAddClick} />
              ) : (
                personalEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    selected={selectedId === entry.id}
                    onClick={() => onSelect(entry.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
