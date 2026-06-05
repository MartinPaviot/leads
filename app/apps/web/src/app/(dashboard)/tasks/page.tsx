"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CheckSquare, Plus, ArrowUpDown, AlertCircle, Clock, ListFilter, Building2, User, Briefcase } from "lucide-react";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/input";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  priority: string;
  entityType: string | null;
  entityId: string | null;
  entityName?: string | null;
}

type FilterTab = "all" | "due_today" | "overdue" | "completed";
type SortMode = "priority" | "due_date";

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_CYCLE: Record<string, string> = { low: "medium", medium: "high", high: "low" };

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === "completed") return false;
  return new Date(task.dueDate) < new Date();
}

function isDueToday(task: Task): boolean {
  if (!task.dueDate || task.status === "completed") return false;
  const due = new Date(task.dueDate);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 0) return `${Math.abs(hours)}h overdue`;
    if (hours === 0) return "Due now";
    return `${hours}h left`;
  }
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < -1) return `${Math.abs(days)}d overdue`;
  if (days < 7) return `${days}d left`;
  return date.toLocaleDateString();
}

function entityIcon(entityType: string | null) {
  switch (entityType) {
    case "company":
      return <Building2 size={11} />;
    case "contact":
      return <User size={11} />;
    case "deal":
      return <Briefcase size={11} />;
    default:
      return null;
  }
}

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "company":
      return `/accounts/${entityId}`;
    case "contact":
      return `/contacts/${entityId}`;
    case "deal":
      return `/opportunities/${entityId}`;
    default:
      return null;
  }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.warn("tasks: list fetch failed", e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function addTask() {
    if (!newTask.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTask.trim(), priority: "medium" }),
      });
      if (res.ok) { setNewTask(""); fetchTasks(); }
    } catch (e) {
      console.warn("tasks: add failed", e);
    } finally { setSaving(false); }
  }

  async function toggleTask(id: string, currentStatus: string) {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTasks();
    } catch (e) {
      console.warn("tasks: toggle failed", e);
    }
  }

  async function cyclePriority(id: string, currentPriority: string) {
    const newPriority = PRIORITY_CYCLE[currentPriority] || "medium";
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      fetchTasks();
    } catch (e) {
      console.warn("tasks: priority change failed", e);
    }
  }

  const pendingCount = tasks.filter((t) => t.status !== "completed").length;
  const overdueCount = tasks.filter(isOverdue).length;
  const dueTodayCount = tasks.filter(isDueToday).length;

  // Filter
  const filtered = useMemo(() => {
    switch (filterTab) {
      case "due_today":
        return tasks.filter((t) => t.status !== "completed" && isDueToday(t));
      case "overdue":
        return tasks.filter(isOverdue);
      case "completed":
        return tasks.filter((t) => t.status === "completed");
      default:
        return tasks;
    }
  }, [tasks, filterTab]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortMode === "priority") {
      arr.sort((a, b) => {
        // completed always at bottom
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (a.status !== "completed" && b.status === "completed") return -1;
        const pa = PRIORITY_ORDER[a.priority] ?? 1;
        const pb = PRIORITY_ORDER[b.priority] ?? 1;
        if (pa !== pb) return pa - pb;
        // secondary sort: due date ascending (soonest first)
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    } else {
      arr.sort((a, b) => {
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (a.status !== "completed" && b.status === "completed") return -1;
        // due date ascending, null at end
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    }
    return arr;
  }, [filtered, sortMode]);

  // Group by entity
  const grouped = useMemo(() => {
    const groups = new Map<string, Task[]>();
    const ungrouped: Task[] = [];

    for (const task of sorted) {
      if (task.entityType && task.entityId) {
        const key = `${task.entityType}:${task.entityId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
      } else {
        ungrouped.push(task);
      }
    }
    return { groups, ungrouped };
  }, [sorted]);

  const filterTabs: Array<{ key: FilterTab; label: string; count?: number }> = [
    { key: "all", label: "All", count: tasks.length },
    { key: "due_today", label: "Due today", count: dueTodayCount },
    { key: "overdue", label: "Overdue", count: overdueCount },
    { key: "completed", label: "Completed" },
  ];

  function renderTask(task: Task) {
    const overdue = isOverdue(task);
    const completed = task.status === "completed";

    return (
      <div
        key={task.id}
        className="flex items-center gap-3 rounded-md px-3 transition-colors"
        style={{ height: "var(--table-row-height)", borderBottom: "1px solid var(--color-border-default)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Checkbox
          checked={completed}
          onChange={() => toggleTask(task.id, task.status)}
        />
        <div className="min-w-0 flex-1">
          <span
            className={`text-[13px] ${completed ? "line-through" : ""}`}
            style={{ color: completed ? "var(--color-text-secondary)" : "var(--color-text-primary)" }}
          >
            {task.title}
          </span>
        </div>

        {/* Entity badge */}
        {task.entityType && (
          <Badge variant="neutral" size="sm">
            <span className="flex items-center gap-1">
              {entityIcon(task.entityType)}
              {task.entityName || task.entityType}
            </span>
          </Badge>
        )}

        {/* Priority badge — click to cycle */}
        {!completed && (
          <button
            onClick={(e) => { e.stopPropagation(); cyclePriority(task.id, task.priority); }}
            title={`Priority: ${task.priority} (click to change)`}
          >
            {task.priority === "high" && (
              <Badge variant="error" size="sm">High</Badge>
            )}
            {task.priority === "medium" && (
              <Badge variant="warning" size="sm">Medium</Badge>
            )}
            {task.priority === "low" && (
              <Badge variant="neutral" size="sm">Low</Badge>
            )}
          </button>
        )}

        {/* Due date with overdue indicator */}
        {task.dueDate && (
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: overdue ? "var(--color-error)" : "var(--color-text-tertiary)" }}
          >
            {overdue && <AlertCircle size={11} />}
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader
        icon={<CheckSquare size={15} />}
        title="Tasks"
        subtitle={`${tasks.length}`}
      >
        {pendingCount > 0 && (
          <Badge variant="warning" size="sm">{pendingCount} pending</Badge>
        )}
        {overdueCount > 0 && (
          <Badge variant="error" size="sm">{overdueCount} overdue</Badge>
        )}
      </PageHeader>

      {/* Filter bar */}
      <FilterBar>
        <div className="flex gap-0.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: filterTab === tab.key ? "var(--color-accent-soft)" : "transparent",
                color: filterTab === tab.key ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="ml-1 opacity-70">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSortMode(sortMode === "priority" ? "due_date" : "priority")}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title={`Sort by ${sortMode === "priority" ? "due date" : "priority"}`}
          >
            <ArrowUpDown size={12} />
            {sortMode === "priority" ? "Priority" : "Due date"}
          </button>
        </div>
      </FilterBar>

      {/* Add task bar */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a task..."
          className="h-8 flex-1 rounded-md px-3 text-[13px] outline-none transition-colors"
          style={{
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
        />
        <Button
          variant="gradient"
          size="sm"
          onClick={addTask}
          disabled={!newTask.trim() || saving}
          icon={<Plus size={13} />}
          loading={saving}
        >
          Add
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CheckSquare size={24} />}
            title="No tasks yet"
            description="Add tasks or ask the chat to create follow-ups."
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<ListFilter size={24} />}
            title="No matching tasks"
            description="No tasks match the current filter."
          />
        ) : (
          <div className="space-y-6">
            {/* Entity-grouped tasks */}
            {Array.from(grouped.groups.entries()).map(([key, groupTasks]) => {
              const first = groupTasks[0];
              const entityLabel = first.entityName || first.entityType || "Unknown";
              const entityLink = entityHref(first.entityType, first.entityId);
              return (
                <div key={key}>
                  <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
                    {entityLink ? (
                      <Link href={entityLink} className="flex items-center gap-1.5 hover:underline">
                        {entityIcon(first.entityType)}
                        {entityLabel}
                      </Link>
                    ) : (
                      <>
                        {entityIcon(first.entityType)}
                        {entityLabel}
                      </>
                    )}
                    <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>
                      ({groupTasks.length})
                    </span>
                  </h2>
                  <div className="space-y-0.5">
                    {groupTasks.map(renderTask)}
                  </div>
                </div>
              );
            })}

            {/* Ungrouped tasks */}
            {grouped.ungrouped.length > 0 && (
              <div>
                {grouped.groups.size > 0 && (
                  <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                    General ({grouped.ungrouped.length})
                  </h2>
                )}
                <div className="space-y-0.5">
                  {grouped.ungrouped.map(renderTask)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
