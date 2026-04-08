"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ScopedChat } from "@/components/scoped-chat";
import { IntelligenceBrief } from "@/components/intelligence-brief";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

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

  if (loading) return <p className="p-6 text-sm text-[var(--color-text-tertiary)]">Loading...</p>;
  if (!account) return <p className="p-6 text-sm text-red-400">Account not found</p>;

  const initial = account.name.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <Breadcrumbs
          items={[
            { label: "Accounts", href: "/accounts" },
            { label: account.name },
          ]}
        />

        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-accent)] text-lg font-bold text-white">
            {initial}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{account.name}</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {account.domain || "No domain"} {account.industry ? `· ${account.industry}` : ""}
            </p>
          </div>
        </div>

        {/* AI Intelligence Brief */}
        <div className="mt-6">
          <IntelligenceBrief accountId={accountId} />
        </div>

        {account.description && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">About</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">{account.description}</p>
          </div>
        )}

        {/* Deals */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Opportunities ({deals.length})
          </h2>
          {deals.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">No deals linked to this account.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {deals.map((deal) => (
                <Card key={deal.id}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{deal.name}</p>
                      <Badge variant="neutral">{deal.stage}</Badge>
                    </div>
                    {deal.value != null && deal.value > 0 && (
                      <p className="mt-0.5 text-xs text-emerald-500">${deal.value.toLocaleString()}</p>
                    )}
                  </CardBody>
                </Card>
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
      <div className="w-full shrink-0 border-t p-6 lg:w-[300px] lg:border-t-0 lg:border-l" style={{ borderColor: "var(--color-border-default)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Account details
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Name</p>
            <p className="text-sm text-[var(--color-text-primary)]">{account.name}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Domain</p>
            <p className="text-sm text-[var(--color-text-primary)]">{account.domain || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Industry</p>
            <p className="text-sm text-[var(--color-text-primary)]">{account.industry || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Size</p>
            <p className="text-sm text-[var(--color-text-primary)]">{account.size || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Revenue</p>
            <p className="text-sm text-[var(--color-text-primary)]">{account.revenue || "—"}</p>
          </div>
          {account.score != null && (
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)]">Score</p>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{Math.round(account.score)}</p>
              {account.scoreReasons && account.scoreReasons.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {account.scoreReasons.slice(0, 3).map((r, i) => (
                    <li key={i} className="text-[10px] text-[var(--color-text-tertiary)]">• {r}</li>
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
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Suggested Contacts
      </h2>
      {!fetched ? (
        <Button
          variant="outline"
          onClick={fetchSuggestions}
          loading={loading}
          className="mt-2 w-full"
        >
          {loading ? "Discovering contacts..." : `Discover contacts at ${accountName}`}
        </Button>
      ) : suggestions.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No suggestions available.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {suggestions.map((s, i) => (
            <Card key={i}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{s.name}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{s.title}</p>
                  </div>
                  <Badge variant="success">Suggested</Badge>
                </div>
                <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{s.reason}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
