"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Building2, Search, Plus, Zap, Target, Radio, X, Globe, Factory, Ruler, DollarSign, GitBranch, Gauge, ExternalLink, Clock, Users, ChevronRight, ChevronDown, Loader2, Sparkles, Phone, MapPin, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import { useTamStream } from "@/hooks/use-tam-stream";
import { TamBuildProgress } from "@/components/tam-build-progress";
import { SignalChip } from "@/components/signal-chip";
import { DEFAULT_SIGNALS } from "@/lib/tam-stream/signals";
import type { SignalKey, SignalPayload } from "@/lib/tam-stream/events";

function LinkedInIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}
import { getLifecycleStyle, formatScore } from "@/lib/util/ui-utils";
import { SlideOver, PropertyRow } from "@/components/slide-over";
import { CompanyLogo } from "@/components/ui/company-logo";
import { IntelligenceBrief } from "@/components/intelligence-brief";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/context/custom-fields";
import type { CustomFieldDef } from "@/lib/context/custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, PropertyBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { chunkedBulkCall } from "@/lib/infra/chunk-bulk";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { SmartSearchBar, ActiveFiltersChips } from "@/components/ui/smart-search-bar";
import { applyFilters } from "@/lib/search/filters";
import type { FilterCondition } from "@/lib/search/filters";
import { ColumnFilter, isColumnFilterActive, type ColumnFilterKind, type ColumnFilterState } from "@/components/ui/column-filter";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

/** Human-readable label rendered inside the signal chip (when true)
 * and used as the popover title. Shorter than the column header. */
function signalLabelForHeader(key: SignalKey): string {
  switch (key) {
    case "investor_overlap":
      return "Common inv.";
    case "funding_recent":
      return "Funded 6mo";
    case "funding_crunchbase":
      return "CB Funded";
    case "hiring_intent":
      return "Hiring";
    case "yc_company":
      return "YC";
  }
}

/** Convert a row still alive in the stream into the Account shape
 * the table renders. Only needed until `fetchAccounts` refetches the
 * row from DB — after that the DB copy takes precedence. */
function streamedRowToAccount(
  row: import("@/hooks/use-tam-stream").StreamedRow,
): Account {
  const enrichment = row.enrichment;
  const tamSignals: Record<string, SignalPayload> = {};
  for (const [key, slot] of Object.entries(row.signals)) {
    if (slot && slot.status === "resolved") tamSignals[key] = slot.payload;
  }
  return {
    id: row.company.id,
    name: row.company.name,
    domain: row.company.domain,
    industry: row.company.industry ?? enrichment.industry ?? null,
    size: row.company.size ?? enrichment.size ?? null,
    revenue: enrichment.revenue ?? null,
    description: enrichment.description ?? null,
    score: row.score.score,
    scoreReasons: row.score.reasons,
    properties: {
      source: "tam",
      linkedin_url: enrichment.linkedinUrl,
      technologies: enrichment.technologies ?? [],
      total_funding: enrichment.totalFunding ?? null,
      total_funding_printed: enrichment.totalFundingPrinted ?? null,
      latest_funding_stage: enrichment.latestFundingStage ?? null,
      latest_funding_raised_at: enrichment.latestFundingRaisedAt ?? null,
      founded_year: enrichment.foundedYear ?? null,
      country: enrichment.country ?? null,
      city: enrichment.city ?? null,
      state: enrichment.state ?? null,
      score_grade: row.score.grade,
      tamSignals,
    },
    lastInteraction: null,
  };
}

type EnrichStatus = "idle" | "enriching" | "done" | "failed";

