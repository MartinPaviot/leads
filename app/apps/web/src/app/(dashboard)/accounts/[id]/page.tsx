"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ScopedChat } from "@/components/scoped-chat";

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

interface Deal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
}

export default function AccountDetailPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [account, setAccount] = useState<Account | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/accounts/${accountId}`);
        if (res.ok) {
          const data = await res.json();
          setAccount(data.account);
          setDeals(data.deals || []);
        }
      } catch {
        console.error("Failed to load account");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  if (loading) return <p className="p-6 text-sm text-[#5a5a70]">Loading...</p>;
  if (!account) return <p className="p-6 text-sm text-red-400">Account not found</p>;

  const initial = account.name.charAt(0).toUpperCase();

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <Link href="/accounts" className="text-xs text-[#5a5a70] hover:text-[#8b8ba0]">
          ← Back to Accounts
        </Link>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#6366f1] text-lg font-bold text-white">
            {initial}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{account.name}</h1>
            <p className="text-sm text-[#8b8ba0]">
              {account.domain || "No domain"} {account.industry ? `· ${account.industry}` : ""}
            </p>
          </div>
        </div>

        {account.description && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">About</h2>
            <p className="mt-2 text-sm text-[#8b8ba0] leading-relaxed">{account.description}</p>
          </div>
        )}

        {/* Deals */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
            Opportunities ({deals.length})
          </h2>
          {deals.length === 0 ? (
            <p className="mt-2 text-sm text-[#5a5a70]">No deals linked to this account.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {deals.map((deal) => (
                <div key={deal.id} className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#e8e8ed]">{deal.name}</p>
                    <span className="text-xs text-[#5a5a70] uppercase">{deal.stage}</span>
                  </div>
                  {deal.value != null && deal.value > 0 && (
                    <p className="mt-0.5 text-xs text-[#22c55e]">${deal.value.toLocaleString()}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* G3: Suggested Contacts */}
        <SuggestedContacts accountId={accountId} accountName={account.name} />

        {/* Scoped chat */}
        <div className="mt-8">
          <ScopedChat
            contextType="account"
            contextId={accountId}
            contextLabel={account.name}
          />
        </div>
      </div>

      {/* Right panel */}
      <div className="w-[300px] border-l border-[#1e1f2a] p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Account details
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-[#5a5a70]">Name</p>
            <p className="text-sm text-[#e8e8ed]">{account.name}</p>
          </div>
          <div>
            <p className="text-xs text-[#5a5a70]">Domain</p>
            <p className="text-sm text-[#e8e8ed]">{account.domain || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#5a5a70]">Industry</p>
            <p className="text-sm text-[#e8e8ed]">{account.industry || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#5a5a70]">Size</p>
            <p className="text-sm text-[#e8e8ed]">{account.size || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#5a5a70]">Revenue</p>
            <p className="text-sm text-[#e8e8ed]">{account.revenue || "—"}</p>
          </div>
          {account.score != null && (
            <div>
              <p className="text-xs text-[#5a5a70]">Score</p>
              <p className="text-sm font-medium text-[#e8e8ed]">{Math.round(account.score)}</p>
              {account.scoreReasons && account.scoreReasons.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {account.scoreReasons.slice(0, 3).map((r, i) => (
                    <li key={i} className="text-[10px] text-[#5a5a70]">• {r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// G3: Contact Auto-Suggestion component
function SuggestedContacts({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [suggestions, setSuggestions] = useState<Array<{
    name: string;
    title: string;
    reason: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function fetchSuggestions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/suggested-contacts`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
        Suggested Contacts
      </h2>
      {!fetched ? (
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="mt-2 w-full rounded-lg border border-dashed border-[#1e1f2a] px-4 py-3 text-sm text-[#6366f1] hover:border-[#6366f1] hover:bg-[#6366f1]/5"
        >
          {loading ? "Discovering contacts..." : `Discover contacts at ${accountName}`}
        </button>
      ) : suggestions.length === 0 ? (
        <p className="mt-2 text-xs text-[#5a5a70]">No suggestions available.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#e8e8ed]">{s.name}</p>
                  <p className="text-xs text-[#8b8ba0]">{s.title}</p>
                </div>
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                  Suggested
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#5a5a70]">{s.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
