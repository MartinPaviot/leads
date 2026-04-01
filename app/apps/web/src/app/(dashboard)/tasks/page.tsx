"use client";

import { useState } from "react";

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
    setTasks([
      ...tasks,
      {
        id: crypto.randomUUID(),
        title: newTask.trim(),
        dueDate: null,
        completed: false,
        priority: "medium",
      },
    ]);
    setNewTask("");
  }

  function toggleTask(id: string) {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e8e8ed]">Tasks</h1>
          <p className="text-sm text-[#5a5a70]">{tasks.length} tasks</p>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a task..."
          className="flex-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
        />
        <button
          onClick={addTask}
          disabled={!newTask.trim()}
          className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-medium text-[#8b8ba0]">No tasks yet</p>
          <p className="mt-1 text-xs text-[#5a5a70]">
            Add tasks to track your follow-ups and action items.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#5a5a70]">
                Pending ({pending.length})
              </h2>
              <div className="space-y-1">
                {pending.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-3"
                  >
                    <button
                      onClick={() => toggleTask(task.id)}
                      className="h-4 w-4 rounded border border-[#5a5a70] hover:border-[#6366f1]"
                    />
                    <span className="text-sm text-[#e8e8ed]">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#5a5a70]">
                Completed ({completed.length})
              </h2>
              <div className="space-y-1">
                {completed.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-3 opacity-60"
                  >
                    <button
                      onClick={() => toggleTask(task.id)}
                      className="flex h-4 w-4 items-center justify-center rounded border border-[#6366f1] bg-[#6366f1]/20 text-[10px] text-[#6366f1]"
                    >
                      ✓
                    </button>
                    <span className="text-sm text-[#8b8ba0] line-through">{task.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
