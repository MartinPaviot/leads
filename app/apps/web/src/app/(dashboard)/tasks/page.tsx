"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";
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

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

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
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const fetchTasks = useCallback(async () => {
    try {
      setLoadError(false);
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      } else {
        // A 500/401 must not masquerade as "No tasks yet".
        setLoadError(true);
      }
    } catch (e) {
      console.warn("tasks: list fetch failed", e);
      setLoadError(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── CLE-14: result-returning network extractions. These are the SINGLE copy
  //    of each request; both the existing button handlers and the registered
  //    chat actions call them. They surface {ok} so the action layer can report
  //    failure (the buttons can ignore the return — behaviour-preserving). ──
  const createTask = useCallback(async (title: string, priority: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority }),
      });
      if (res.ok) { fetchTasks(); return { ok: true }; }
      return { ok: false, error: "Failed to create the task." };
    } catch (e) {
      console.warn("tasks: add failed", e);
      return { ok: false, error: "Failed to create the task." };
    }
  }, [fetchTasks]);

  const setTaskStatus = useCallback(async (taskId: string, status: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { fetchTasks(); return { ok: true }; }
      return { ok: false, error: "Failed to update the task." };
    } catch (e) {
      console.warn("tasks: toggle failed", e);
      return { ok: false, error: "Failed to update the task." };
    }
  }, [fetchTasks]);

  const setTaskPriority = useCallback(async (taskId: string, priority: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (res.ok) { fetchTasks(); return { ok: true }; }
      return { ok: false, error: "Failed to update the task." };
    } catch (e) {
      console.warn("tasks: priority change failed", e);
      return { ok: false, error: "Failed to update the task." };
    }
  }, [fetchTasks]);

  async function addTask() {
    if (!newTask.trim()) return;
    setSaving(true);
    try {
      const r = await createTask(newTask.trim(), "medium");
      if (r.ok) setNewTask("");
    } finally { setSaving(false); }
  }

  async function toggleTask(id: string, currentStatus: string) {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    await setTaskStatus(id, newStatus);
  }

  async function cyclePriority(id: string, currentPriority: string) {
    const newPriority = PRIORITY_CYCLE[currentPriority] || "medium";
    await setTaskPriority(id, newPriority);
  }

  // ── CLE-14: register this page's actions for the chat live-executor. run()s
  //    reuse the extractions above; live values via refs. ──
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const taskActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "tasks.addTask",
        title: "Add a task",
        description:
          "Create a new task in the list. The title is required; priority defaults to medium. " +
          "Use when the user wants to add a to-do or follow-up.",
        params: z.object({
          title: z.string().min(1),
          priority: z.enum(["low", "medium", "high"]).optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ title, priority }): Promise<PageActionResult> => {
          const t = title.trim();
          if (!t) return errResult("A task title is required.");
          const r = await createTask(t, priority ?? "medium");
          return r.ok ? okResult(`Added task "${t}".`) : errResult(r.error ?? "Failed to create the task.");
        },
      }),
      definePageAction({
        id: "tasks.toggleComplete",
        title: "Complete or reopen a task",
        description:
          "Mark a task done, or reopen it. Pass completed:true/false to set it explicitly, " +
          "otherwise the current status is toggled. Use when the user checks off or reopens a task.",
        params: z.object({
          taskId: z.string().min(1),
          completed: z.boolean().optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ taskId, completed }): Promise<PageActionResult> => {
          const task = tasksRef.current.find((t) => t.id === taskId);
          if (!task) return errResult("That task is not in the current list.");
          const wantDone = completed != null ? completed : task.status !== "completed";
          const status = wantDone ? "completed" : "pending";
          const r = await setTaskStatus(taskId, status);
          if (!r.ok) return errResult(r.error ?? "Failed to update the task.");
          return okResult(wantDone ? "Marked the task done." : "Reopened the task.");
        },
      }),
      definePageAction({
        id: "tasks.cyclePriority",
        title: "Change a task's priority",
        description:
          "Cycle a task's priority through low -> medium -> high -> low. " +
          "Use when the user wants to bump or lower a task's priority.",
        params: z.object({ taskId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ taskId }): Promise<PageActionResult> => {
          const task = tasksRef.current.find((t) => t.id === taskId);
          if (!task) return errResult("That task is not in the current list.");
          const next = PRIORITY_CYCLE[task.priority] ?? "medium";
          const r = await setTaskPriority(taskId, next);
          if (!r.ok) return errResult(r.error ?? "Failed to update the task.");
          return okResult(`Priority set to ${next}.`);
        },
      }),
      definePageAction({
        id: "tasks.setFilter",
        title: "Filter the task list",
        description:
          "Switch the visible task filter: all, due_today, overdue, or completed. " +
          "Use when the user wants to focus the list.",
        params: z.object({ filter: z.enum(["all", "due_today", "overdue", "completed"]) }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ filter }): Promise<PageActionResult> => {
          setFilterTab(filter);
          return okResult(`Showing ${filter} tasks.`);
        },
      }),
      definePageAction({
        id: "tasks.setSort",
        title: "Sort the task list",
        description: "Sort the task list by priority or by due date.",
        params: z.object({ sort: z.enum(["priority", "due_date"]) }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ sort }): Promise<PageActionResult> => {
          setSortMode(sort);
          return okResult(`Sorted by ${sort}.`);
        },
      }),
    ],
    // Stable id set; run() reads live values via refs and calls stable
    // useCallback helpers / setters — registration happens once (CLE-03).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(taskActions);

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
        ) : loadError && tasks.length === 0 ? (
          <EmptyState
            variant="error"
            title="Couldn't load your tasks"
            description="Something went wrong loading your tasks. They're safe — try again."
            actionLabel="Retry"
            onAction={() => { setLoading(true); fetchTasks(); }}
          />
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
