"use client";

import { useState, useEffect } from "react";

export default function WorkspaceSettingsPage() {
  const [name, setName] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/workspace")
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setDomains(data.companyDomains || []);
      })
      .catch(console.error);
  }, []);

  async function saveName() {
    if (!name.trim()) return;
    try {
      await fetch("/api/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      console.error("Failed to save");
    }
  }

  async function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d || domains.includes(d)) return;
    const updated = [...domains, d];
    setDomains(updated);
    setNewDomain("");
    await fetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyDomains: updated }),
    }).catch(console.error);
  }

  async function removeDomain(domain: string) {
    const updated = domains.filter((d) => d !== domain);
    setDomains(updated);
    await fetch("/api/settings/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyDomains: updated }),
    }).catch(console.error);
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Workspace settings</h1>
      <p className="mt-1 text-sm text-[#8b8ba0]">
        Manage settings for your entire workspace.
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <label className="text-sm text-[#8b8ba0]">Workspace name</label>
          <div className="mt-1 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] focus:border-[#6366f1] focus:outline-none"
            />
            <button
              onClick={saveName}
              disabled={!name.trim()}
              className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
            >
              Update
            </button>
          </div>
          {saved && <p className="mt-1 text-xs text-green-400">Saved</p>}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#e8e8ed]">Domains</h2>
          <p className="mt-1 text-sm text-[#5a5a70]">
            These domains will be associated with your company. No new accounts will be
            created for companies with these domains.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {domains.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center gap-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-1 text-sm text-[#e8e8ed]"
              >
                {domain}
                <button
                  onClick={() => removeDomain(domain)}
                  className="text-[#5a5a70] hover:text-red-400"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
              placeholder="Add domain (e.g. yourcompany.com)"
              className="flex-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-[#1e1f2a] pt-6">
          <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-red-900/30 bg-red-950/10 p-4">
            <div>
              <p className="text-sm text-[#e8e8ed]">Delete workspace</p>
              <p className="text-xs text-[#5a5a70]">
                Schedule workspace to be permanently deleted
              </p>
            </div>
            <button className="rounded-lg border border-red-900/50 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950/20">
              Delete workspace
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
