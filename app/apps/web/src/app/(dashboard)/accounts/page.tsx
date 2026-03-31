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
  properties: Record<string, unknown> | null;
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
  const [filter, setFilter] = useState<"all" | "tam" | "manual">("all");
  const [scoreAllRunning, setScoreAllRunning] = useState(false);
  const [detectingSignals, setDetectingSignals] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);

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

  async function scoreAll() {
    const unscoredIds = accounts.filter((a) => a.score == null).map((a) => a.id);
    if (unscoredIds.length === 0) return;

    setScoreAllRunning(true);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: unscoredIds }),
      });
      if (res.ok) {
        await fetchAccounts();
      }
    } catch {
      console.error("Scoring failed");
    } finally {
      setScoreAllRunning(false);
    }
  }

  async function detectSignals() {
    const ids = accounts.filter((a) => isEnriched(a)).map((a) => a.id);
    if (ids.length === 0) return;

    setDetectingSignals(true);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: ids }),
      });
      if (res.ok) {
        await fetchAccounts();
      }
    } catch {
      console.error("Signal detection failed");
    } finally {
      setDetectingSignals(false);
    }
  }

  async function handleSemanticSearch() {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/search/tam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), entityType: "company", limit: 20 }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results.map((r: { entityId: string }) => r.entityId));
      }
    } catch {
      console.error("Search failed");
    } finally {
      setSearching(false);
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

  const signalColors: Record<string, string> = {
    hiring: "bg-blue-500/15 text-blue-400",
    funding: "bg-emerald-500/15 text-emerald-400",
    tech_change: "bg-purple-500/15 text-purple-400",
    news: "bg-gray-500/15 text-gray-400",
    expansion: "bg-amber-500/15 text-amber-400",
    leadership_change: "bg-pink-500/15 text-pink-400",
  };

  function getSignals(account: Account): Array<{ type: string; title: string; description: string; relevance: string }> {
    const props = account.properties as Record<string, unknown> | null;
    return (props?.signals as Array<{ type: string; title: string; description: string; relevance: string }>) || [];
  }

  function signalBadges(account: Account) {
    const signals = getSignals(account);
    if (signals.length === 0) return <span className="text-xs text-[#5a5a70]">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {signals.slice(0, 3).map((signal, i) => (
          <span
            key={i}
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium ${signalColors[signal.type] || signalColors.news}`}
            title={`${signal.title}: ${signal.description}`}
          >
            {signal.type.replace("_", " ")}
          </span>
        ))}
        {signals.length > 3 && (
          <span className="text-[9px] text-[#5a5a70]">+{signals.length - 3}</span>
        )}
      </div>
    );
  }

  function isTAM(account: Account): boolean {
    return (account.properties as Record<string, unknown>)?.source === "tam";
  }

  const filteredAccounts = accounts
    .filter((a) => {
      // Source filter
      if (filter === "tam" && !isTAM(a)) return false;
      if (filter === "manual" && isTAM(a)) return false;
      // Text search filter
      if (searchQuery.trim() && !searchResults) {
        const q = searchQuery.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          (a.domain?.toLowerCase().includes(q) ?? false) ||
          (a.industry?.toLowerCase().includes(q) ?? false)
        );
      }
      // Semantic search results
      if (searchResults) {
        return searchResults.includes(a.id);
      }
      return true;
    })
    .sort((a, b) => {
      // If semantic search, sort by search result order
      if (searchResults) {
        return searchResults.indexOf(a.id) - searchResults.indexOf(b.id);
      }
      return (b.score ?? -1) - (a.score ?? -1);
    });

  const unenrichedCount = accounts.filter((a) => !isEnriched(a)).length;
  const tamCount = accounts.filter(isTAM).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
            {tamCount > 0 && ` · ${tamCount} TAM`}
            {unenrichedCount > 0 && ` · ${unenrichedCount} unenriched`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={detectSignals}
            disabled={detectingSignals}
            className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm font-medium text-[#e8e8ed] hover:bg-[#1e1f2a] disabled:opacity-50"
          >
            {detectingSignals ? "Detecting..." : "Detect Signals"}
          </button>
          {accounts.some((a) => a.score == null) && (
            <button
              onClick={scoreAll}
              disabled={scoreAllRunning}
              className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm font-medium text-[#e8e8ed] hover:bg-[#1e1f2a] disabled:opacity-50"
            >
              {scoreAllRunning ? "Scoring..." : "Score All"}
            </button>
          )}
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

      {/* Search bar */}
      <div className="mt-4 flex gap-2">
        <input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!e.target.value.trim()) setSearchResults(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSemanticSearch();
          }}
          placeholder="Search accounts... (Enter for AI search)"
          className="flex-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
        />
        <button
          onClick={handleSemanticSearch}
          disabled={searching || !searchQuery.trim()}
          className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
        >
          {searching ? "Searching..." : "AI Search"}
        </button>
        {searchResults && (
          <button
            onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            className="rounded-lg border border-[#1e1f2a] px-3 py-2 text-sm text-[#8b8ba0] hover:text-[#e8e8ed]"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="mt-3 flex gap-1">
        {(["all", "tam", "manual"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === f
                ? "bg-[#6366f1]/15 text-[#6366f1]"
                : "text-[#5a5a70] hover:text-[#8b8ba0]"
            }`}
          >
            {f === "all" ? "All" : f === "tam" ? "TAM" : "Manual"}
          </button>
        ))}
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
                  <th className="pb-2 pr-4">Signals</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-[#1e1f2a] hover:bg-[#12131a]"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-0.5">
                        {enrichmentIndicator(account)}
                        {isTAM(account) && (
                          <span className="inline-flex w-fit items-center rounded bg-[#6366f1]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#6366f1]">
                            TAM
                          </span>
                        )}
                      </div>
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
                      {signalBadges(account)}
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
