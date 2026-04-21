"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Building2, Search, Plus, Zap, Target, Radio, X, Globe, Factory, Ruler, DollarSign, GitBranch, Gauge, ExternalLink, Clock, Users, ChevronRight, ChevronDown, Loader2, type LucideIcon } from "lucide-react";

function LinkedInIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}
import { getLifecycleStyle, formatScore } from "@/lib/ui-utils";
import { SlideOver, PropertyRow } from "@/components/slide-over";
import { CompanyLogo } from "@/components/ui/company-logo";
import { IntelligenceBrief } from "@/components/intelligence-brief";
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
import { useToast } from "@/components/ui/toast";
import { chunkedBulkCall } from "@/lib/chunk-bulk";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { SmartSearchBar, ActiveFiltersChips } from "@/components/ui/smart-search-bar";
import { applyFilters } from "@/lib/filters";
import type { FilterCondition } from "@/lib/filters";

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
  lastInteraction: { date: string; summary: string | null } | null;
}

type EnrichStatus = "idle" | "enriching" | "done" | "failed";

export default function AccountsPage() {
  const { toast } = useToast();
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
  // A4: keep similarity score per result so we can surface "73% match"
  // chips inline. Map preserves insertion order (== rank order from the
  // semantic search endpoint), and lookup is O(1) for the row sort.
  const [searchResults, setSearchResults] = useState<Map<string, number> | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeSignalPopover, setActiveSignalPopover] = useState<string | null>(null);
  const [signalPopoverTab, setSignalPopoverTab] = useState<"reasoning" | "sources">("reasoning");
  const [slideOverAccount, setSlideOverAccount] = useState<Account | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  // Smart Search — NL query translated into FilterCondition[] via LLM.
  // Stacks with the existing tab `filter`, text `searchQuery`, and semantic
  // `searchResults`. Cleared on tab switch is intentional: tabs partition
  // the dataset differently and a smart filter extracted for "prospects"
  // likely doesn't apply to "manual".
  const [smartFilters, setSmartFilters] = useState<FilterCondition[]>([]);
  const [smartMeta, setSmartMeta] = useState<{ reasoning: string; unmatched: string[] } | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [expandedContacts, setExpandedContacts] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; title: string | null; email: string | null; status?: string }>>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const { fields: customFields } = useCustomFields("company");
  // Warm-intro paths from the relationship graph (primitive ②).
  // Keyed by company.id → list of { viaUserId, viaUserName, contactName, strength, ... }.
  const [warmPathsByCompany, setWarmPathsByCompany] = useState<Record<string, Array<{
    viaUserId: string;
    viaUserName: string;
    contactId: string;
    contactName: string;
    contactTitle: string | null;
    strength: number;
  }>>>({});
  const [warmPathsPopoverId, setWarmPathsPopoverId] = useState<string | null>(null);
  const warmPathsPopoverRef = useRef<HTMLDivElement>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      // Load all accounts with pagination
      let allAccounts: Account[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(`/api/accounts?pageSize=200&page=${page}`);
        if (!res.ok) break;
        const data = await res.json();
        const batch = data.accounts || [];
        allAccounts = [...allAccounts, ...batch];
        hasMore = batch.length === 200 && allAccounts.length < (data.pagination?.total || Infinity);
        page++;
      }
      setAccounts(allAccounts);
    } catch (e) {
      console.warn("accounts: list fetch failed", e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Fetch warm-intro paths in a single batched call once accounts
  // are loaded. Keeps the "Connected to" column off the critical
  // render path and avoids N+1 requests.
  useEffect(() => {
    if (accounts.length === 0) return;
    const ids = accounts.map((a) => a.id).filter(Boolean);
    if (ids.length === 0) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/warm-paths?companyIds=${ids.join(",")}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json() as { pathsByCompany?: Record<string, typeof warmPathsByCompany[string]> };
        if (data.pathsByCompany) setWarmPathsByCompany(data.pathsByCompany);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          console.warn("accounts: warm-paths fetch failed (non-blocking)", err);
        }
      }
    })();
    return () => controller.abort();
  }, [accounts]);

  // Close signal popover on outside click
  const signalPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeSignalPopover) return;
    function h(e: MouseEvent) {
      if (signalPopoverRef.current && !signalPopoverRef.current.contains(e.target as Node)) {
        setActiveSignalPopover(null);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [activeSignalPopover]);

  // Close warm-paths popover on outside click
  useEffect(() => {
    if (!warmPathsPopoverId) return;
    function h(e: MouseEvent) {
      if (warmPathsPopoverRef.current && !warmPathsPopoverRef.current.contains(e.target as Node)) {
        setWarmPathsPopoverId(null);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [warmPathsPopoverId]);

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
        setNewName(""); setNewDomain(""); setShowCreate(false); fetchAccounts();
      } else {
        toast("Failed to create account", "error");
      }
    } catch (e) {
      toast("Failed to create account", "error");
      console.warn("accounts: create failed", e);
    } finally { setCreating(false); }
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
      // Server caps at 20 ids per call. Chunk client-side so every selected
      // account is actually enriched instead of silently dropped.
      const result = await chunkedBulkCall({
        ids,
        endpoint: "/api/enrich",
        buildPayload: (chunk) => ({ companyIds: chunk }),
        onProgress: (done, total) => {
          toast(`Enriching ${done} / ${total} accounts…`, "info");
        },
      });
      // Per-id status: ids belonging to failed chunks are marked failed; the rest done.
      const failedIds = new Set(result.errors.flatMap((e) => e.ids));
      setEnrichStatus((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = failedIds.has(id) ? "failed" : "done";
        return next;
      });
      if (result.succeeded > 0) await fetchAccounts();
      if (result.failed === 0) {
        toast(`Enriched ${result.succeeded} accounts.`, "success");
      } else if (result.succeeded > 0) {
        toast(`Enriched ${result.succeeded} of ${result.total}. ${result.failed} failed.`, "warning");
        console.warn("accounts: enrichAll partial failure", result.errors);
      } else {
        toast(`Failed to enrich accounts.`, "error");
        console.warn("accounts: enrichAll all chunks failed", result.errors);
      }
    } catch (e) {
      for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
      toast("Bulk enrichment failed.", "error");
      console.warn("accounts: enrichAll crashed", e);
    } finally { setEnrichAllRunning(false); }
  }

  async function scoreAll() {
    const ids = accounts.filter((a) => a.score == null).map((a) => a.id);
    if (ids.length === 0) return;
    setScoreAllRunning(true);
    try {
      const result = await chunkedBulkCall({
        ids,
        endpoint: "/api/score",
        buildPayload: (chunk) => ({ companyIds: chunk }),
        onProgress: (done, total) => {
          if (total > 20) toast(`Scoring ${done} / ${total} accounts…`, "info");
        },
      });
      if (result.succeeded > 0) await fetchAccounts();
      if (result.failed === 0) {
        toast(`Scored ${result.succeeded} accounts.`, "success");
      } else if (result.succeeded > 0) {
        toast(`Scored ${result.succeeded} of ${result.total}. ${result.failed} failed.`, "warning");
        console.warn("accounts: score-all partial failure", result.errors);
      } else {
        toast("Failed to score accounts.", "error");
        console.warn("accounts: score-all all chunks failed", result.errors);
      }
    } catch (e) {
      toast("Failed to score accounts.", "error");
      console.warn("accounts: score-all crashed", e);
    } finally { setScoreAllRunning(false); }
  }

  // A3 — bulk actions that operate on the current selection. If nothing
  // is selected we fall back to the all-eligible-accounts set (matching
  // the old `Enrich all` / `Score all` semantics) so the header-level
  // buttons keep working as before.
  async function bulkEnrichSelected() {
    const targets =
      selectedRows.size > 0
        ? accounts.filter((a) => selectedRows.has(a.id))
        : accounts.filter((a) => !a.industry && !a.description);
    if (targets.length === 0) {
      toast("No accounts to enrich in the current selection.", "info");
      return;
    }
    const ids = targets.map((t) => t.id);
    for (const id of ids) setEnrichStatus((p) => ({ ...p, [id]: "enriching" }));
    try {
      const r = await chunkedBulkCall({
        ids,
        endpoint: "/api/enrich",
        buildPayload: (chunk) => ({ companyIds: chunk }),
      });
      const failed = new Set(r.errors.flatMap((e) => e.ids));
      setEnrichStatus((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = failed.has(id) ? "failed" : "done";
        return next;
      });
      if (r.succeeded > 0) await fetchAccounts();
      toast(
        r.failed === 0
          ? `Enriched ${r.succeeded} accounts.`
          : `Enriched ${r.succeeded} of ${r.total}. ${r.failed} failed.`,
        r.failed === 0 ? "success" : "warning"
      );
    } catch (e) {
      toast("Bulk enrichment failed.", "error");
      console.warn("accounts: bulk enrich selected failed", e);
    }
  }

  async function bulkScoreSelected() {
    const targets =
      selectedRows.size > 0
        ? accounts.filter((a) => selectedRows.has(a.id))
        : accounts.filter((a) => a.score == null);
    if (targets.length === 0) return;
    const ids = targets.map((t) => t.id);
    try {
      const r = await chunkedBulkCall({
        ids,
        endpoint: "/api/score",
        buildPayload: (chunk) => ({ companyIds: chunk }),
      });
      if (r.succeeded > 0) await fetchAccounts();
      toast(
        r.failed === 0
          ? `Scored ${r.succeeded} accounts.`
          : `Scored ${r.succeeded} of ${r.total}. ${r.failed} failed.`,
        r.failed === 0 ? "success" : "warning"
      );
    } catch (e) {
      toast("Failed to score accounts.", "error");
      console.warn("accounts: bulk score selected failed", e);
    }
  }

  async function detectSignals() {
    const ids = accounts.filter((a) => isEnriched(a)).map((a) => a.id);
    if (ids.length === 0) return;
    setDetectingSignals(true);
    try {
      const result = await chunkedBulkCall({
        ids,
        endpoint: "/api/signals",
        buildPayload: (chunk) => ({ companyIds: chunk }),
        onProgress: (done, total) => {
          if (total > 20) toast(`Detecting signals ${done} / ${total}…`, "info");
        },
      });
      if (result.succeeded > 0) await fetchAccounts();
      if (result.failed === 0) {
        toast(`Detected signals for ${result.succeeded} accounts.`, "success");
      } else if (result.succeeded > 0) {
        toast(`Signals for ${result.succeeded} of ${result.total}. ${result.failed} failed.`, "warning");
        console.warn("accounts: detect-signals partial failure", result.errors);
      } else {
        toast("Failed to detect signals.", "error");
        console.warn("accounts: detect-signals all chunks failed", result.errors);
      }
    } catch (e) {
      toast("Failed to detect signals.", "error");
      console.warn("accounts: detect-signals crashed", e);
    } finally { setDetectingSignals(false); }
  }

  async function handleSemanticSearch() {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await fetch("/api/search/tam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: searchQuery.trim(), entityType: "company", limit: 20 }) });
      if (res.ok) {
        const data = await res.json();
        // A4: preserve per-result similarity score (0..1) so the badge
        // and per-row chip can render the actual relevance, not just
        // the rank.
        const scored = new Map<string, number>();
        for (const r of (data.results as { entityId: string; similarity: number }[]) ?? []) {
          scored.set(r.entityId, r.similarity);
        }
        setSearchResults(scored);
      } else {
        toast("Search failed", "error");
      }
    } catch (e) {
      toast("Search failed", "error");
      console.warn("accounts: semantic search failed", e);
    } finally { setSearching(false); }
  }

  // A4 — debounce auto-search 500ms after the user stops typing. Empty
  // query clears results immediately (no debounce delay on the clear
  // path so the table snaps back instantly).
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      handleSemanticSearch();
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function getLinkedInUrl(account: Account): string | null {
    const props = account.properties as Record<string, unknown> | null;
    return (props?.linkedinUrl as string) || (props?.linkedin_url as string) || null;
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
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

  const filteredAccounts = (smartFilters.length > 0
    ? applyFilters(accounts, smartFilters)
    : accounts)
    .filter((a) => {
      if (filter === "tam" && !isTAM(a)) return false;
      if (filter === "manual" && isTAM(a)) return false;
      if (searchQuery.trim() && !searchResults) {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.domain?.toLowerCase().includes(q) ?? false) || (a.industry?.toLowerCase().includes(q) ?? false);
      }
      if (searchResults) return searchResults.has(a.id);
      return true;
    })
    .sort((a, b) =>
      searchResults
        ? (searchResults.get(b.id) ?? 0) - (searchResults.get(a.id) ?? 0)
        : (b.score ?? -1) - (a.score ?? -1)
    );

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
      {/* A3 — bulk actions bar appears when one or more rows are checked. */}
      <BulkActionsBar
        count={selectedRows.size}
        onClear={() => setSelectedRows(new Set())}
        actions={[
          { label: "Enrich", icon: <Zap size={13} />, onClick: bulkEnrichSelected },
          { label: "Score", icon: <Target size={13} />, onClick: bulkScoreSelected },
          { label: "Detect signals", icon: <Radio size={13} />, onClick: detectSignals },
        ]}
      />
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
              {f === "all" ? "All" : f === "tam" ? `Prospects (${tamCount})` : "Manual"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Smart Search — NL → structured filters. Independent of the
              text / semantic search to the right; results are extracted
              filters displayed as chips below the filter bar. */}
          <div className="w-64">
            <SmartSearchBar
              resourceType="account"
              onFilters={(filters, meta) => {
                setSmartFilters(filters);
                setSmartMeta(meta);
                if (filters.length > 0) {
                  toast(`Applied ${filters.length} smart filter${filters.length === 1 ? "" : "s"}`, "success");
                } else if (meta.unmatched.length > 0) {
                  toast("Nothing matched your query — try rephrasing", "info");
                }
              }}
              onError={(msg) => toast(msg, "error")}
            />
          </div>
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5" style={{ color: "var(--color-text-muted)" }} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSemanticSearch(); }}
              placeholder="Search accounts..."
              className="!h-7 w-52 !pl-8 !pr-7 !text-[12px]"
              aria-label="Semantic search"
              aria-busy={searching}
            />
            {searching && (
              <Loader2
                size={12}
                className="absolute right-2 animate-spin"
                style={{ color: "var(--color-text-muted)" }}
                aria-hidden="true"
              />
            )}
          </div>
          {searchResults && (
            <Button
              variant="icon"
              size="sm"
              onClick={() => { setSearchResults(null); setSearchQuery(""); }}
              aria-label="Clear search"
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </FilterBar>

      <ActiveFiltersChips
        filters={smartFilters}
        reasoning={smartMeta?.reasoning}
        unmatched={smartMeta?.unmatched}
        fieldLabels={{
          name: "Name",
          domain: "Domain",
          industry: "Industry",
          size: "Size",
          revenue: "Revenue",
          score: "Score",
        }}
        onRemove={(i) => {
          setSmartFilters((prev) => prev.filter((_, idx) => idx !== i));
        }}
        onClear={() => {
          setSmartFilters([]);
          setSmartMeta(null);
        }}
      />

      {/* A4 — Semantic-search result banner. Visible whenever the query
           returned (even 0 hits) so the user always knows whether the
           current rows are a search slice or the full list. */}
      {searchResults && searchQuery.trim() && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={{
            background: "var(--color-bg-hover)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
        >
          <Search size={12} style={{ color: "var(--color-text-tertiary)" }} />
          <span>
            <strong style={{ color: "var(--color-text-primary)" }}>
              {searchResults.size}
            </strong>{" "}
            semantic match{searchResults.size === 1 ? "" : "es"} for{" "}
            <span className="italic">&ldquo;{searchQuery.trim()}&rdquo;</span>
          </span>
          <button
            type="button"
            onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            className="ml-auto text-[11px] font-medium hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            Clear
          </button>
        </div>
      )}

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
        ) : filteredAccounts.length === 0 && searchResults && searchQuery.trim() ? (
          /* A4 — dedicated empty state for a semantic search that
             returned nothing. Distinct from the "no accounts at all"
             state above so the user knows their library isn't empty. */
          <EmptyState
            icon={<Search size={24} />}
            title={`No accounts match "${searchQuery.trim()}"`}
            description="Try a different phrasing, or clear the search to see your full list."
            actionLabel="Clear search"
            onAction={() => { setSearchResults(null); setSearchQuery(""); }}
            actionVariant="outline"
          />
        ) : (
          <table className="ls-table">
            <thead>
              <tr>
                {/* Select-all checkbox */}
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selectedRows.size > 0 && selectedRows.size === filteredAccounts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRows(new Set(filteredAccounts.map((a: any) => a.id)));
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                    className="h-3.5 w-3.5 rounded"
                  />
                </th>
                {([
                  { label: "Account", icon: Building2 },
                  { label: "Website", icon: Globe },
                  { label: "LinkedIn", icon: null },
                  { label: "Industry", icon: Factory },
                  { label: "Size", icon: Ruler },
                  { label: "Revenue", icon: DollarSign },
                  { label: "Stage", icon: GitBranch },
                  { label: "Score", icon: Gauge },
                  { label: "Last Interaction", icon: Clock },
                  { label: "Connected to", icon: Users },
                  ...signalTypeColumns.map((t) => ({ label: t.replace(/_/g, " "), icon: Radio as LucideIcon })),
                  ...customBoolColumns.map((c) => ({ label: c, icon: Target as LucideIcon })),
                  ...customFields.map((f) => ({ label: f.name, icon: null as LucideIcon | null })),
                  { label: "", icon: null },
                ] as Array<{ label: string; icon: LucideIcon | null }>).map((col, i) => (
                  <th key={i}>
                    <span className="flex items-center gap-1.5">
                      {col.icon && <col.icon size={12} style={{ opacity: 0.5 }} />}
                      {col.label === "LinkedIn" && <span style={{ opacity: 0.5 }}><LinkedInIcon size={12} /></span>}
                      {col.label}
                    </span>
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
                  <React.Fragment key={account.id}>
                  <tr data-selected={selectedRows.has(account.id) ? "true" : undefined}>
                    {/* Row checkbox */}
                    <td style={{ width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(account.id)}
                        onChange={(e) => {
                          const next = new Set(selectedRows);
                          if (e.target.checked) next.add(account.id); else next.delete(account.id);
                          setSelectedRows(next);
                        }}
                        className="h-3.5 w-3.5 rounded"
                      />
                    </td>
                    {/* Account name with logo + status */}
                    <td>
                      <div className="flex items-center gap-2.5">
                        {/* Expand contacts chevron */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (expandedAccountId === account.id) {
                              setExpandedAccountId(null);
                              setExpandedContacts([]);
                            } else {
                              setExpandedAccountId(account.id);
                              setLoadingContacts(true);
                              fetch(`/api/accounts/${account.id}/contacts`)
                                .then(r => r.ok ? r.json() : { contacts: [] })
                                .then(d => setExpandedContacts(d.contacts || []))
                                .catch(() => setExpandedContacts([]))
                                .finally(() => setLoadingContacts(false));
                            }
                          }}
                          className="shrink-0 rounded p-0.5 transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {expandedAccountId === account.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        {/* Status dot */}
                        {enrichStatus[account.id] === "enriching" ? (
                          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" style={{ background: "var(--color-warning)" }} />
                        ) : isEnriched(account) ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-success)" }} />
                        ) : enrichStatus[account.id] === "failed" ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-error)" }} />
                        ) : (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-text-muted)" }} />
                        )}

                        {/* Logo */}
                        <CompanyLogo domain={account.domain} name={account.name} size={24} />

                        {/* Name + description */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSlideOverAccount(account)}
                              className="truncate text-left text-[13px] font-medium transition-colors hover:underline"
                              style={{ color: "var(--color-text-primary)" }}>
                              {account.name}
                            </button>
                            {isTAM(account) && (
                              <Badge variant="info" size="sm">TAM</Badge>
                            )}
                            {/* A4 — per-row similarity score, only when a
                                semantic search is active. Helps users
                                see *why* this row is here vs. the next. */}
                            {searchResults && searchResults.has(account.id) && (
                              <Badge variant="neutral" size="sm">
                                {Math.round((searchResults.get(account.id) ?? 0) * 100)}% match
                              </Badge>
                            )}
                          </div>
                          {account.description && (
                            <p className="mt-0.5 max-w-[220px] truncate text-[11px]"
                              style={{ color: "var(--color-text-tertiary)" }} title={account.description}>
                              {account.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Website */}
                    <td>
                      {account.domain ? (
                        <a
                          href={`https://${account.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] transition-colors hover:underline"
                          style={{ color: "var(--color-accent)" }}
                        >
                          {account.domain}
                          <ExternalLink size={10} style={{ opacity: 0.5 }} />
                        </a>
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* LinkedIn */}
                    <td>
                      {(() => {
                        const linkedIn = getLinkedInUrl(account);
                        if (!linkedIn) return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
                        return (
                          <a
                            href={linkedIn.startsWith("http") ? linkedIn : `https://${linkedIn}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] transition-colors hover:underline"
                            style={{ color: "#0A66C2" }}
                          >
                            <LinkedInIcon size={13} />
                            <span>Profile</span>
                          </a>
                        );
                      })()}
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
                          <span className="flex items-center gap-1.5" title={account.scoreReasons?.join("; ") || ""}>
                            <span
                              className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                              style={{ background: scoreInfo.color }}
                            >
                              {scoreInfo.grade}
                            </span>
                            {scoreInfo.icon && <span className="text-[12px]">{scoreInfo.icon}</span>}
                            <span className="text-[11px] font-medium" style={{ color: scoreInfo.color }}>{scoreInfo.heat}</span>
                          </span>
                        );
                      })()}
                    </td>

                    {/* Last Interaction */}
                    <td>
                      {account.lastInteraction ? (
                        <div title={account.lastInteraction.summary || undefined}>
                          <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                            {timeAgo(account.lastInteraction.date)}
                          </span>
                          {account.lastInteraction.summary && (
                            <p className="mt-0.5 max-w-[150px] truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                              {account.lastInteraction.summary}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* Connected to — owner + warm-intro paths (primitive ② live) */}
                    <td>
                      {(() => {
                        const warm = warmPathsByCompany[account.id] ?? [];
                        const byUser = new Map<string, { name: string; strength: number; count: number }>();
                        for (const p of warm) {
                          const prior = byUser.get(p.viaUserId);
                          if (prior) {
                            prior.strength = Math.max(prior.strength, p.strength);
                            prior.count += 1;
                          } else {
                            byUser.set(p.viaUserId, { name: p.viaUserName, strength: p.strength, count: 1 });
                          }
                        }
                        const viaUsers = Array.from(byUser.entries()).sort(
                          (a, b) => b[1].strength - a[1].strength,
                        );
                        const ownerFirst = (account as any).ownerFirstName as string | undefined;
                        const ownerLast = (account as any).ownerLastName as string | undefined;
                        const popoverId = `${account.id}-warm`;
                        return (
                          <div className="flex flex-col gap-0.5">
                            {ownerFirst ? (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white shrink-0"
                                  style={{ background: `hsl(${(ownerFirst.charCodeAt(0) || 0) * 37 % 360}, 60%, 55%)` }}
                                >
                                  {(ownerFirst[0] || "").toUpperCase()}
                                </span>
                                <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                                  {ownerFirst}{ownerLast ? ` ${ownerLast[0]}.` : ""}
                                </span>
                              </div>
                            ) : !viaUsers.length ? (
                              <span className="text-[10px]" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>Unassigned</span>
                            ) : null}
                            {viaUsers.length > 0 && (
                              <span className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setWarmPathsPopoverId(warmPathsPopoverId === popoverId ? null : popoverId); }}
                                  className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
                                  style={{ color: "var(--color-accent)" }}
                                  title="Warm intro available"
                                >
                                  <span className="flex -space-x-1">
                                    {viaUsers.slice(0, 3).map(([uid, info]) => (
                                      <span
                                        key={uid}
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ring-1 ring-[var(--color-bg-card)]"
                                        style={{ background: `hsl(${(info.name.charCodeAt(0) || 0) * 53 % 360}, 60%, 50%)` }}
                                      >
                                        {(info.name[0] || "?").toUpperCase()}
                                      </span>
                                    ))}
                                  </span>
                                  <span>
                                    Warm intro
                                    {viaUsers.length > 1 ? ` · ${viaUsers.length} paths` : ""}
                                  </span>
                                </button>
                                {warmPathsPopoverId === popoverId && (
                                  <div
                                    ref={warmPathsPopoverRef}
                                    className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg p-3"
                                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-moderate)", boxShadow: "var(--shadow-floating)" }}
                                  >
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                                      Warm intros available
                                    </p>
                                    <div className="space-y-1.5 max-h-64 overflow-auto">
                                      {warm.slice(0, 12).map((p) => (
                                        <div key={`${p.viaUserId}-${p.contactId}`} className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                                              {p.contactName}
                                            </p>
                                            {p.contactTitle && (
                                              <p className="text-[11px] truncate" style={{ color: "var(--color-text-tertiary)" }}>{p.contactTitle}</p>
                                            )}
                                            <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                                              via <span style={{ color: "var(--color-accent)" }}>{p.viaUserName}</span>
                                            </p>
                                          </div>
                                          <span
                                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                                            style={{
                                              background: p.strength > 0.5 ? "var(--color-success-soft)" : "var(--color-bg-page)",
                                              color: p.strength > 0.5 ? "var(--color-success)" : "var(--color-text-tertiary)",
                                            }}
                                            title={`Strength ${(p.strength * 100).toFixed(0)}%`}
                                          >
                                            {(p.strength * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </span>
                            )}
                          </div>
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
                                <div ref={signalPopoverRef} className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg p-3"
                                  style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-moderate)", boxShadow: "var(--shadow-floating)" }}>
                                  <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[11px] font-medium" style={{ color: "var(--color-text-primary)" }}>{signal.title}</span>
                                    <span className="text-[10px] font-semibold uppercase"
                                      style={{ color: signal.relevance === "high" ? "var(--color-success)" : signal.relevance === "medium" ? "var(--color-warning)" : "var(--color-text-tertiary)" }}>
                                      {signal.relevance}
                                    </span>
                                  </div>
                                  <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{signal.description}</p>
                                  {/* Tabs: Reasoning / Sources */}
                                  {(signal.reasoning || (signal.sources && signal.sources.length > 0)) && (
                                    <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                                      <div className="mb-2 flex gap-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setSignalPopoverTab("reasoning"); }}
                                          className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                                          style={{
                                            background: signalPopoverTab === "reasoning" ? "var(--color-accent-soft)" : "transparent",
                                            color: signalPopoverTab === "reasoning" ? "var(--color-accent)" : "var(--color-text-tertiary)",
                                          }}
                                        >
                                          Reasoning
                                        </button>
                                        {signal.sources && signal.sources.length > 0 && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setSignalPopoverTab("sources"); }}
                                            className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                                            style={{
                                              background: signalPopoverTab === "sources" ? "var(--color-accent-soft)" : "transparent",
                                              color: signalPopoverTab === "sources" ? "var(--color-accent)" : "var(--color-text-tertiary)",
                                            }}
                                          >
                                            Sources ({signal.sources.length})
                                          </button>
                                        )}
                                      </div>
                                      {signalPopoverTab === "reasoning" && signal.reasoning && (
                                        <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{signal.reasoning}</p>
                                      )}
                                      {signalPopoverTab === "sources" && signal.sources && signal.sources.length > 0 && (
                                        <div className="space-y-1.5">
                                          {signal.sources.map((src, si) => (
                                            <a key={si} href={src.url} target="_blank" rel="noopener noreferrer"
                                              className="flex items-center gap-2 text-[11px] hover:underline" style={{ color: "var(--color-accent)" }}>
                                              <img src={`https://logo.clearbit.com/${new URL(src.url).hostname}`} alt="" className="h-3.5 w-3.5 rounded shrink-0"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                              <span className="truncate">{src.title}</span>
                                            </a>
                                          ))}
                                        </div>
                                      )}
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
                            <span className="text-[10px]" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>No</span>
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
                  {/* Expanded contacts row */}
                  {expandedAccountId === account.id && (
                    <tr>
                      <td colSpan={99} style={{ background: "var(--color-bg-page)", padding: 0 }}>
                        <div className="px-6 py-3" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                          {loadingContacts ? (
                            <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                              <Loader2 size={12} className="animate-spin" /> Loading contacts...
                            </div>
                          ) : expandedContacts.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Contacts at {account.name}</p>
                              {expandedContacts.map((c) => (
                                <div key={c.id} className="flex items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-[var(--color-bg-hover)]" onClick={() => window.location.href = `/contacts/${c.id}`} style={{ cursor: "pointer" }}>
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white shrink-0"
                                    style={{ background: `hsl(${(c.firstName?.charCodeAt(0) || 0) * 37 % 360}, 55%, 50%)` }}>
                                    {(c.firstName?.[0] || "?").toUpperCase()}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown"}
                                    </span>
                                    {c.title && <span className="ml-1.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>— {c.title}</span>}
                                  </div>
                                  {c.email && <span className="text-[11px] shrink-0" style={{ color: "var(--color-text-muted)" }}>{c.email}</span>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>No contacts found at this account.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
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
              <IntelligenceBrief accountId={a.id} />
              <PropertyRow label="Website" value={
                a.domain ? (
                  <a href={`https://${a.domain}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] hover:underline" style={{ color: "var(--color-accent)" }}>
                    {a.domain} <ExternalLink size={10} />
                  </a>
                ) : "—"
              } />
              <PropertyRow label="LinkedIn" value={
                (() => {
                  const url = getLinkedInUrl(a);
                  return url ? (
                    <a href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] hover:underline" style={{ color: "#0A66C2" }}>
                      <LinkedInIcon size={12} /> View profile
                    </a>
                  ) : "—";
                })()
              } />
              <PropertyRow label="Last Interaction" value={
                a.lastInteraction ? `${timeAgo(a.lastInteraction.date)}${a.lastInteraction.summary ? ` — ${a.lastInteraction.summary}` : ""}` : "—"
              } />
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
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-[20px] w-[20px] items-center justify-center rounded-full text-[9px] font-bold text-white shrink-0"
                      style={{ background: scoreInfo.color }}
                    >
                      {scoreInfo.grade}
                    </span>
                    {scoreInfo.icon && <span className="text-[12px]">{scoreInfo.icon}</span>}
                    <span className="text-[12px] font-medium" style={{ color: scoreInfo.color }}>{scoreInfo.heat}</span>
                    <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>({a.score})</span>
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
              {/* A12 — Description: always render. Empty state offers a
                   1-click enrich. */}
              <div className="mt-3">
                <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Description</span>
                {a.description ? (
                  <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{a.description}</p>
                ) : (
                  <div className="mt-1 rounded-lg p-2.5" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                    <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      Not enriched yet — pull industry, size and revenue from Apollo.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await chunkedBulkCall({
                            ids: [a.id],
                            endpoint: "/api/enrich",
                            buildPayload: (chunk) => ({ companyIds: chunk }),
                          });
                          await fetchAccounts();
                          toast("Enriched.", "success");
                        } catch (e) {
                          toast("Enrich failed.", "error");
                          console.warn("accounts: single enrich failed", e);
                        }
                      }}
                      className="mt-1.5 text-[11px] font-medium hover:underline"
                      style={{ color: "var(--color-accent)" }}
                    >
                      Enrich with Apollo →
                    </button>
                  </div>
                )}
              </div>

              {/* A12 — Score Criteria: empty state offers a 1-click
                   score recompute. Hidden if the account has no
                   `score` value at all (we still want to score it,
                   regardless of reasons). */}
              <div className="mt-3">
                <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Score Criteria</span>
                {a.scoreReasons && a.scoreReasons.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {a.scoreReasons.map((reason, i) => (
                      <li key={i} className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>&#8226; {reason}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 rounded-lg p-2.5" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                    <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      Not scored yet — run the ICP fit + engagement score for this account.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await chunkedBulkCall({
                            ids: [a.id],
                            endpoint: "/api/score",
                            buildPayload: (chunk) => ({ companyIds: chunk }),
                          });
                          await fetchAccounts();
                          toast("Scored.", "success");
                        } catch (e) {
                          toast("Score failed.", "error");
                          console.warn("accounts: single score failed", e);
                        }
                      }}
                      className="mt-1.5 text-[11px] font-medium hover:underline"
                      style={{ color: "var(--color-accent)" }}
                    >
                      Score this account →
                    </button>
                  </div>
                )}
              </div>

              {/* A12 — Activity hint when no interactions are recorded.
                   The lastInteraction PropertyRow already shows "—",
                   this adds the "why and what to do" copy below. */}
              {!a.lastInteraction && (
                <p className="mt-3 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  No emails or meetings recorded yet. Connect your inbox in{" "}
                  <a href="/settings/mail-calendar" className="underline" style={{ color: "var(--color-accent)" }}>
                    Settings
                  </a>{" "}
                  to start tracking interactions.
                </p>
              )}
            </div>
          );
        })()}
      </SlideOver>
    </div>
  );
}
