"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckSquare, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/input";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  priority: string;
  entityType: string | null;
  entityId: string | null;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch { /* */ }
    finally { setLoading(false); }
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
    } catch { /* */ }
    finally { setSaving(false); }
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
    } catch { /* */ }
  }

  const pending = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<CheckSquare size={15} />} title="Tasks" subtitle={`${tasks.length}`} />

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
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div>
                <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
                  Pending ({pending.length})
                </h2>
                <div className="space-y-0.5">
                  {pending.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-md px-3 transition-colors"
                      style={{ height: "var(--table-row-height)", borderBottom: "1px solid var(--color-border-default)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <Checkbox
                        checked={false}
                        onChange={() => toggleTask(task.id, task.status)}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{task.title}</span>
                      </div>
                      {task.priority === "high" && (
                        <Badge variant="error" size="sm">High</Badge>
                      )}
                      {task.priority === "medium" && (
                        <Badge variant="warning" size="sm">Medium</Badge>
                      )}
                      {task.dueDate && (
                        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {completed.length > 0 && (
              <div>
                <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Completed ({completed.length})
                </h2>
                <div className="space-y-0.5 opacity-60">
                  {completed.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-md px-3"
                      style={{ height: "var(--table-row-height)" }}
                    >
                      <Checkbox
                        checked={true}
                        onChange={() => toggleTask(task.id, task.status)}
                      />
                      <span className="text-[13px] line-through" style={{ color: "var(--color-text-secondary)" }}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
