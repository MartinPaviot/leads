"use client";

import { useState, useEffect } from "react";

interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  revenue: string | null;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch {
      console.error("Failed to fetch accounts");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName("");
        setShowCreate(false);
        fetchAccounts();
      }
    } catch {
      console.error("Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
        >
          + Create account
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Company name"
            autoFocus
            className="flex-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm text-[#8b8ba0] hover:text-[#e8e8ed]"
          >
            Cancel
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-[#5a5a70]">Loading...</p>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[#8b8ba0]">No accounts</p>
            <p className="mt-1 text-sm text-[#5a5a70]">
              Create accounts or import contacts to get started.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#1e1f2a] text-[11px] uppercase tracking-wider text-[#5a5a70]">
                <th className="pb-2 pr-4">Account</th>
                <th className="pb-2 pr-4">Domain</th>
                <th className="pb-2 pr-4">Industry</th>
                <th className="pb-2 pr-4">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-[#1e1f2a] hover:bg-[#12131a]"
                >
                  <td className="py-3 pr-4 font-medium text-[#e8e8ed]">
                    {account.name}
                  </td>
                  <td className="py-3 pr-4 text-[#8b8ba0]">
                    {account.domain || "—"}
                  </td>
                  <td className="py-3 pr-4 text-[#8b8ba0]">
                    {account.industry || "—"}
                  </td>
                  <td className="py-3 pr-4 text-[#8b8ba0]">
                    {account.revenue || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