export default function AccountsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({});
  const [enrichAllRunning, setEnrichAllRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "tam" | "manual">("all");
  // Per-column header filters (Notion / Excel style). Keyed by the
  // column's filterKey → its filter state. An entry only exists while
  // the column constrains the list; clearing it deletes the key.
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null);
  // Bulk contact extraction (Apollo) + delete flows.
  const [extractingContacts, setExtractingContacts] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "single" | "bulk" | "all"; id?: string; name?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  // Infinite scroll — the scroll container is the observer root, and a
  // sentinel just below the last row triggers the next page when it
  // scrolls into view (see the IntersectionObserver effect below).
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // ── TAM streaming build ──
  // Live stream of new rows + signals from /api/tam/build. Rows arrive
  // already scored + with their first signal resolved; subsequent
  // signals come in as separate events. The banner above the table
  // shows progress, and completed rows get merged into `accounts` on
  // stream end via a background refetch — no full-page reload.
  const tamStream = useTamStream();
  const [streamBanner, setStreamBanner] = useState<boolean>(true);

  const startTamBuild = useCallback(async () => {
    setStreamBanner(true);
    // Push the active sector/geography facets straight into the Apollo
    // sourcing query so "Find more accounts" pulls exactly the slice the
    // user is filtering on (instead of the full tenant-wide plan).
    const apolloOverrides: { industries?: string[]; geographies?: string[] } = {};
    const indVals = columnFilters.industry?.values ?? [];
    const geoVals = columnFilters.geography?.values ?? [];
    if (indVals.length > 0) apolloOverrides.industries = indVals;
    if (geoVals.length > 0) apolloOverrides.geographies = geoVals;
    const hasOverrides = !!apolloOverrides.industries || !!apolloOverrides.geographies;
    await tamStream.start({ targetCount: 300, ...(hasOverrides ? { apolloOverrides } : {}) });
  }, [tamStream, columnFilters]);

  // Single "popover open" selector shared across all signal chips in
  // the table. Ensures only one popover is open at a time and it
  // closes when the user opens a chip on another row or clicks
  // outside. Key format: `${companyId}::${signalKey}`.
  const [openSignalChipId, setOpenSignalChipId] = useState<string | null>(
    null,
  );

  // Custom signals defined in /settings/signals. Fetched once on
  // mount, refreshed when the stream finishes (so a custom signal
  // created mid-session shows up without a manual reload).
  const [customSignals, setCustomSignals] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
      backfilledAt: string | null;
    }>
  >([]);

  useEffect(() => {
    fetch("/api/custom-signals")
      .then((r) => (r.ok ? r.json() : { signals: [] }))
      .then((data) => setCustomSignals(data.signals ?? []))
      .catch(() => {
        // Non-fatal — built-in signals still work.
      });
  }, []);

  /** Fetch a single page of accounts.
   *  - page=1, append=false → initial load (replaces list)
   *  - page>1, append=true  → "Load more" click
   *  When called with no args after a mutation (enrich, score, etc.)
   *  it reloads all pages that were previously loaded so the user
   *  doesn't lose their scroll position / loaded data. */
  const fetchAccounts = useCallback(async (page = 1, append = false) => {
    try {
      if (page === 1 && !append) setLoading(true);
      else setLoadingMore(true);
      const res = await fetch(`/api/accounts?pageSize=50&page=${page}`);
      if (!res.ok) return;
      const data = await res.json();
      const batch: Account[] = data.accounts || data.items || [];
      const pagination = data.pagination as { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean } | undefined;
      if (append) {
        setAccounts((prev) => [...prev, ...batch]);
      } else {
        setAccounts(batch);
      }
      setCurrentPage(pagination?.page ?? page);
      setTotalAccounts(pagination?.total ?? batch.length);
      setTotalPages(pagination?.totalPages ?? 1);
    } catch (e) {
      console.warn("accounts: list fetch failed", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  /** Reload all pages that have been loaded so far. Used after mutations
   *  (enrich, score, create) so the user doesn't snap back to page 1. */
  const refetchLoadedAccounts = useCallback(async () => {
    try {
      const pagesToLoad = Math.max(currentPage, 1);
      let all: Account[] = [];
      for (let p = 1; p <= pagesToLoad; p++) {
        const res = await fetch(`/api/accounts?pageSize=50&page=${p}`);
        if (!res.ok) break;
        const data = await res.json();
        const batch: Account[] = data.accounts || data.items || [];
        all = [...all, ...batch];
        if (p === pagesToLoad) {
          const pagination = data.pagination as { total: number; totalPages: number } | undefined;
          setTotalAccounts(pagination?.total ?? all.length);
          setTotalPages(pagination?.totalPages ?? 1);
        }
      }
      setAccounts(all);
    } catch (e) {
      console.warn("accounts: refetch failed", e);
    }
  }, [currentPage]);

  const loadMoreAccounts = useCallback(() => {
    if (loadingMore || currentPage >= totalPages) return;
    fetchAccounts(currentPage + 1, true);
  }, [fetchAccounts, loadingMore, currentPage, totalPages]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Auto-load on scroll: when the bottom sentinel enters the scroll
  // container's viewport, pull the next page. `rootMargin` pre-fetches a
  // little before the user reaches the very bottom so growth feels
  // seamless. `loadMoreAccounts` is internally guarded (no-op while a
  // load is in flight or once the last page is reached), and this effect
  // re-binds after every page load (currentPage/totalPages change) so it
  // keeps chaining until the sentinel is off-screen or the list is
  // exhausted. Replaces the manual "Load more" click.
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    if (currentPage >= totalPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreAccounts();
      },
      { root: scrollContainerRef.current ?? null, rootMargin: "300px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreAccounts, currentPage, totalPages, loading]);

  // When the TAM stream terminates, refetch so the rows picked up
  // from the stream also land in the DB-backed list (enrichment
  // patches, scoring adjustments, etc.). Kept below `fetchAccounts`
  // so the callback reference is defined at the point this hook
  // depends on it.
  useEffect(() => {
    if (tamStream.terminated === "done") {
      refetchLoadedAccounts();
    }
  }, [tamStream.terminated, refetchLoadedAccounts]);

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
        setNewName(""); setNewDomain(""); setShowCreate(false); refetchLoadedAccounts();
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
      if (res.ok) await refetchLoadedAccounts();
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
      if (result.succeeded > 0) await refetchLoadedAccounts();
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
      if (result.succeeded > 0) await refetchLoadedAccounts();
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
      if (r.succeeded > 0) await refetchLoadedAccounts();
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
      if (r.succeeded > 0) await refetchLoadedAccounts();
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
      if (result.succeeded > 0) await refetchLoadedAccounts();
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

  // Pull real contacts (Apollo) for the selected accounts and persist
  // them. Deduped server-side against contacts already on each account.
  async function extractContactsSelected() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    setExtractingContacts(true);
    toast(`Extracting contacts for ${ids.length} account${ids.length === 1 ? "" : "s"}…`, "info");
    try {
      const res = await fetch("/api/accounts/extract-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data?.error || "Failed to extract contacts.", "error");
        return;
      }
      if (data.totalCreated > 0) {
        toast(
          `Added ${data.totalCreated} contact${data.totalCreated === 1 ? "" : "s"} across ${data.accountsProcessed} account${data.accountsProcessed === 1 ? "" : "s"}.`,
          "success",
        );
      } else {
        toast("No new contacts found for the selected accounts.", "info");
      }
    } catch (e) {
      toast("Failed to extract contacts.", "error");
      console.warn("accounts: extract contacts failed", e);
    } finally {
      setExtractingContacts(false);
    }
  }

  // Soft-delete: single row, the current selection, or every account in
  // the tenant. Driven by `deleteTarget` + confirmed via <ConfirmDialog>.
  async function performDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      let ok = false;
      let deletedCount = 0;
      if (deleteTarget.type === "single" && deleteTarget.id) {
        const res = await fetch(`/api/accounts/${deleteTarget.id}`, { method: "DELETE" });
        ok = res.ok;
        deletedCount = ok ? 1 : 0;
      } else if (deleteTarget.type === "bulk") {
        const ids = Array.from(selectedRows);
        const res = await fetch("/api/accounts/batch", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        ok = res.ok;
        if (ok) deletedCount = (await res.json().catch(() => ({}))).deleted ?? ids.length;
      } else if (deleteTarget.type === "all") {
        const res = await fetch("/api/accounts/batch", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        ok = res.ok;
        if (ok) deletedCount = (await res.json().catch(() => ({}))).deleted ?? 0;
      }
      if (!ok) {
        toast("Delete failed.", "error");
        return;
      }
      toast(`Deleted ${deletedCount} account${deletedCount === 1 ? "" : "s"}.`, "success");
      setSelectedRows(new Set());
      await refetchLoadedAccounts();
    } catch (e) {
      toast("Delete failed.", "error");
      console.warn("accounts: delete failed", e);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
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

  /** Country alone — the unit the geography filter groups by. Both the
   * TAM stream and /api/enrich persist it under `properties.country`. */
  function getCountry(account: Account): string | null {
    const c = (account.properties as Record<string, unknown> | null)?.country;
    return typeof c === "string" && c.trim() ? c.trim() : null;
  }

  /** Human-readable location for the table cell: city, state, country,
   * de-duplicated and in that order. Returns null when nothing is
   * known so the cell renders "—". */
  function formatGeography(account: Account): string | null {
    const props = account.properties as Record<string, unknown> | null;
    if (!props) return null;
    const parts = [props.city, props.state, props.country]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    const seen = new Set<string>();
    const unique = parts.filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return unique.length > 0 ? unique.join(", ") : null;
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

  // Merge accounts from DB with rows still live in the stream. Stream
  // rows that haven't been picked up by `fetchAccounts` yet (i.e. the
  // build is still running) are projected into the Account shape so
  // the same table code renders both.
  const mergedAccounts = useMemo<Account[]>(() => {
    if (tamStream.rows.size === 0) return accounts;
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const id of tamStream.rowOrder) {
      const row = tamStream.rows.get(id);
      if (!row) continue;
      if (byId.has(id)) continue; // already in DB list
      byId.set(id, streamedRowToAccount(row));
    }
    // Preserve the original accounts[] order (score DESC from server),
    // append streamed rows that aren't in DB yet at the end. The
    // `filteredAccounts` sort below re-orders by score anyway.
    const merged: Account[] = [...accounts];
    for (const id of tamStream.rowOrder) {
      if (byId.has(id) && !merged.find((a) => a.id === id)) {
        merged.push(byId.get(id)!);
      }
    }
    return merged;
  }, [accounts, tamStream.rows, tamStream.rowOrder]);

  /** Reads a signal value for a company, preferring the live stream
   * state (which may be mid-flight) over the persisted
   * `properties.tamSignals` blob. */
  function getTamSignal(
    account: Account,
    key: SignalKey,
  ): { payload: SignalPayload | null } {
    const streamed = tamStream.rows.get(account.id);
    if (streamed) {
      const slot = streamed.signals[key];
      if (slot?.status === "resolved") return { payload: slot.payload };
      if (slot?.status === "pending") return { payload: null };
    }
    const persisted = (account.properties as Record<string, unknown> | null)
      ?.tamSignals as Partial<Record<SignalKey, SignalPayload>> | undefined;
    return { payload: persisted?.[key] ?? null };
  }

  /** Reads a custom (user-defined) signal result for a company.
   * Custom signals are backfilled asynchronously via Inngest, so a
   * row may have no entry yet — in that case the chip renders as
   * indeterminate ("—") rather than pending. */
  function getCustomSignalPayload(
    account: Account,
    signalId: string,
  ): SignalPayload | null {
    const bag = (account.properties as Record<string, unknown> | null)
      ?.customSignals as Record<string, SignalPayload> | undefined;
    return bag?.[signalId] ?? null;
  }

  // Count lit signals per row (built-in + custom) so the secondary
  // sort can use "more signals lit" as a tiebreaker. This makes the
  // "A Burning with 4 chips" rows float to the very top — the
  // Monaco stack-ranking feel.
  function litSignalCount(a: Account): number {
    const props = a.properties as Record<string, unknown> | null;
    const tam = props?.tamSignals as
      | Partial<Record<SignalKey, SignalPayload>>
      | undefined;
    const custom = props?.customSignals as
      | Record<string, SignalPayload>
      | undefined;
    let n = 0;
    if (tam) {
      for (const sig of Object.values(tam)) {
        if (sig && sig.value && sig.confidence !== "indeterminate") n++;
      }
    }
    if (custom) {
      for (const sig of Object.values(custom)) {
        if (sig && sig.value && sig.confidence !== "indeterminate") n++;
      }
    }
    // Also count streamed-but-not-yet-persisted signals so a row
    // climbs the stack in real time as chips resolve.
    const streamed = tamStream.rows.get(a.id);
    if (streamed) {
      for (const slot of Object.values(streamed.signals)) {
        if (slot?.status === "resolved" && slot.payload.value && slot.payload.confidence !== "indeterminate") n++;
      }
    }
    return n;
  }

  // Per-column filter config — each filterable header column maps to a
  // kind (text / enum / presence) and a value accessor. The header
  // renders a <ColumnFilter> for every key here; `filteredAccounts`
  // applies them. Single source of truth for both sides.
  const FILTER_COLUMNS: Record<string, { label: string; kind: ColumnFilterKind; get: (a: Account) => string | null }> = {
    name: { label: "Account", kind: "text", get: (a) => a.name },
    domain: { label: "Website", kind: "text", get: (a) => a.domain },
    linkedin: { label: "LinkedIn", kind: "presence", get: (a) => getLinkedInUrl(a) },
    industry: { label: "Industry", kind: "enum", get: (a) => a.industry?.trim() || null },
    geography: { label: "Geography", kind: "enum", get: (a) => getCountry(a) },
    size: { label: "Size", kind: "enum", get: (a) => a.size },
    revenue: { label: "Revenue", kind: "enum", get: (a) => a.revenue },
    stage: { label: "Stage", kind: "enum", get: (a) => getLifecycleStage(a) },
    score: { label: "Score", kind: "enum", get: (a) => formatScore(a.score)?.grade ?? null },
  };

  // Distinct values per enum column, computed from the loaded rows, for
  // the column-filter checkboxes. Sorted alphabetically; empties dropped.
  const columnOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [key, cfg] of Object.entries(FILTER_COLUMNS)) {
      if (cfg.kind !== "enum") continue;
      const set = new Set<string>();
      for (const a of mergedAccounts) {
        const v = cfg.get(a);
        if (v) set.add(String(v));
      }
      out[key] = Array.from(set).sort((a, b) => a.localeCompare(b));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedAccounts]);

  /** Apply every active per-column header filter to one row. */
  function passesColumnFilters(a: Account): boolean {
    for (const [key, f] of Object.entries(columnFilters)) {
      const cfg = FILTER_COLUMNS[key];
      if (!cfg || !isColumnFilterActive(f)) continue;
      const v = cfg.get(a);
      if (cfg.kind === "text") {
        if (!String(v ?? "").toLowerCase().includes((f.text ?? "").toLowerCase())) return false;
      } else if (cfg.kind === "enum") {
        if (f.values && f.values.length > 0 && (v == null || !f.values.includes(String(v)))) return false;
      } else if (cfg.kind === "presence") {
        const has = !!(v && String(v).trim());
        if (f.presence === "has" && !has) return false;
        if (f.presence === "empty" && has) return false;
      }
    }
    return true;
  }

  const filteredAccounts = (smartFilters.length > 0
    ? applyFilters(mergedAccounts, smartFilters)
    : mergedAccounts)
    .filter((a) => {
      if (filter === "tam" && !isTAM(a)) return false;
      if (filter === "manual" && isTAM(a)) return false;
      if (!passesColumnFilters(a)) return false;
      if (searchQuery.trim() && !searchResults) {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.domain?.toLowerCase().includes(q) ?? false) || (a.industry?.toLowerCase().includes(q) ?? false);
      }
      if (searchResults) return searchResults.has(a.id);
      return true;
    })
    .sort((a, b) => {
      if (searchResults) {
        return (searchResults.get(b.id) ?? 0) - (searchResults.get(a.id) ?? 0);
      }
      // Primary: score DESC. Secondary: lit signals DESC — Monaco
      // "rise to top" behaviour for rows whose chips just flipped.
      const ds = (b.score ?? -1) - (a.score ?? -1);
      if (ds !== 0) return ds;
      return litSignalCount(b) - litSignalCount(a);
    });

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
    <div className="flex h-full flex-col animate-content-in" style={{ background: "var(--color-bg-page)" }}>
      {/* A3 — bulk actions bar appears when one or more rows are checked. */}
      <BulkActionsBar
        count={selectedRows.size}
        onClear={() => setSelectedRows(new Set())}
        actions={[
          { label: "Enrich", icon: <Zap size={13} />, onClick: bulkEnrichSelected },
          { label: "Score", icon: <Target size={13} />, onClick: bulkScoreSelected },
          { label: "Detect signals", icon: <Radio size={13} />, onClick: detectSignals },
          {
            label: extractingContacts ? "Extracting…" : "Extract contacts",
            icon: <UserPlus size={13} />,
            onClick: extractContactsSelected,
            disabled: extractingContacts,
          },
          {
            label: "Call Mode",
            icon: <Phone size={13} />,
            onClick: () => {
              const ids = Array.from(selectedRows);
              if (ids.length === 0) return;
              window.location.href = `/call-mode?accounts=${encodeURIComponent(ids.join(","))}`;
            },
          },
          {
            label: "Delete",
            icon: <Trash2 size={13} />,
            variant: "danger",
            onClick: () => setDeleteTarget({ type: "bulk" }),
          },
        ]}
      />
      {/* Page header */}
      <PageHeader
        icon={<Building2 size={16} />}
        title="Accounts"
        subtitle={`${totalAccounts}`}
      >
        {totalAccounts > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={() => setDeleteTarget({ type: "all" })}
            title="Delete every account in this workspace"
          >
            Delete all
          </Button>
        )}
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
          variant="outline"
          size="sm"
          icon={<Sparkles size={13} />}
          onClick={startTamBuild}
          disabled={tamStream.isRunning}
          loading={tamStream.isRunning}
        >
          {tamStream.isRunning
            ? "Building..."
            : ((columnFilters.industry?.values?.length ?? 0) > 0 || (columnFilters.geography?.values?.length ?? 0) > 0)
              ? "Find more (filtered)"
              : "Find more accounts"}
        </Button>
        <Button
          variant="gradient"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => setShowCreate(true)}
        >
          Create account
        </Button>
      </PageHeader>

      {/* TAM stream progress banner — sticky above the filter bar
          during a build, collapses to a completion / error state
          after `done`. */}
      {streamBanner && (
        <div className="px-4 pt-3">
          <TamBuildProgress
            state={tamStream}
            targetCount={300}
            onCancel={tamStream.cancel}
            onDismiss={() => setStreamBanner(false)}
          />
        </div>
      )}

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

        {/* Per-column filters now live in the table headers (click the
            filter icon on Industry / Geography / Size / etc.). When any
            are active, surface a count + one-click reset here so the user
            isn't hunting through headers to clear them. */}
        {(() => {
          const activeKeys = Object.keys(columnFilters).filter((k) =>
            isColumnFilterActive(columnFilters[k]),
          );
          if (activeKeys.length === 0) return null;
          return (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              <X size={12} />
              {activeKeys.length} column filter{activeKeys.length === 1 ? "" : "s"} — clear
            </button>
          );
        })()}

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
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton
            rows={8}
            // +4 for built-in TAM signals + N for custom signals.
            cols={9 + 4 + customSignals.length + signalTypeColumns.length + customBoolColumns.length + customFields.length}
          />
        ) : mergedAccounts.length === 0 ? (
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
          <>
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
                  { label: "Account", icon: Building2, filterKey: "name" },
                  { label: "Website", icon: Globe, filterKey: "domain" },
                  { label: "LinkedIn", icon: null, filterKey: "linkedin" },
                  { label: "Industry", icon: Factory, filterKey: "industry" },
                  { label: "Geography", icon: MapPin, filterKey: "geography" },
                  { label: "Size", icon: Ruler, filterKey: "size" },
                  { label: "Revenue", icon: DollarSign, filterKey: "revenue" },
                  { label: "Stage", icon: GitBranch, filterKey: "stage" },
                  { label: "Score", icon: Gauge, filterKey: "score" },
                  { label: "Last Interaction", icon: Clock },
                  { label: "Connected to", icon: Users },
                  // TAM streaming signal columns — one per default
                  // signal. Rendered as chips in the body via
                  // <SignalChip>. Positioned right after Connected-to
                  // so the trust-cluster (warm intro + signals) lives
                  // together, before legacy/custom columns.
                  { label: "Investor", icon: Sparkles as LucideIcon },
                  { label: "Funding", icon: Sparkles as LucideIcon },
                  { label: "Hiring", icon: Sparkles as LucideIcon },
                  { label: "YC", icon: Sparkles as LucideIcon },
                  // User-defined custom signals. Each appears as its
                  // own column; names truncated to 16 chars in the
                  // header to keep row widths predictable.
                  ...customSignals.map((c) => ({
                    label: c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name,
                    icon: Radio as LucideIcon,
                  })),
                  ...signalTypeColumns.map((t) => ({ label: t.replace(/_/g, " "), icon: Radio as LucideIcon })),
                  ...customBoolColumns.map((c) => ({ label: c, icon: Target as LucideIcon })),
                  ...customFields.map((f) => ({ label: f.name, icon: null as LucideIcon | null })),
                  { label: "", icon: null },
                ] as Array<{ label: string; icon: LucideIcon | null; filterKey?: string }>).map((col, i) => {
                  const fcfg = col.filterKey ? FILTER_COLUMNS[col.filterKey] : undefined;
                  return (
                  <th key={i}>
                    <span className="flex items-center gap-1.5">
                      {col.icon && <col.icon size={12} style={{ opacity: 0.5 }} />}
                      {col.label === "LinkedIn" && <span style={{ opacity: 0.5 }}><LinkedInIcon size={12} /></span>}
                      {col.label}
                      {col.filterKey && fcfg && (
                        <ColumnFilter
                          label={fcfg.label}
                          kind={fcfg.kind}
                          options={columnOptions[col.filterKey]}
                          state={columnFilters[col.filterKey]}
                          onChange={(next) =>
                            setColumnFilters((prev) => {
                              const n = { ...prev };
                              if (next) n[col.filterKey!] = next;
                              else delete n[col.filterKey!];
                              return n;
                            })
                          }
                          open={openColumnFilter === col.filterKey}
                          onOpenChange={(o) => setOpenColumnFilter(o ? col.filterKey! : null)}
                        />
                      )}
                    </span>
                  </th>
                  );
                })}
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
                        <CompanyLogo
                          domain={account.domain}
                          name={account.name}
                          size={24}
                          logoUrl={(account.properties?.logo_url as string | undefined) ?? null}
                        />

                        {/* Name + description */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSlideOverAccount(account)}
                              className="truncate text-left text-[13px] font-medium transition-colors hover:underline"
                              style={{ color: "var(--color-text-primary)" }}>
                              {account.name}
                            </button>
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

                    {/* Geography -- city / state / country */}
                    <td>
                      {(() => {
                        const geo = formatGeography(account);
                        return geo ? (
                          <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                            <MapPin size={11} style={{ color: "var(--color-text-muted)" }} />
                            {geo}
                          </span>
                        ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
                      })()}
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

                    {/* TAM-stream signal chips — 4 default signals
                        rendered in fixed column order. Each chip
                        reads from the live stream first, falling
                        back to persisted `properties.tamSignals`.
                        One shared `openSignalChipId` selector means
                        only one popover is open across the whole
                        table at any time. */}
                    {DEFAULT_SIGNALS.map(({ key }) => {
                      const { payload } = getTamSignal(account, key);
                      const chipId = `${account.id}::${key}`;
                      return (
                        <td key={key}>
                          <SignalChip
                            signalKey={key}
                            payload={payload}
                            label={signalLabelForHeader(key)}
                            id={chipId}
                            openId={openSignalChipId}
                            onOpenChange={setOpenSignalChipId}
                          />
                        </td>
                      );
                    })}

                    {/* User-defined custom signals — one chip per
                        active signal, reads from
                        `properties.customSignals[signalId]`. */}
                    {customSignals.map((custom) => {
                      const payload = getCustomSignalPayload(
                        account,
                        custom.id,
                      );
                      const chipId = `${account.id}::custom::${custom.id}`;
                      const shortLabel =
                        custom.name.length > 14
                          ? `${custom.name.slice(0, 13)}…`
                          : custom.name;
                      return (
                        <td key={`custom-${custom.id}`}>
                          <SignalChip
                            payload={payload}
                            label={shortLabel}
                            falseLabel="—"
                            id={chipId}
                            openId={openSignalChipId}
                            onOpenChange={setOpenSignalChipId}
                          />
                        </td>
                      );
                    })}

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
                      <div className="flex items-center gap-1">
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
                        <button
                          type="button"
                          aria-label={`Delete ${account.name}`}
                          title="Delete account"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ type: "single", id: account.id, name: account.name });
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
          {/* Infinite scroll sentinel — the IntersectionObserver effect
              auto-loads the next page when this enters view, so the list
              grows on scroll with no click. The text doubles as a manual
              fallback (clickable) for the rare case the observer can't
              fire (e.g. the loaded rows are shorter than the viewport). */}
          {currentPage < totalPages && (
            <div
              ref={loadMoreSentinelRef}
              className="flex items-center justify-center gap-2 border-t py-4"
              style={{ borderColor: "var(--color-border-default)" }}
            >
              {loadingMore ? (
                <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  <Loader2 size={14} className="animate-spin" />
                  Loading more…
                </span>
              ) : (
                <button
                  type="button"
                  onClick={loadMoreAccounts}
                  className="text-[12px] transition-colors hover:underline"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Showing {accounts.length} of {totalAccounts} — scroll to load more
                </button>
              )}
            </div>
          )}
          {currentPage >= totalPages && accounts.length > 0 && (
            <div className="flex items-center justify-center py-3">
              <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                Showing all {accounts.length} accounts
              </span>
            </div>
          )}
          </>
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
                          await refetchLoadedAccounts();
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
                          await refetchLoadedAccounts();
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

      {/* Delete confirmation — single row, current selection, or all. */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={
          deleteTarget?.type === "all"
            ? "Delete all accounts?"
            : deleteTarget?.type === "bulk"
              ? `Delete ${selectedRows.size} account${selectedRows.size === 1 ? "" : "s"}?`
              : "Delete account?"
        }
        description={
          deleteTarget?.type === "all"
            ? `This removes every account in this workspace (${totalAccounts}). Contacts and deals keep their records but are no longer attached to a listed account. This can be undone by support, but not from here.`
            : deleteTarget?.type === "bulk"
              ? `The selected account${selectedRows.size === 1 ? "" : "s"} will be removed from your Accounts list. Their contacts and deals are kept.`
              : `"${deleteTarget?.name ?? "This account"}" will be removed from your Accounts list. Its contacts and deals are kept.`
        }
        confirmLabel={
          deleteTarget?.type === "all"
            ? "Delete all"
            : deleteTarget?.type === "bulk"
              ? `Delete ${selectedRows.size}`
              : "Delete"
        }
        variant="destructive"
        busy={deleting}
        onConfirm={performDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </div>
  );
}
