"use client";

import { useState } from "react";
import { CheckSquare, Plus } from "lucide-react";

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
  priority: "high" | "medium" | "low";
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");

  function addTask() {
    if (!newTask.trim()) return;
    setTasks([...tasks, { id: crypto.randomUUID(), title: newTask.trim(), dueDate: null, completed: false, priority: "medium" }]);
    setNewTask("");
  }

  function toggleTask(id: string) {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6" style={{ height: "var(--header-height)", borderBottom: "0.5px solid var(--color-border-default)" }}>
        <CheckSquare size={16} style={{ color: "var(--color-text-tertiary)" }} />
        <h1 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Tasks</h1>
        <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{tasks.length}</span>
      </div>

      {/* Add task bar */}
      <div className="flex items-center gap-2 px-6 py-2" style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a task..."
          className="h-8 flex-1 rounded-md px-3 text-[13px] outline-none"
          style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
        />
        <button onClick={addTask} disabled={!newTask.trim()}
          className="flex h-8 items-center gap-1 rounded-md px-3 text-[12px] font-medium text-white disabled:opacity-40"
          style={{ background: "var(--color-accent)" }}>
          <Plus size={13} /> Add
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <CheckSquare size={32} style={{ color: "var(--color-text-muted)" }} />
            <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>No tasks yet</p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Add tasks to track your follow-ups and action items.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div>
                <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
                  Today
                </h2>
                <div className="space-y-0.5">
                  {pending.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 rounded-md px-3 transition-colors"
                      style={{ height: "var(--table-row-height)", borderBottom: "0.5px solid var(--color-border-default)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-muted)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <button onClick={() => toggleTask(task.id)}
                        className="h-4 w-4 rounded"
                        style={{ border: "0.5px solid var(--color-border-strong)" }} />
                      <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {completed.length > 0 && (
              <div>
                <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  Completed ({completed.length})
                </h2>
                <div className="space-y-0.5 opacity-60">
                  {completed.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 rounded-md px-3"
                      style={{ height: "var(--table-row-height)" }}>
                      <button onClick={() => toggleTask(task.id)}
                        className="flex h-4 w-4 items-center justify-center rounded text-[9px]"
                        style={{ background: "var(--color-accent-soft)", border: "0.5px solid var(--color-accent)", color: "var(--color-accent)" }}>
                        ✓
                      </button>
                      <span className="text-[13px] line-through" style={{ color: "var(--color-text-secondary)" }}>{task.title}</span>
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
