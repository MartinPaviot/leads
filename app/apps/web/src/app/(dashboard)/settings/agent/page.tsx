"use client";

import { useState, useEffect } from "react";

export default function AgentSettingsPage() {
  const [mode, setMode] = useState<"ask" | "auto">("ask");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/workspace")
      .then((r) => r.json())
      .then((data) => {
        if (data.agentApprovalMode) setMode(data.agentApprovalMode);
      })
      .catch(console.error);
  }, []);

  async function handleChange(newMode: "ask" | "auto") {
    setMode(newMode);
    try {
      await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentApprovalMode: newMode }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      console.error("Failed to save");
    }
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Agent</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Control how the LeadSens agent behaves in chat.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Agent permissions</h2>
        <div className="mt-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--color-text-primary)]">Record creation and updates</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Choose whether or not record creation and field updates require approval in chat.
              </p>
            </div>
            <select
              value={mode}
              onChange={(e) => handleChange(e.target.value as "ask" | "auto")}
              className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-1.5 text-sm text-[var(--color-text-primary)]"
            >
              <option value="ask">Ask every time</option>
              <option value="auto">Auto-run</option>
            </select>
          </div>
          {saved && <p className="mt-2 text-xs text-green-400">Saved</p>}
        </div>
      </section>
    </>
  );
}
