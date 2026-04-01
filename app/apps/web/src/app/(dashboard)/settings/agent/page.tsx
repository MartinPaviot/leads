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
      <p className="mt-1 text-sm text-[#8b8ba0]">
        Control how the LeadSens agent behaves in chat.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-[#e8e8ed]">Agent permissions</h2>
        <div className="mt-3 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#e8e8ed]">Record creation and updates</p>
              <p className="text-xs text-[#5a5a70]">
                Choose whether or not record creation and field updates require approval in chat.
              </p>
            </div>
            <select
              value={mode}
              onChange={(e) => handleChange(e.target.value as "ask" | "auto")}
              className="rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-1.5 text-sm text-[#e8e8ed]"
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
