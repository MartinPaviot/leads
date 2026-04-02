"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Search, Plus, Zap, Target, Radio, X } from "lucide-react";
import { getLifecycleStyle, formatScore } from "@/lib/ui-utils";
import { SlideOver, PropertyRow } from "@/components/slide-over";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/custom-fields";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, PropertyBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";

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
  const [activeSignalPopover, setActiveSignalPopover] = useState<string | null>(null);
  const [slideOverAccount, setSlideOverAccount] = useState<Account | null>(null);
  const { fields: customFields } = useCustomFields("company");

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

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
      if (res.ok) { setNewName(""); setNewDomain(""); setShowCreate(false); fetchAccounts(); }
    } catch { /* */ } finally { setCreating(false); }
  }

  async function enrichSingle(id: string) {
    setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    try {
      const res = await fetch("/api/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: [id] }) });
      setEnrichStatus((prev) => ({ ...prev, [id]: res.ok ? "done" : "failed" }));
      if (res.ok) await fetchAccounts();
    } catch { setEnrichStatus((prev) => ({ ...prev, [id]: "failed" })); }
  }

  async function enrichAll() {
    const unenriched = accounts.filter((a) => !a.industry && !a.description);
    if (unenriched.length === 0) return;
    setEnrichAllRunning(true);
    const ids = unenriched.map((a) => a.id);
    for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    try {
      const res = await fetch("/api/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: ids }) });
      for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: res.ok ? "done" : "failed" }));
      if (res.ok) await fetchAccounts();
    } catch { for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "failed" })); }
    finally { setEnrichAllRunning(false); }
  }

  async function scoreAll() {
    const ids = accounts.filter((a) => a.score == null).map((a) => a.id);
    if (ids.length === 0) return;
    setScoreAllRunning(true);
    try {
      const res = await fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: ids }) });
      if (res.ok) await fetchAccounts();
    } catch { /* */ } finally { setScoreAllRunning(false); }
  }

  async function detectSignals() {
    const ids = accounts.filter((a) => isEnriched(a)).map((a) => a.id);
    if (ids.length === 0) return;
    setDetectingSignals(true);
    try {
      const res = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: ids }) });
      if (res.ok) await fetchAccounts();
    } catch { /* */ } finally { setDetectingSignals(false); }
  }

  async function handleSemanticSearch() {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await fetch("/api/search/tam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: searchQuery.trim(), entityType: "company", limit: 20 }) });
      if (res.ok) { const data = await res.json(); setSearchResults(data.results.map((r: { entityId: string }) => r.entityId)); }
    } catch { /* */ } finally { setSearching(false); }
  }

  function isEnriched(account: Account): boolean { return !!(account.industry && account.description); }
  function isTAM(account: Account): boolean { return (account.properties as Record<string, unknown>)?.source === "tam"; }
  function getLifecycleStage(account: Account): string { return ((account.properties as Record<string, unknown>)?.lifecycleStage as string) || "new"; }

  interface Signal { type: string; title: string; description: string; relevance: string; reasoning?: string; sources?: Array<{ url: string; title: string }>; }
  function getSignals(account: Account): Signal[] { return ((account.properties as Record<string, unknown>)?.signals as Signal[]) || []; }

  // Legacy custom bool columns (kept for backward compatibility with existing signal data)
  const [customBoolColumns] = useState<string[]>(["Common Investor?", "Sales-led?"]);
  function getCustomBool(account: Account, column: string): boolean | null {
    const customs = (account.properties as Record<string, unknown>)?.customBools as Record<string, boolean> | undefined;
    return customs?.[column] ?? null;
  }

  /** Render a custom field cell value */
  function renderCustomFieldCell(account: Account, field: CustomFieldDef) {
    const value = getCustomFieldValue(account.properties, field.id);
    if (value == null || value === "") {
      return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
    }
    if (field.type === "single_select" || field.type === "multi_select") {
      const values = Array.isArray(value) ? value : [value];
      return (
        <div className="flex flex-wrap gap-0.5">
          {values.map((v, i) => (
            <PropertyBadge key={i} value={String(v)} />
          ))}
        </div>
      );
    }
    if (field.type === "url") {
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer"
          className="text-[12px] hover:underline" style={{ color: "var(--color-accent)" }}>
          {String(value).replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}
        </a>
      );
    }
    return (
      <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
        {formatFieldValue(value, field.type)}
      </span>
    );
  }

  const filteredAccounts = accounts
    .filter((a) => {
      if (filter === "tam" && !isTAM(a)) return false;
      if (filter === "manual" && isTAM(a)) return false;
      if (searchQuery.trim() && !searchResults) {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.domain?.toLowerCase().includes(q) ?? false) || (a.industry?.toLowerCase().includes(q) ?? false);
      }
      if (searchResults) return searchResults.includes(a.id);
      return true;
    })
    .sort((a, b) => searchResults ? searchResults.indexOf(a.id) - searchResults.indexOf(b.id) : (b.score ?? -1) - (a.score ?? -1));

  const unenrichedCount = accounts.filter((a) => !isEnriched(a)).length;
  const tamCount = accounts.filter(isTAM).length;

  // G27: Collect unique signal types across all accounts for individual columns
  const signalTypeColumns = Array.from(
    new Set(accounts.flatMap((a) => getSignals(a).map((s) => s.type)))
  ).slice(0, 5); // Cap at 5 signal columns to avoid table overflow

  function accountHasSignalType(account: Account, signalType: string): Signal | null {
    return getSignals(account).find((s) => s.type === signalType) || null;
  }

  // === RENDER ===
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      {/* Page header */}
      <PageHeader
        icon={<Building2 size={16} />}
        title="Accounts"
        subtitle={`${accounts.length}`}
      >
        <Button
          variant="outline"
          size="sm"
          icon={<Radio size={13} />}
          onClick={detectSignals}
          disabled={detectingSignals}
          loading={detectingSignals}
        >
          {detectingSignals ? "Detecting..." : "Signals"}
        </Button>
        {accounts.some((a) => a.score == null) && (
          <Button
            variant="outline"
            size="sm"
            icon={<Target size={13} />}
            onClick={scoreAll}
            disabled={scoreAllRunning}
            loading={scoreAllRunning}
          >
            {scoreAllRunning ? "Scoring..." : "Score"}
          </Button>
        )}
        {unenrichedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            icon={<Zap size={13} />}
            onClick={enrichAll}
            disabled={enrichAllRunning}
            loading={enrichAllRunning}
          >
            {enrichAllRunning ? "Enriching..." : `Enrich (${unenrichedCount})`}
          </Button>
        )}
        <Button
          variant="gradient"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => setShowCreate(true)}
        >
          Create account
        </Button>
      </PageHeader>

      {/* Filter bar */}
      <FilterBar>
        {/* Filter tabs */}
        <div className="flex gap-0.5">
          {(["all", "tam", "manual"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: filter === f ? "var(--color-accent-soft)" : "transparent",
                color: filter === f ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {f === "all" ? "All" : f === "tam" ? `TAM (${tamCount})` : "Manual"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5" style={{ color: "var(--color-text-muted)" }} />
            <Input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSemanticSearch(); }}
              placeholder="Search accounts..."
              className="!h-7 w-52 !pl-8 !pr-2 !text-[12px]"
            />
          </div>
          {searchResults && (
            <Button
              variant="icon"
              size="sm"
              onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </FilterBar>

      {/* Create form modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create account"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={(e) => handleCreate(e as unknown as React.FormEvent)}
              disabled={creating || !newName.trim()}
              loading={creating}
            >
              Create
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Company name"
            label="Name"
            autoFocus
          />
          <Input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="example.com"
            label="Domain"
          />
        </form>
      </Modal>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton
            rows={8}
            cols={8 + signalTypeColumns.length + customBoolColumns.length + customFields.length}
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<Building2 size={24} />}
            title="No accounts"
            description="Create accounts or import contacts to get started."
            actionLabel="Create account"
            onAction={() => setShowCreate(true)}
            actionVariant="gradient"
          />
        ) : (
          <table className="ls-table">
            <thead>
              <tr>
                {["", "Account", "Domain", "Industry", "Size", "Revenue", "Stage", "Score",
                  ...signalTypeColumns.map((t) => t.replace(/_/g, " ")),
                  ...customBoolColumns,
                  ...customFields.map((f) => f.name),
                  ""].map((col, i) => (
                  <th key={i}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => {
                const lc = getLifecycleStage(account);
                const lcStyle = getLifecycleStyle(lc);
                const signals = getSignals(account);

                return (
                  <tr key={account.id}>
                    {/* Status */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        {enrichStatus[account.id] === "enriching" ? (
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--color-warning)" }} />
                        ) : isEnriched(account) ? (
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
                        ) : enrichStatus[account.id] === "failed" ? (
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-error)" }} />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-text-muted)" }} />
                        )}
                        {isTAM(account) && (
                          <Badge variant="info" size="sm">TAM</Badge>
                        )}
                      </div>
                    </td>

                    {/* Account name with logo */}
                    <td>
                      <div className="flex items-center gap-2">
                        {account.domain ? (
                          <img
                            src={`https://logo.clearbit.com/${account.domain}`}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded"
                            style={{ background: "var(--color-bg-hover)" }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-semibold"
                            style={{ background: "var(--color-bg-emphasis)", color: "var(--color-text-tertiary)" }}
                          >
                            {account.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <button
                            onClick={() => setSlideOverAccount(account)}
                            className="text-left text-[13px] font-medium transition-colors hover:underline"
                            style={{ color: "var(--color-text-primary)" }}>
                            {account.name}
                          </button>
                          {account.description && (
                            <p className="mt-0.5 max-w-[180px] truncate text-[11px]"
                              style={{ color: "var(--color-text-tertiary)" }} title={account.description}>
                              {account.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Domain */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {account.domain || "—"}
                    </td>

                    {/* Industry -- auto-colored badge */}
                    <td>
                      {account.industry ? (
                        <PropertyBadge value={account.industry} />
                      ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>

                    {/* Size */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {account.size || "—"}
                    </td>

                    {/* Revenue */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {account.revenue || "—"}
                    </td>

                    {/* Lifecycle stage */}
                    <td>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                        style={{ background: lcStyle.bg, color: lcStyle.text }}>
                        {lc}
                      </span>
                    </td>

                    {/* Score */}
                    <td>
                      {(() => {
                        const scoreInfo = formatScore(account.score);
                        if (!scoreInfo) return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
                        return (
                          <span className="flex items-center gap-1" title={account.scoreReasons?.join("; ") || ""}>
                            <span className="text-[12px] font-bold" style={{ color: scoreInfo.color }}>{scoreInfo.grade}</span>
                            {scoreInfo.icon && <span className="text-[11px]">{scoreInfo.icon}</span>}
                            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{scoreInfo.heat}</span>
                          </span>
                        );
                      })()}
                    </td>

                    {/* G27: Individual signal type columns */}
                    {signalTypeColumns.map((sigType) => {
                      const signal = accountHasSignalType(account, sigType);
                      const popoverId = `${account.id}-sig-${sigType}`;
                      return (
                        <td key={sigType}>
                          {signal ? (
                            <span className="relative">
                              <button onClick={(e) => { e.stopPropagation(); setActiveSignalPopover(activeSignalPopover === popoverId ? null : popoverId); }}
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
                                Yes
                              </button>
                              {activeSignalPopover === popoverId && (
                                <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg p-3"
                                  style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-moderate)", boxShadow: "var(--shadow-floating)" }}>
                                  <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[11px] font-medium" style={{ color: "var(--color-text-primary)" }}>{signal.title}</span>
                                    <span className="text-[10px] font-semibold uppercase"
                                      style={{ color: signal.relevance === "high" ? "var(--color-success)" : signal.relevance === "medium" ? "var(--color-warning)" : "var(--color-text-tertiary)" }}>
                                      {signal.relevance}
                                    </span>
                                  </div>
                                  <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{signal.description}</p>
                                  {signal.reasoning && (
                                    <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Reasoning</p>
                                      <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{signal.reasoning}</p>
                                    </div>
                                  )}
                                  {signal.sources && signal.sources.length > 0 && (
                                    <div className="mt-2 space-y-1 pt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Sources</p>
                                      {signal.sources.map((src, si) => (
                                        <a key={si} href={src.url} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1.5 text-[11px] hover:underline" style={{ color: "var(--color-accent)" }}>
                                          <span className="shrink-0">&#8599;</span>
                                          <span className="truncate">{src.title}</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  <button onClick={(e) => { e.stopPropagation(); setActiveSignalPopover(null); }}
                                    className="mt-2 w-full text-center text-[10px] transition-colors"
                                    style={{ color: "var(--color-text-muted)" }}>
                                    Close
                                  </button>
                                </div>
                              )}
                            </span>
                          ) : (
                            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Custom bool columns */}
                    {customBoolColumns.map((col) => {
                      const val = getCustomBool(account, col);
                      return (
                        <td key={col} className="text-[11px] font-medium">
                          {val === null ? (
                            <span style={{ color: "var(--color-text-muted)" }}>—</span>
                          ) : val ? (
                            <Badge variant="success" size="sm">Yes</Badge>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)" }}>No</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Custom fields from data model */}
                    {customFields.map((field) => (
                      <td key={field.id}>
                        {renderCustomFieldCell(account, field)}
                      </td>
                    ))}

                    {/* Actions */}
                    <td className="actions">
                      {!isEnriched(account) && enrichStatus[account.id] !== "enriching" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => enrichSingle(account.id)}
                          className="!px-2 !py-0.5"
                        >
                          Enrich
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Account detail slide-over */}
      <SlideOver
        open={!!slideOverAccount}
        onClose={() => setSlideOverAccount(null)}
        title={slideOverAccount?.name || ""}
        subtitle={slideOverAccount?.domain || undefined}
        expandHref={slideOverAccount ? `/accounts/${slideOverAccount.id}` : undefined}
      >
        {slideOverAccount && (() => {
          const a = slideOverAccount;
          const scoreInfo = formatScore(a.score);
          const lc = ((a.properties as Record<string, unknown>)?.lifecycleStage as string) || "new";
          const lcStyle = getLifecycleStyle(lc);
          return (
            <div>
              <PropertyRow label="Domain" value={a.domain} />
              <PropertyRow label="Industry" value={a.industry} />
              <PropertyRow label="Size" value={a.size} />
              <PropertyRow label="Revenue" value={a.revenue} />
              <PropertyRow label="Stage" value={
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                  style={{ background: lcStyle.bg, color: lcStyle.text }}>
                  {lc}
                </span>
              } />
              <PropertyRow label="Score" value={
                scoreInfo ? (
                  <span className="flex items-center gap-1">
                    <span className="font-bold" style={{ color: scoreInfo.color }}>{scoreInfo.grade}</span>
                    {scoreInfo.icon && <span>{scoreInfo.icon}</span>}
                    <span style={{ color: "var(--color-text-tertiary)" }}>{scoreInfo.heat}</span>
                  </span>
                ) : "—"
              } />
              {/* Custom fields in slide-over */}
              {customFields.length > 0 && (
                <div className="mt-3 pt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    Custom fields
                  </span>
                  <div className="mt-1">
                    {customFields.map((field) => (
                      <PropertyRow key={field.id} label={field.name}
                        value={formatFieldValue(getCustomFieldValue(a.properties, field.id), field.type)} />
                    ))}
                  </div>
                </div>
              )}
              {a.description && (
                <div className="mt-3">
                  <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Description</span>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{a.description}</p>
                </div>
              )}
              {a.scoreReasons && a.scoreReasons.length > 0 && (
                <div className="mt-3">
                  <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Score Criteria</span>
                  <ul className="mt-1 space-y-0.5">
                    {a.scoreReasons.map((reason, i) => (
                      <li key={i} className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>&#8226; {reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>
    </div>
  );
}
