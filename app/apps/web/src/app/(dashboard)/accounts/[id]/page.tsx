"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Users, DollarSign, ClipboardList, Swords } from "lucide-react";
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
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

        {/* Meeting Intel Card (structured extraction from calls) */}
        {(() => {
          const props = (account as any).properties || {};
          const intel = props.meetingIntel as Record<string, unknown> | undefined;
          if (!intel || Object.keys(intel).length <= 2) return null; // skip if only lastExtracted+sourceDeal
          return (
            <div className="mt-4 rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-tertiary)" }}>Meeting Intelligence</p>
              <div className="grid grid-cols-2 gap-2">
                {intel.teamSize != null && (
                  <div className="flex items-center gap-2">
                    <Users size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Team Size</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{String(intel.teamSize)}</p>
                    </div>
                  </div>
                )}
                {intel.budget != null && (
                  <div className="flex items-center gap-2">
                    <DollarSign size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Budget</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{String(intel.budget)}</p>
                    </div>
                  </div>
                )}
                {intel.currentTools != null && (
                  <div className="flex items-center gap-2">
                    <ClipboardList size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Current Tools</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{Array.isArray(intel.currentTools) ? (intel.currentTools as string[]).join(", ") : String(intel.currentTools)}</p>
                    </div>
                  </div>
                )}
                {intel.competitors != null && (
                  <div className="flex items-center gap-2">
                    <Swords size={14} style={{ color: "var(--color-text-tertiary)" }} />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Competitors</p>
                      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{Array.isArray(intel.competitors) ? (intel.competitors as string[]).join(", ") : String(intel.competitors)}</p>
                    </div>
                  </div>
                )}
              </div>
              {intel.lastExtracted != null && (
                <p className="mt-2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  Extracted {new Date(intel.lastExtracted as string).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })()}

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
          {([
            { key: "name", label: "Name", value: account.name },
            { key: "domain", label: "Domain", value: account.domain },
            { key: "industry", label: "Industry", value: account.industry },
            { key: "size", label: "Size", value: account.size },
            { key: "revenue", label: "Revenue", value: account.revenue },
          ] as Array<{ key: string; label: string; value: string | null }>).map((field) => (
            <div key={field.key}>
              <p className="text-xs text-[var(--color-text-tertiary)]">{field.label}</p>
              {editingField === field.key ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    autoFocus
                    className="flex-1 rounded border px-2 py-0.5 text-sm outline-none"
                    style={{ borderColor: "var(--color-accent)", color: "var(--color-text-primary)", background: "var(--color-bg-card)" }}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        await fetch(`/api/accounts/${accountId}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ [field.key]: editValue || null }),
                        });
                        setAccount((prev) => prev ? { ...prev, [field.key]: editValue || null } : prev);
                        setEditingField(null);
                      } else if (e.key === "Escape") {
                        setEditingField(null);
                      }
                    }}
                    onBlur={() => setEditingField(null)}
                  />
                </div>
              ) : (
                <p
                  className="text-sm cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-[var(--color-bg-hover)]"
                  style={{ color: field.value ? "var(--color-text-primary)" : "var(--color-text-muted)" }}
                  onClick={() => { setEditingField(field.key); setEditValue(field.value || ""); }}
                  title="Click to edit"
                >
                  {field.value || `Set ${field.label.toLowerCase()}`}
                </p>
              )}
            </div>
          ))}
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
