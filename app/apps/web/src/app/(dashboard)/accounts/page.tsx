"use client";

import { useState, useEffect, useCallback } from "react";

interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  revenue: string | null;
  description: string | null;
  score: number | null;
  scoreReasons: string[] | null;
}

type EnrichStatus = "idle" | "enriching" | "done" | "failed";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({});
  const [enrichAllRunning, setEnrichAllRunning] = useState(false);

  const fetchAccounts = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), domain: newDomain.trim() || undefined }),
      });
      if (res.ok) {
        setNewName("");
        setNewDomain("");
        setShowCreate(false);
        fetchAccounts();
      }
    } catch {
      console.error("Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function enrichSingle(id: string) {
    setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: [id] }),
      });
      if (res.ok) {
        setEnrichStatus((prev) => ({ ...prev, [id]: "done" }));
        await fetchAccounts();
      } else {
        setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
      }
    } catch {
      setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
    }
  }

  async function enrichAll() {
    const unenriched = accounts.filter((a) => !a.industry && !a.description);
    if (unenriched.length === 0) return;

    setEnrichAllRunning(true);
    const ids = unenriched.map((a) => a.id);
    for (const id of ids) {
      setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    }

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: ids }),
      });
      if (res.ok) {
        const data = await res.json();
        for (const id of ids) {
          setEnrichStatus((prev) => ({ ...prev, [id]: "done" }));
        }
        await fetchAccounts();
        console.log(`Enriched: ${data.enriched}, Failed: ${data.failed}`);
      } else {
        for (const id of ids) {
          setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
        }
      }
    } catch {
      for (const id of ids) {
        setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
      }
    } finally {
      setEnrichAllRunning(false);
    }
  }

  function isEnriched(account: Account): boolean {
    return !!(account.industry && account.description);
  }

  function enrichmentIndicator(account: Account) {
    const status = enrichStatus[account.id];
    if (status === "enriching") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Enriching...
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
          Failed
        </span>
      );
    }
    if (isEnriched(account)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Enriched
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[#5a5a70]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#5a5a70]" />
        Pending
      </span>
    );
  }

  function scoreDisplay(account: Account) {
    if (account.score == null) return "—";
    const s = Math.round(account.score);
    let color = "text-[#5a5a70]";
    if (s >= 80) color = "text-emerald-400";
    else if (s >= 60) color = "text-amber-400";
    else if (s >= 40) color = "text-orange-400";
    else color = "text-red-400";

    const reasons = account.scoreReasons;
    return (
      <span className={`font-medium ${color}`} title={reasons?.join("; ") || ""}>
        {s}
      </span>
    );
  }

  const unenrichedCount = accounts.filter((a) => !isEnriched(a)).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
            {unenrichedCount > 0 && ` · ${unenrichedCount} unenriched`}
          </p>
        </div>
        <div className="flex gap-2">
          {unenrichedCount > 0 && (
            <button
              onClick={enrichAll}
              disabled={enrichAllRunning}
              className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm font-medium text-[#e8e8ed] hover:bg-[#1e1f2a] disabled:opacity-50"
            >
              {enrichAllRunning ? "Enriching..." : `Enrich All (${unenrichedCount})`}
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
          >
            + Create account
          </button>
        </div>
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
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="Domain (optional)"
            className="w-48 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
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
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[#1e1f2a]" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[#8b8ba0]">No accounts</p>
            <p className="mt-1 text-sm text-[#5a5a70]">
              Create accounts or import contacts to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#1e1f2a] text-[11px] uppercase tracking-wider text-[#5a5a70]">
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Account</th>
                  <th className="pb-2 pr-4">Domain</th>
                  <th className="pb-2 pr-4">Industry</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Revenue</th>
                  <th className="pb-2 pr-4">Score</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-[#1e1f2a] hover:bg-[#12131a]"
                  >
                    <td className="py-3 pr-4">
                      {enrichmentIndicator(account)}
                    </td>
                    <td className="py-3 pr-4">
                      <div>
                        <span className="font-medium text-[#e8e8ed]">{account.name}</span>
                        {account.description && (
                          <p className="mt-0.5 truncate text-xs text-[#5a5a70]" title={account.description}>
                            {account.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-[#8b8ba0]">
                      {account.domain || "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#8b8ba0]">
                      {account.industry || "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#8b8ba0]">
                      {account.size || "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#8b8ba0]">
                      {account.revenue || "—"}
                    </td>
                    <td className="py-3 pr-4">
                      {scoreDisplay(account)}
                    </td>
                    <td className="py-3 pr-4">
                      {!isEnriched(account) && enrichStatus[account.id] !== "enriching" && (
                        <button
                          onClick={() => enrichSingle(account.id)}
                          className="rounded px-2 py-1 text-xs text-[#6366f1] hover:bg-[#6366f1]/10"
                        >
                          Enrich
                        </button>
                      )}
                      {enrichStatus[account.id] === "enriching" && (
                        <span className="text-xs text-amber-400">...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
