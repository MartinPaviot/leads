"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { z } from "zod";
import { Building2, Search, Filter, Plus, Target, Radio, X, Globe, Factory, Ruler, DollarSign, GitBranch, Gauge, ExternalLink, Clock, Users, ChevronRight, ChevronDown, Loader2, Sparkles, Phone, MapPin, Trash2, UserPlus, Ban, RotateCcw, Archive, SlidersHorizontal, Layers, type LucideIcon } from "lucide-react";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions, useRegisterEntityLocator, cssEscape } from "@/lib/chat/page-actions/registry";
import type { EntityLocator } from "@/lib/chat/page-actions/registry";
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
import { getLifecycleStyle, displayScore } from "@/lib/util/ui-utils";
import { SlideOver, PropertyRow } from "@/components/slide-over";
import { CompanyLogo } from "@/components/ui/company-logo";
import { IntelligenceBrief } from "@/components/intelligence-brief";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/context/custom-fields";
import type { CustomFieldDef } from "@/lib/context/custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { PersonaSearch } from "./_persona-search";
import { Button } from "@/components/ui/button";
import { IndustryBadge, PropertyBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useT, useLocale } from "@/lib/i18n/locale";
import { chunkedBulkCall } from "@/lib/infra/chunk-bulk";
import { selectAllMatchingIds } from "@/lib/infra/select-all-matching";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { SmartSearchBar, ActiveFiltersChips } from "@/components/ui/smart-search-bar";
import { applyFilters } from "@/lib/search/filters";
import type { FilterCondition } from "@/lib/search/filters";
import { ColumnFilter, isColumnFilterActive, type ColumnFilterKind, type ColumnFilterState } from "@/components/ui/column-filter";
import { CascadeDeleteModal, type CascadeOption } from "@/components/ui/cascade-delete-modal";
import { EnrichMenu } from "@/components/ui/enrich-menu";
import { useEnrichStream, type EnrichCellState } from "@/hooks/use-enrich-stream";
import { ColumnPicker } from "@/components/ui/column-picker";
import { MoreMenu } from "@/components/ui/more-menu";
import { SourcingPreviewModal } from "@/components/sourcing-preview-modal";
import { COLUMN_CATEGORIES, DEFAULT_VISIBLE_CATEGORY_KEYS, getColumnCategory, buildPickerModel, isDynamicCategoryKey, isCategoryAvailable, customSignalKey, signalTypeKey, customFieldKey } from "@/lib/accounts/column-categories";
import { TAM_PROPOSALS_ENTRY_ENABLED } from "@/lib/tam/entry-visibility";
import { deriveAccountTabCounts } from "@/lib/accounts/tab-counts";
import { FiltersPanel, panelActiveCount, type PanelSection } from "@/components/ui/filters-panel";
import { accountReachLabel, ACCOUNT_REACH_BUCKETS } from "@/lib/accounts/account-segments";
import { recencyLabel, RECENCY_BUCKETS } from "@/lib/contacts/recency";

/** Firmographic-extra category columns (founded year, tech, funding,
 * keywords) — addable via the Categories picker, filled by the same
 * enrichment criteria they map to. */
const EXTRA_COLUMNS = COLUMN_CATEGORIES.filter((c) => c.group === "firmographic");
const CATEGORIES_STORAGE_KEY = "accounts:visibleCategories:v1";
// Opt-OUT companion to CATEGORIES_STORAGE_KEY: keys of always-on category
// columns (custom signals / detected signal types / custom fields) the user
// has hidden via the picker. Empty = the legacy behaviour (all shown).
const HIDDEN_CATEGORIES_STORAGE_KEY = "accounts:hiddenCategories:v1";

/** Whether an account already holds a firmographic-extra criterion's
 * value — used both to render the cell and to scope auto-fetch on add. */
function extraHasValue(account: Account, refKey: string): boolean {
  const p = (account.properties ?? {}) as Record<string, unknown>;
  switch (refKey) {
    case "foundedYear": return typeof p.founded_year === "number";
    case "technologies": return Array.isArray(p.technologies) && p.technologies.length > 0;
    case "funding": return typeof p.latest_funding_stage === "string" || typeof p.total_funding === "number";
    case "keywords": return Array.isArray(p.keywords) && p.keywords.length > 0;
    default: return false;
  }
}

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
  /** Effective stage computed server-side (manual override > deal-derived > 'new'). */
  lifecycleStage?: string | null;
  lastInteraction: { date: string; summary: string | null } | null;
}

/* ── CLE-07: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/** Human-readable summary of an applyFilter request (for the action result).
 *  Pure; emoji-free. Count is server-async, so it is not included here. */
function describeAccountFilters(p: {
  sourceTab?: "all" | "tam" | "manual";
  enrichmentPartition?: "all" | "unenriched" | "enriched";
  industry?: string[]; geography?: string[]; size?: string[]; revenue?: string[]; stage?: string[];
  score?: string[]; name?: string; domain?: string; linkedin?: "present" | "absent";
}): string {
  const parts: string[] = [];
  if (p.industry?.length) parts.push(p.industry.join("/"));
  if (p.geography?.length) parts.push(p.geography.join("/"));
  if (p.size?.length) parts.push("size " + p.size.join("/"));
  if (p.revenue?.length) parts.push("revenue " + p.revenue.join("/"));
  if (p.stage?.length) parts.push("stage " + p.stage.join("/"));
  if (p.score?.length) parts.push(p.score.join("/"));
  if (p.name) parts.push('name "' + p.name + '"');
  if (p.domain) parts.push('domain "' + p.domain + '"');
  if (p.linkedin) parts.push("LinkedIn " + p.linkedin);
  if (p.enrichmentPartition && p.enrichmentPartition !== "all") parts.push(p.enrichmentPartition);
  if (p.sourceTab && p.sourceTab !== "all") parts.push(p.sourceTab === "tam" ? "sourced" : "added");
  return parts.length ? parts.join(", ") : "no filters";
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

export default function AccountsPage() {
  const { toast } = useToast();
  const t = useT();
  const { locale } = useLocale();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "tam" | "manual">("all");
  // Enrichment partition — independent of the source tab. "unenriched" isolates
  // the accounts still missing their base firmographics so the user can bulk-
  // enrich just those (and not pay to re-enrich the ones already enriched).
  const [enrichmentFilter, setEnrichmentFilter] = useState<"all" | "unenriched" | "enriched">("all");
  // Per-column header filters (Notion / Excel style). Keyed by the
  // column's filterKey → its filter state. An entry only exists while
  // the column constrains the list; clearing it deletes the key.
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  // Debounced copy pushed to the server — column/tab/smart filters run
  // server-side now, so the header total and the paginated list both reflect
  // them. 350ms so typing in a text column filter doesn't refetch per keystroke.
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  // Filter dropdown options (distinct enum values) from the server, so the
  // menus stay complete even though only the filtered rows are loaded.
  const [serverFacets, setServerFacets] = useState<{ industries: string[]; geographies: string[]; sizes: string[]; revenues: string[]; stages: string[] } | null>(null);
  // Per-value row counts for each enum facet, keyed by the column's filterKey
  // (industry / geography / size / revenue / stage / score). Drives the "(N)"
  // shown next to every value in the header dropdowns.
  const [serverFacetCounts, setServerFacetCounts] = useState<Record<string, Record<string, number>> | null>(null);
  // Tenant-wide working-set counts (independent of the active filters) for the
  // tab + enrich badges, so they show true totals rather than the loaded subset.
  const [serverCounts, setServerCounts] = useState<{ total: number; tam: number; manual: number; unenriched: number } | null>(null);
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null);
  // Dedicated "Filtres" panel — segment cuts with no column home (contact
  // reach, engagement recency, sector family, region). Reads/writes columnFilters.
  const [showFilters, setShowFilters] = useState(false);
  // Sector-family facet (LLM-classified) — fetched lazily when the panel first
  // opens, so the multi-second classification never blocks the accounts list.
  const [familyFacet, setFamilyFacet] = useState<Array<{ key: string; label: string; count: number }> | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  // Bulk contact extraction (Apollo) + delete flows.
  const [extractingContacts, setExtractingContacts] = useState(false);
  // Accounts the sourcing-preview modal is open for (null = closed).
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  // Deletes — single row AND the checkbox selection — go through the cascade
  // modal (lets the user also delete related contacts/deals/activities/notes/
  // tasks in one step). Everything is soft-delete, recoverable from Archive.
  const [cascadeTarget, setCascadeTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [cascadeCounts, setCascadeCounts] = useState<CascadeOption[] | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const [detectingSignals, setDetectingSignals] = useState(false);
  // "Score all accounts" (header More menu): true from enqueue until the
  // recompute summary lands (or the poll caps out), so the item can't
  // double-fire while a tenant-wide run is in flight.
  const [rescoringAll, setRescoringAll] = useState(false);
  // Stops the recompute-status poll if the page unmounts mid-run.
  const rescorePollStop = useRef(false);
  useEffect(() => () => { rescorePollStop.current = true; }, []);
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced search term pushed to the server. The accounts endpoint
  // resolves it to the matching industries via an LLM (intelligent, not a
  // hardcoded synonym list) plus a name/domain/description match, so the
  // returned rows are already the matched set across the whole tenant —
  // and `totalAccounts` is the matched count, not the library size.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // NL persona search — "describe who you want to reach" -> ICP.
  const [showPersona, setShowPersona] = useState(false);
  const [activeSignalPopover, setActiveSignalPopover] = useState<string | null>(null);
  const [signalPopoverTab, setSignalPopoverTab] = useState<"reasoning" | "sources">("reasoning");
  const [slideOverAccount, setSlideOverAccount] = useState<Account | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  // "Not a fit" view toggle. false = active working set (excluded hidden);
  // true = show only excluded accounts so they can be reviewed / restored.
  const [viewExcluded, setViewExcluded] = useState(false);
  // Archive view toggle. true = show only soft-deleted (removed) accounts so
  // they can be reviewed and restored. Mutually exclusive with viewExcluded.
  const [viewDeleted, setViewDeleted] = useState(false);
  // Categories column-picker panel — opened from the header More menu
  // (the picker's own trigger is hidden there).
  const [showCategoriesPanel, setShowCategoriesPanel] = useState(false);
  // Count of pending TAM proposals — drives the header entry point into
  // the review surface so the living-TAM loops are never a dead-end.
  const [proposalCount, setProposalCount] = useState(0);
  // Smart Search — NL query translated into FilterCondition[] via LLM.
  // Stacks with the existing tab `filter` and the text `searchQuery`.
  // Cleared on tab switch is intentional: tabs partition the dataset
  // differently and a smart filter extracted for "prospects" likely
  // doesn't apply to "manual".
  const [smartFilters, setSmartFilters] = useState<FilterCondition[]>([]);
  const [smartMeta, setSmartMeta] = useState<{ reasoning: string; unmatched: string[] } | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [expandedContacts, setExpandedContacts] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; title: string | null; email: string | null; status?: string }>>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  // On-demand contact sourcing for the inline expanded row. Only one
  // account is expanded at a time, so a single state pair is enough;
  // both reset whenever the expanded row changes.
  const [sourcingContacts, setSourcingContacts] = useState(false);
  const [sourceResult, setSourceResult] = useState<
    { tone: "info" | "error"; text: string; retry?: boolean; href?: string; hrefLabel?: string } | null
  >(null);
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

  // ── Live criteria enrichment ──
  // Per-cell "searching… → value / not found" feedback from
  // /api/enrich/stream. Replaces the old fire-and-forget enrich that
  // marked rows "done" even when nothing was actually filled.
  const enrichStream = useEnrichStream();

  // Run criteria enrichment with live feedback. `ids` defaults to the
  // loaded accounts still missing their base firmographics; pass a
  // selection to scope it. Honest by construction — the stream reports
  // filled / already-present / not-found per cell.
  const runEnrich = useCallback(
    (criteria: string[], ids?: string[]) => {
      const targetIds =
        ids && ids.length > 0
          ? ids
          : accounts.filter((a) => !(a.industry && a.description)).map((a) => a.id);
      if (targetIds.length === 0) {
        toast("No accounts need enrichment.", "info");
        return;
      }
      // Any size — the hook chains batches of 100 (the endpoint's
      // per-request cap) into one continuous run, so a select-all-sized
      // selection enriches end to end with a single click.
      enrichStream.start({ companyIds: targetIds, criteria });
    },
    [accounts, enrichStream, toast],
  );

  // Live overlay for an enrichable cell. While the stream fetches a
  // criterion the cell shimmers; if it came back empty we say "not found"
  // (honest) rather than a blank "—"; otherwise the real cell renders.
  const renderEnrichable = (
    accountId: string,
    criterionKey: string,
    hasValue: boolean,
    node: React.ReactNode,
  ): React.ReactNode => {
    const cell: EnrichCellState | undefined = enrichStream.cells.get(accountId)?.get(criterionKey);
    if (cell?.status === "searching") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Loader2 size={11} className="animate-spin" /> searching…
        </span>
      );
    }
    if (!hasValue && cell?.status === "resolved") {
      if (cell.outcome === "not-found") {
        return <span className="text-[11px] italic" style={{ color: "var(--color-text-muted)" }}>not found</span>;
      }
      if (cell.value) {
        return <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{cell.value}</span>;
      }
    }
    return node;
  };

  // ── Category columns (show/hide via the Categories picker) ──
  // Two visibility models meet in the one picker:
  //  - built-in signals + firmographic extras are opt-IN (`visibleCategories`,
  //    default off) — adding one also fetches its data;
  //  - always-on columns (custom signals / detected signal types / custom
  //    fields) are opt-OUT (`hiddenCategories`, default shown) so a column
  //    already on the page shows checked and can be unchecked to hide it.
  // Both choices persist per browser.
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(
    () => new Set(DEFAULT_VISIBLE_CATEGORY_KEYS),
  );
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      // Drop any catalogued-but-not-connected keys a previous build may
      // have persisted, so an unavailable column can't resurrect itself.
      if (raw) setVisibleCategories(new Set((JSON.parse(raw) as string[]).filter(isCategoryAvailable)));
      const rawHidden = localStorage.getItem(HIDDEN_CATEGORIES_STORAGE_KEY);
      if (rawHidden) setHiddenCategories(new Set(JSON.parse(rawHidden) as string[]));
    } catch {
      /* localStorage unavailable — keep defaults */
    }
  }, []);
  // Opt-out toggle for an always-on dynamic column: flip its hidden flag.
  const toggleHiddenCategory = useCallback((key: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(HIDDEN_CATEGORIES_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const toggleCategory = useCallback((key: string) => {
    // Always-on dynamic columns hide/show via the opt-out set — no fetch.
    if (isDynamicCategoryKey(key)) {
      toggleHiddenCategory(key);
      return;
    }
    // Catalogued-but-not-connected (e.g. Crunchbase): the picker disables
    // the row, but guard here too so it can never be added programmatically.
    if (!isCategoryAvailable(key)) return;
    const isAdding = !visibleCategories.has(key);
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
    // Auto-fetch on ADD: a freshly-shown column shouldn't just sit empty —
    // pull its data via the category's known method. (Done outside the
    // state updater so it never double-fires under StrictMode.)
    if (!isAdding) return;
    const cat = getColumnCategory(key);
    if (!cat) return;
    if (cat.kind === "enrich") {
      const ids = accounts.filter((a) => !extraHasValue(a, cat.refKey)).map((a) => a.id);
      if (ids.length === 0) {
        toast(`Every loaded account already has ${cat.label}.`, "info");
        return;
      }
      toast(`Fetching ${cat.label} for ${ids.length} account${ids.length === 1 ? "" : "s"}…`, "info");
      runEnrich([cat.refKey], ids);
    } else if (cat.kind === "signal") {
      detectSignals();
    }
  }, [visibleCategories, accounts, runEnrich, detectSignals, toast, toggleHiddenCategory]);
  const resetCategories = useCallback(() => {
    setVisibleCategories(new Set(DEFAULT_VISIBLE_CATEGORY_KEYS));
    setHiddenCategories(new Set());
    try {
      localStorage.removeItem(CATEGORIES_STORAGE_KEY);
      localStorage.removeItem(HIDDEN_CATEGORIES_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  /** Render a firmographic-extra cell (founded year / tech / funding /
   * keywords) from `properties`, wrapped in the live enrichment overlay
   * so it shimmers while its criterion is being fetched. */
  const renderExtraCell = (account: Account, refKey: string): React.ReactNode => {
    const p = (account.properties ?? {}) as Record<string, unknown>;
    const muted = <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
    const hasValue = extraHasValue(account, refKey);
    let node: React.ReactNode = muted;
    if (hasValue && refKey === "foundedYear") {
      node = <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{p.founded_year as number}</span>;
    } else if (hasValue && refKey === "technologies") {
      const t = p.technologies as string[];
      node = <div className="flex flex-wrap gap-0.5">{t.slice(0, 3).map((v, i) => <PropertyBadge key={i} value={String(v)} />)}</div>;
    } else if (hasValue && refKey === "funding") {
      const stage = typeof p.latest_funding_stage === "string" ? p.latest_funding_stage : null;
      const total = typeof p.total_funding === "number" ? (p.total_funding as number) : null;
      const txt = [stage, total != null ? `$${(total / 1_000_000).toFixed(total >= 1_000_000 ? 0 : 1)}M` : null].filter(Boolean).join(" · ");
      node = <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{txt}</span>;
    } else if (hasValue && refKey === "keywords") {
      const k = p.keywords as string[];
      node = <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }} title={k.join(", ")}>{k.slice(0, 3).join(", ")}</span>;
    }
    return renderEnrichable(account.id, refKey, hasValue, node);
  };

  // ── ICP profile picker for sourcing (Phase 1, _specs/icp-unification
  // R6.1): "Find more accounts" sources from a profile's criteria
  // (rank 1 by default) instead of the legacy LLM planner over flat
  // settings. Tenants with no usable profile keep the legacy path.
  const [sourceProfiles, setSourceProfiles] = useState<
    Array<{ id: string; name: string; criteriaCount: number; status: string }>
  >([]);
  const [sourceIcpId, setSourceIcpId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/icps")
      .then((r) => (r.ok ? r.json() : { icps: [] }))
      .then((data) => {
        const usable = ((data.icps ?? []) as Array<{ id: string; name: string; criteriaCount: number; status: string }>)
          .filter((i) => i.status === "active" && i.criteriaCount > 0);
        setSourceProfiles(usable);
        // Default to "all" (source from EVERY profile) when there are 2+;
        // with a single profile "all" is redundant so default to it directly.
        // (/api/icps orders by priority; first usable = rank 1.)
        setSourceIcpId((cur) => cur ?? (usable.length > 1 ? "all" : usable[0]?.id ?? null));
      })
      .catch(() => {});
  }, []);

  // CLE-07 §4: the BuildRequest assembly + tamStream.start of startTamBuild,
  // parameterized so accounts.startTamBuild can pass icpId / allProfiles /
  // targetCount explicitly. Keeps the apolloOverrides from the active filters.
  // One copy of the BuildRequest shape; the button calls it with its own args.
  const startTamBuildWith = useCallback(
    async (opts: { icpId?: string; allProfiles?: boolean; targetCount?: number }) => {
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
      await tamStream.start({
        targetCount: opts.targetCount ?? 300,
        // allProfiles → source from every usable profile (send the full id
        // list); a specific id → that one profile; neither → legacy planner.
        ...(opts.allProfiles
          ? { icpIds: sourceProfiles.map((p) => p.id) }
          : opts.icpId
            ? { icpId: opts.icpId }
            : {}),
        ...(hasOverrides ? { apolloOverrides } : {}),
      });
    },
    [tamStream, columnFilters, sourceProfiles],
  );

  const startTamBuild = useCallback(async () => {
    await startTamBuildWith({
      icpId: sourceIcpId === "all" ? undefined : sourceIcpId ?? undefined,
      allProfiles: sourceIcpId === "all",
    });
  }, [startTamBuildWith, sourceIcpId]);

  // CLE-07 §4: a second caller of the SAME request the SmartSearchBar issues
  // (POST /api/filters/parse-nl { query, resourceType:"account" },
  // smart-search-bar.tsx). The bar is untouched; accounts.smartSearch is the
  // only caller of this helper, applying the result via the bar's own callbacks.
  const runSmartSearch = useCallback(
    async (query: string): Promise<{ filters: FilterCondition[]; meta: { reasoning: string; unmatched: string[] } }> => {
      try {
        const res = await fetch("/api/filters/parse-nl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, resourceType: "account" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { filters: [], meta: { reasoning: "", unmatched: [] } };
        return {
          filters: (data?.filters as FilterCondition[] | undefined) ?? [],
          meta: {
            reasoning: String(data?.reasoning ?? ""),
            unmatched: Array.isArray(data?.unmatched) ? data.unmatched : [],
          },
        };
      } catch {
        return { filters: [], meta: { reasoning: "", unmatched: [] } };
      }
    },
    [],
  );

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

  /** Serialize the active tab + column + smart filters into the query params
   *  the /api/accounts route understands. Server-side filtering is what makes
   *  the header total + paginated list reflect the filters. */
  const serializeAccountFilters = useCallback((): URLSearchParams => {
    const p = new URLSearchParams();
    if (filter !== "all") p.set("tab", filter);
    if (enrichmentFilter === "unenriched") p.set("fEnriched", "no");
    else if (enrichmentFilter === "enriched") p.set("fEnriched", "yes");
    const ENUM_PARAM: Record<string, string> = {
      industry: "fIndustry", geography: "fGeography", size: "fSize",
      revenue: "fRevenue", stage: "fStage", score: "fGrade",
      // Filters panel (no column home): contact reach + recency + region + sector family.
      contactReach: "fContactReach", recency: "fRecency", region: "fRegion", family: "fFamily",
    };
    const TEXT_PARAM: Record<string, string> = { name: "fName", domain: "fDomain" };
    for (const [key, fst] of Object.entries(debouncedColumnFilters)) {
      if (!isColumnFilterActive(fst)) continue;
      if (TEXT_PARAM[key] && fst.text && fst.text.trim()) p.set(TEXT_PARAM[key], fst.text.trim());
      else if (ENUM_PARAM[key] && fst.values && fst.values.length > 0) p.set(ENUM_PARAM[key], fst.values.join(","));
      else if (key === "linkedin" && fst.presence) p.set("fLinkedin", fst.presence);
    }
    // Smart-filter score threshold (e.g. "high fit" -> score >= 70).
    for (const c of smartFilters) {
      if (c.field !== "score") continue;
      const n = typeof c.value === "number" ? c.value : Number(c.value);
      if (!Number.isFinite(n)) continue;
      if (c.operator === "gte" || c.operator === "gt") p.set("fScoreMin", String(n));
      else if (c.operator === "lte" || c.operator === "lt") p.set("fScoreMax", String(n));
      else if (c.operator === "eq") { p.set("fScoreMin", String(n)); p.set("fScoreMax", String(n)); }
    }
    return p;
  }, [filter, enrichmentFilter, debouncedColumnFilters, smartFilters]);

  /** The COMPLETE filter state /api/accounts understands — view toggles
   *  (excluded/deleted) + search + tab/column/score filters. Single source
   *  for the page fetch, the refetch and select-all-matching, so they can
   *  never drift apart. */
  const listFilterParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (viewExcluded) params.set("excluded", "true");
    if (viewDeleted) params.set("deleted", "true");
    for (const [k, v] of serializeAccountFilters()) params.set(k, v);
    return params;
  }, [debouncedSearch, viewExcluded, viewDeleted, serializeAccountFilters]);

  // Sections for the dedicated Filters panel — the two account cuts with no
  // column home, from the server segment facet counts (lib/accounts/account-segments).
  const filterSections = useMemo<PanelSection[]>(() => {
    const reachCounts = serverFacetCounts?.contactReach ?? {};
    const reachOpts = ACCOUNT_REACH_BUCKETS.filter((b) => reachCounts[b] != null).map((b) => ({
      value: b as string,
      label: accountReachLabel(b, locale),
    }));
    const recencyCounts = serverFacetCounts?.recency ?? {};
    const recencyOpts = RECENCY_BUCKETS.filter((b) => recencyCounts[b] != null).map((b) => ({
      value: b as string,
      label: recencyLabel(b, locale),
    }));
    const regionCounts = serverFacetCounts?.region ?? {};
    const regionOpts = Object.keys(regionCounts)
      .sort((a, b) => (regionCounts[b] ?? 0) - (regionCounts[a] ?? 0))
      .map((v) => ({ value: v, label: v }));
    const famList = familyFacet ?? [];
    const familyOpts = famList.map((f) => ({ value: f.key, label: f.label }));
    const familyCountsObj = Object.fromEntries(famList.map((f) => [f.key, f.count]));
    return [
      {
        title: t("filters.section.sector"),
        filters: [
          { key: "family", label: t("filters.family.label"), options: familyOpts, counts: familyCountsObj, hint: familyLoading ? t("filters.family.hintLoading") : t("filters.family.hint") },
        ],
      },
      {
        title: t("filters.section.geography"),
        filters: [
          { key: "region", label: t("filters.region.label"), options: regionOpts, counts: regionCounts, hint: t("filters.region.hint") },
        ],
      },
      {
        title: t("filters.section.reachability"),
        filters: [
          { key: "contactReach", label: t("filters.contactReach.label"), options: reachOpts, counts: reachCounts, hint: t("filters.contactReach.hint") },
        ],
      },
      {
        title: t("filters.section.engagement"),
        filters: [
          { key: "recency", label: t("filters.recency.label"), options: recencyOpts, counts: recencyCounts, hint: t("filters.recency.hintAccounts") },
        ],
      },
    ];
  }, [serverFacetCounts, familyFacet, familyLoading, t, locale]);
  const panelActive = panelActiveCount(filterSections, columnFilters);

  // Lazy-load the sector-family facet the first time the Filtres panel opens.
  useEffect(() => {
    if (!showFilters || familyFacet !== null || familyLoading) return;
    setFamilyLoading(true);
    fetch("/api/industry-families?entity=account")
      .then((r) => (r.ok ? r.json() : { families: [] }))
      .then((d) => setFamilyFacet(d.families ?? []))
      .catch(() => setFamilyFacet([]))
      .finally(() => setFamilyLoading(false));
  }, [showFilters, familyFacet, familyLoading]);

  /** Fetch a single page of accounts.
   *  - page=1, append=false → initial load (replaces list)
   *  - page>1, append=true  → "Load more" click
   *  When called with no args after a mutation (enrich, score, etc.)
   *  it reloads all pages that were previously loaded so the user
   *  doesn't lose their scroll position / loaded data. */
  const fetchAccounts = useCallback(async (page = 1, append = false) => {
    const isInitial = page === 1 && !append;
    try {
      if (isInitial) { setLoading(true); setLoadError(false); }
      else setLoadingMore(true);
      const params = listFilterParams();
      params.set("pageSize", "200");
      params.set("page", String(page));
      const res = await fetch(`/api/accounts?${params.toString()}`);
      if (!res.ok) {
        // Was a bare return: a 500 on the first page left accounts=[] and
        // rendered the "No accounts" empty state, masking a backend failure as
        // an empty library. (An append/load-more failure just stops paging.)
        if (isInitial) setLoadError(true);
        return;
      }
      const data = await res.json();
      if (data.facets) setServerFacets(data.facets);
      if (data.facetCounts) setServerFacetCounts(data.facetCounts);
      if (data.counts) setServerCounts(data.counts);
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
      if (isInitial) setLoadError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [listFilterParams]);

  /** Reload all pages that have been loaded so far. Used after mutations
   *  (enrich, score, create) so the user doesn't snap back to page 1. */
  const refetchLoadedAccounts = useCallback(async () => {
    try {
      const pagesToLoad = Math.max(currentPage, 1);
      let all: Account[] = [];
      let failed = false;
      for (let p = 1; p <= pagesToLoad; p++) {
        const params = listFilterParams();
        params.set("pageSize", "200");
        params.set("page", String(p));
        const res = await fetch(`/api/accounts?${params.toString()}`);
        if (!res.ok) { failed = true; break; }
        const data = await res.json();
        const batch: Account[] = data.accounts || data.items || [];
        all = [...all, ...batch];
        if (p === pagesToLoad) {
          const pagination = data.pagination as { total: number; totalPages: number } | undefined;
          setTotalAccounts(pagination?.total ?? all.length);
          setTotalPages(pagination?.totalPages ?? 1);
        }
      }
      // Don't replace the loaded list with a partial reload when a page failed —
      // that would silently drop rows. Keep what's on screen.
      if (!failed) setAccounts(all);
    } catch (e) {
      console.warn("accounts: refetch failed", e);
    }
  }, [currentPage, listFilterParams]);

  const loadMoreAccounts = useCallback(() => {
    if (loadingMore || currentPage >= totalPages) return;
    fetchAccounts(currentPage + 1, true);
  }, [fetchAccounts, loadingMore, currentPage, totalPages]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Pending TAM-proposal count for the header entry point.
  useEffect(() => {
    if (!TAM_PROPOSALS_ENTRY_ENABLED) return;
    (async () => {
      try {
        const res = await fetch("/api/tam/proposals?status=pending&limit=1");
        if (!res.ok) return;
        const data = await res.json();
        setProposalCount(data.counts?.pending ?? 0);
      } catch {
        /* non-fatal */
      }
    })();
  }, []);

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

  // When the enrichment stream finishes, pull the freshly-written values
  // from the DB so the filled cells render their canonical formatting
  // (the live overlay was only a preview). Toasts a one-line summary.
  useEffect(() => {
    if (enrichStream.terminated !== "done") return;
    refetchLoadedAccounts();
    const s = enrichStream.summary;
    if (s) {
      if (s.enriched > 0) {
        toast(
          `Enriched ${s.enriched} account${s.enriched === 1 ? "" : "s"}${s.noData > 0 ? ` · ${s.noData} with no new data` : ""}.`,
          "success",
        );
      } else if (s.noData > 0) {
        toast(`No new data found for ${s.noData} account${s.noData === 1 ? "" : "s"}.`, "info");
      } else if (s.alreadyComplete > 0) {
        toast(`Already complete — nothing to fetch.`, "info");
      }
    }
  }, [enrichStream.terminated, enrichStream.summary, refetchLoadedAccounts, toast]);

  // A transport failure mid-run (endpoint unreachable, rate-limited…)
  // stops the batch chain — say where it stopped, and pull whatever DID
  // land, instead of ending silently.
  useEffect(() => {
    if (enrichStream.terminated !== "error") return;
    refetchLoadedAccounts();
    toast(
      `Enrichment stopped early — ${enrichStream.processed} of ${enrichStream.total} account${enrichStream.total === 1 ? "" : "s"} processed.`,
      "warning",
    );
  }, [enrichStream.terminated, enrichStream.processed, enrichStream.total, refetchLoadedAccounts, toast]);

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

  // CLE-07 §4: the network body of bulkScoreSelected, parameterized by ids so
  // both the bulk-bar button and accounts.bulkScore/scoreAccount call the SAME
  // /api/score chunkedBulkCall (+ refetch). One copy.
  const scoreByIds = useCallback(
    async (ids: string[]): Promise<{ total: number; succeeded: number; failed: number }> => {
      if (ids.length === 0) return { total: 0, succeeded: 0, failed: 0 };
      const r = await chunkedBulkCall({
        ids,
        endpoint: "/api/score",
        buildPayload: (chunk) => ({ companyIds: chunk }),
      });
      if (r.succeeded > 0) await refetchLoadedAccounts();
      return { total: r.total, succeeded: r.succeeded, failed: r.failed };
    },
    [refetchLoadedAccounts],
  );

  // Bulk score the current selection (or all unscored when nothing is
  // selected). Enrichment now runs through the streaming EnrichMenu.
  // The selection is used AS IS — after select-all-matching it can hold ids
  // beyond the loaded rows, and the score endpoint only needs ids; filtering
  // through `accounts` here would silently drop the unloaded ones.
  async function bulkScoreSelected() {
    const ids =
      selectedRows.size > 0
        ? Array.from(selectedRows)
        : accounts.filter((a) => a.score == null).map((a) => a.id);
    if (ids.length === 0) return;
    try {
      const r = await scoreByIds(ids);
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

  // "Score all accounts" (header More menu). Fires the same per-tenant
  // Inngest recompute as the nightly cron / ICP save / TAM build, then
  // polls the run summary (3 s cadence, 90 s cap — the ICP editor's
  // diff-after-save pattern) and repaints the rows with the regrade diff.
  async function rescoreAllAccounts() {
    if (rescoringAll) return;
    setRescoringAll(true);
    rescorePollStop.current = false;
    const since = new Date().toISOString();
    try {
      const res = await fetch("/api/icps/recompute", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(data.error ?? `Re-score failed (${res.status})`, "error");
        setRescoringAll(false);
        return;
      }
    } catch (e) {
      toast("Re-score failed — network error.", "error");
      console.warn("accounts: rescore-all enqueue failed", e);
      setRescoringAll(false);
      return;
    }
    toast("Scoring every account against your ICP profiles…", "info");

    const deadline = Date.now() + 90_000;
    const tick = async () => {
      if (rescorePollStop.current) return;
      try {
        const res = await fetch("/api/icps/recompute-status");
        if (res.ok) {
          const data = (await res.json()) as {
            lastIcpRecompute: { at: string; companies: number; regradedUp: number; regradedDown: number } | null;
          };
          const s = data.lastIcpRecompute;
          if (s && s.at > since) {
            setRescoringAll(false);
            await refetchLoadedAccounts();
            toast(`Scored ${s.companies} accounts — ${s.regradedUp} regraded up, ${s.regradedDown} down.`, "success");
            return;
          }
        }
      } catch {
        // transient — keep polling until the deadline
      }
      if (Date.now() < deadline) setTimeout(tick, 3_000);
      else {
        setRescoringAll(false);
        await refetchLoadedAccounts();
        toast("Re-score is still running — scores keep updating in the background.", "info");
      }
    };
    setTimeout(tick, 3_000);
  }

  // CLE-07 §4: the enriched-scoping + /api/signals chunkedBulkCall body of
  // detectSignals, parameterized by a candidate id set. Scopes to the enriched
  // subset (the same filter the button used) then runs the batch (+ refetch).
  // One copy, shared by the button and accounts.bulkDetectSignals.
  const detectSignalsByIds = useCallback(
    async (candidateIds: string[]): Promise<{ total: number; succeeded: number; failed: number }> => {
      const enrichedSet = new Set(accounts.filter((a) => isEnriched(a)).map((a) => a.id));
      const ids = candidateIds.filter((id) => enrichedSet.has(id));
      if (ids.length === 0) return { total: 0, succeeded: 0, failed: 0 };
      const result = await chunkedBulkCall({
        ids,
        endpoint: "/api/signals",
        buildPayload: (chunk) => ({ companyIds: chunk }),
        onProgress: (done, total) => {
          if (total > 20) toast(`Detecting signals ${done} / ${total}…`, "info");
        },
      });
      if (result.succeeded > 0) await refetchLoadedAccounts();
      return { total: result.total, succeeded: result.succeeded, failed: result.failed };
    },
    [accounts, refetchLoadedAccounts, toast],
  );

  async function detectSignals() {
    const ids = accounts.filter((a) => isEnriched(a)).map((a) => a.id);
    if (ids.length === 0) return;
    setDetectingSignals(true);
    try {
      const result = await detectSignalsByIds(ids);
      if (result.failed === 0) {
        toast(`Detected signals for ${result.succeeded} accounts.`, "success");
      } else if (result.succeeded > 0) {
        toast(`Signals for ${result.succeeded} of ${result.total}. ${result.failed} failed.`, "warning");
        console.warn("accounts: detect-signals partial failure", result.failed);
      } else {
        toast("Failed to detect signals.", "error");
        console.warn("accounts: detect-signals all chunks failed", result.failed);
      }
    } catch (e) {
      toast("Failed to detect signals.", "error");
      console.warn("accounts: detect-signals crashed", e);
    } finally { setDetectingSignals(false); }
  }

  // CLE-07 §4: the 50-id fan-out POST /api/accounts/extract-contacts loop of
  // extractContactsSelected, parameterized by ids. One copy, shared by the
  // bulk-bar button and accounts.bulkExtractContacts. Returns the created /
  // processed totals (or an error) instead of toasting — the button keeps its
  // own toasts.
  const extractContactsByIds = useCallback(
    async (ids: string[]): Promise<{ totalCreated: number; accountsProcessed: number; error?: string }> => {
      if (ids.length === 0) return { totalCreated: 0, accountsProcessed: 0 };
      let totalCreated = 0;
      let accountsProcessed = 0;
      for (let i = 0; i < ids.length; i += 50) {
        if (ids.length > 50 && i > 0) {
          toast(`Extracting contacts ${Math.min(i + 50, ids.length)} / ${ids.length}…`, "info");
        }
        const res = await fetch("/api/accounts/extract-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountIds: ids.slice(i, i + 50) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (totalCreated > 0) break; // partial run — report what landed
          return { totalCreated: 0, accountsProcessed: 0, error: data?.error || "Failed to extract contacts." };
        }
        totalCreated += data.totalCreated ?? 0;
        accountsProcessed += data.accountsProcessed ?? 0;
      }
      return { totalCreated, accountsProcessed };
    },
    [toast],
  );

  // Pull real contacts (Apollo) for the selected accounts and persist
  // them. Deduped server-side against contacts already on each account.
  async function extractContactsSelected(idsOverride?: string[]) {
    const ids = idsOverride ?? Array.from(selectedRows);
    if (ids.length === 0) return;
    setExtractingContacts(true);
    toast(`Extracting contacts for ${ids.length} account${ids.length === 1 ? "" : "s"}…`, "info");
    // The endpoint processes at most 50 accounts per call (it silently slices
    // beyond that) — fan out in 50-id chunks so EVERY selected account gets
    // sourced. The first failed chunk aborts the rest: its cause (sourcing
    // key missing, rate limit) would fail them all the same way.
    try {
      const r = await extractContactsByIds(ids);
      if (r.error) {
        toast(r.error, "error");
        return;
      }
      if (r.totalCreated > 0) {
        toast(
          `Added ${r.totalCreated} contact${r.totalCreated === 1 ? "" : "s"} across ${r.accountsProcessed} account${r.accountsProcessed === 1 ? "" : "s"}.`,
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

  // Read the contacts already linked to an account for the inline
  // expanded row. The endpoint is POST (a pure read, but defined as POST
  // and covered by a POST test); calling it without a method hits a 405
  // and silently renders the empty state — the latent bug this fixes.
  // Shared by the expand toggle and the post-sourcing refresh.
  const loadExpandedContacts = useCallback(async (accountId: string) => {
    setLoadingContacts(true);
    try {
      const r = await fetch(`/api/accounts/${accountId}/contacts`, { method: "POST" });
      const d = r.ok ? await r.json() : { contacts: [] };
      setExpandedContacts(d.contacts || []);
    } catch {
      setExpandedContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  // Source decision-makers for a single account on demand — the inline
  // "Find contacts" action in the expanded empty state. Reuses the same
  // Apollo extract endpoint as the bulk action, scoped to one id, and
  // turns its per-account result into a clear outcome: contacts rendered
  // on success, or a specific reason + next step otherwise. Never a bare
  // "no contacts found" dead-end.
  async function findContactsForAccount(account: Account) {
    setSourcingContacts(true);
    setSourceResult(null);
    try {
      const res = await fetch("/api/accounts/extract-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: [account.id], perAccount: 10 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        totalCreated?: number;
        results?: Array<{ found: number; created: number; error?: string }>;
      };

      // Apollo key missing (env-level): can't source automatically.
      if (res.status === 503) {
        setSourceResult({ tone: "error", text: "Automatic sourcing isn't available right now, so contacts can't be pulled. Add one manually for now." });
        return;
      }
      if (!res.ok) {
        setSourceResult({ tone: "error", text: data.error || "Couldn't source contacts. Try again.", retry: true });
        return;
      }

      const result = data.results?.[0];
      const created = result?.created ?? 0;
      const found = result?.found ?? 0;

      if (created > 0) {
        await loadExpandedContacts(account.id);
        toast(`Added ${created} contact${created === 1 ? "" : "s"} at ${account.name}.`, "success");
        return;
      }
      if (result?.error === "No domain") {
        setSourceResult({ tone: "info", text: `No website on file for ${account.name} — add one on the account so its team can be sourced.`, href: `/accounts/${account.id}`, hrefLabel: "Open account" });
        return;
      }
      if (result?.error === "Apollo search failed") {
        setSourceResult({ tone: "error", text: "The sourcing engine didn't respond. Try again in a moment.", retry: true });
        return;
      }
      // Searched successfully, but nothing new to add.
      setSourceResult({
        tone: "info",
        text: found > 0
          ? `Found ${found} ${found === 1 ? "person" : "people"} at ${account.domain ?? account.name}, but they're already on file or have no usable email.`
          : `No decision-makers found at ${account.domain ?? account.name} for your target roles.`,
        href: "/settings/icp",
        hrefLabel: "Adjust target roles",
      });
    } catch {
      setSourceResult({ tone: "error", text: "Couldn't reach the server. Try again.", retry: true });
    } finally {
      setSourcingContacts(false);
    }
  }

  // CLE-07 §4: the 500-id-chunk /api/accounts/exclude chunkedBulkCall body of
  // bulkSetExclusion, parameterized by ids + action (+ refetch). One copy,
  // shared by the button and accounts.bulkExclude / bulkRestore. Returns the
  // counts; the button keeps its own toast / setSelectedRows.
  const setExclusionByIds = useCallback(
    async (ids: string[], action: "exclude" | "include"): Promise<{ succeeded: number; failed: number }> => {
      if (ids.length === 0) return { succeeded: 0, failed: 0 };
      const result = await chunkedBulkCall({
        ids,
        chunkSize: 500,
        endpoint: "/api/accounts/exclude",
        buildPayload: (chunk) => ({ ids: chunk, action }),
      });
      if (result.succeeded > 0) await refetchLoadedAccounts();
      return { succeeded: result.succeeded, failed: result.failed };
    },
    [refetchLoadedAccounts],
  );

  // Exclude ("not a fit") / restore the current selection. Reversible —
  // the row stays (still feeds the TAM-build dedup set so it is never
  // re-sourced) and outbound enrollment is already gated on the flag.
  async function bulkSetExclusion(action: "exclude" | "include") {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    // The endpoint validates at most 1000 ids per call (rejects beyond, not
    // truncates) — chunk at 500 so a select-all-sized selection still lands
    // in one or a few requests instead of a hard 400.
    const result = await setExclusionByIds(ids, action);
    if (result.succeeded === 0) {
      console.warn("accounts: bulk exclusion failed", result.failed);
      toast(action === "exclude" ? "Couldn't exclude." : "Couldn't restore.", "error");
      return;
    }
    toast(
      action === "exclude"
        ? `Marked ${result.succeeded} account${result.succeeded === 1 ? "" : "s"} as not a fit.${result.failed > 0 ? ` ${result.failed} failed.` : ""}`
        : `Restored ${result.succeeded} account${result.succeeded === 1 ? "" : "s"}.${result.failed > 0 ? ` ${result.failed} failed.` : ""}`,
      result.failed > 0 ? "warning" : "success",
    );
    setSelectedRows(new Set());
    // setExclusionByIds already refetched on success.
  }

  async function rowSetExclusion(id: string, action: "exclude" | "include") {
    try {
      const res = await fetch("/api/accounts/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action }),
      });
      if (!res.ok) {
        toast(action === "exclude" ? "Couldn't exclude." : "Couldn't restore.", "error");
        return;
      }
      toast(action === "exclude" ? "Marked as not a fit." : "Restored to active list.", "success");
      await refetchLoadedAccounts();
    } catch (e) {
      console.warn("accounts: row exclusion failed", e);
      toast("Action failed.", "error");
    }
  }

  // Header-checkbox "select all": select EVERY account matching the active
  // view + filters — the server resolves the full id set with the exact WHERE
  // the list and its count use — not just the loaded page. The loaded rows
  // are selected instantly for feedback; the full set replaces them when the
  // ids arrive (the union also keeps mid-stream TAM rows the server may not
  // have persisted yet). Residual non-score NL smart filters only exist
  // client-side (the server can't compute "all matching" for them), so with
  // one active the selection honestly stays the visible rows.
  // Returns the resolved selection set so a programmatic caller (the
  // accounts.selectAll page action) gets an accurate count without waiting for
  // a re-render to land in a ref. The button caller ignores the return value —
  // behaviour-preserving.
  async function selectAllMatching(): Promise<Set<string>> {
    const visibleIds = filteredAccounts.map((a) => a.id);
    const visibleSet = new Set(visibleIds);
    setSelectedRows(visibleSet);
    if (smartFilters.some((c) => c.field !== "score")) return visibleSet;
    if (accounts.length >= totalAccounts) return visibleSet; // every matching row is already loaded
    const result = await selectAllMatchingIds({
      endpoint: "/api/accounts",
      params: listFilterParams(),
      visibleIds,
    });
    setSelectedRows(result.ids);
    if (result.failed) {
      toast(`Couldn't load the full list — selected the ${visibleIds.length} loaded accounts.`, "warning");
    } else if (result.truncated && result.total != null) {
      toast(`Selected the first ${result.ids.size.toLocaleString()} of ${result.total.toLocaleString()} matching accounts.`, "warning");
    }
    return result.ids;
  }

  // CLE-07 §4: the POST /api/accounts/restore body of restoreAccounts,
  // parameterized by ids. One copy, shared by the bulk-bar Restore button and
  // accounts.bulkRestore (Archive view). Returns the count; the button keeps
  // its own toast / setSelectedRows / refetch.
  const restoreAccountsResult = useCallback(
    async (ids: string[]): Promise<{ ok: boolean; restored: number; error?: string }> => {
      if (ids.length === 0) return { ok: false, restored: 0, error: "No accounts to restore." };
      try {
        const res = await fetch("/api/accounts/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) return { ok: false, restored: 0, error: "Couldn't restore." };
        const data = await res.json().catch(() => ({ restored: ids.length }));
        return { ok: true, restored: data.restored ?? ids.length };
      } catch (e) {
        console.warn("accounts: restore failed", e);
        return { ok: false, restored: 0, error: "Restore failed." };
      }
    },
    [],
  );

  // Restore soft-deleted accounts from the Archive view — clears deleted_at and
  // lifts the suppression so they're eligible for sourcing again.
  async function restoreAccounts(ids: string[]) {
    if (ids.length === 0) return;
    const r = await restoreAccountsResult(ids);
    if (!r.ok) {
      toast(r.error ?? "Restore failed.", "error");
      return;
    }
    toast(`Restored ${r.restored} account${r.restored === 1 ? "" : "s"}.`, "success");
    setSelectedRows(new Set());
    await refetchLoadedAccounts();
  }

  // Open the cascade delete modal — for one row or the whole checkbox
  // selection — and load live related-data counts so the checkboxes can show
  // "Contacts 4 / Deals 1 / …". Counts start null (modal shows "Loading…")
  // and resolve from one set-based aggregate request, whatever the selection
  // size.
  async function openCascadeDelete(ids: string[], label: string) {
    if (ids.length === 0) return;
    setCascadeTarget({ ids, label });
    setCascadeCounts(null);
    const labels: Array<[string, string]> = [
      ["contacts", "Contacts"],
      ["deals", "Deals"],
      ["activities", "Activities"],
      ["notes", "Notes"],
      ["tasks", "Tasks"],
    ];
    try {
      // The endpoint counts at most 500 ids per call — chunk and sum so the
      // modal's numbers stay truthful for select-all-sized selections.
      const counts: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 500) {
        const res = await fetch("/api/accounts/related-counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(i, i + 500) }),
        });
        const data = (await res.json().catch(() => ({}))) as { counts?: Record<string, number> };
        for (const [key, value] of Object.entries(data.counts ?? {})) {
          counts[key] = (counts[key] ?? 0) + (value ?? 0);
        }
      }
      setCascadeCounts(labels.map(([key, text]) => ({ key, label: text, count: counts[key] ?? 0 })));
    } catch {
      setCascadeCounts(labels.map(([key, text]) => ({ key, label: text, count: 0 })));
    }
  }

  // Selection-bar Delete. A selection of one gets the account's real name so
  // it reads exactly like a row delete.
  function openBulkCascadeDelete() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    const label =
      ids.length === 1
        ? (accounts.find((a) => a.id === ids[0])?.name ?? "This account")
        : `${ids.length} selected accounts`;
    void openCascadeDelete(ids, label);
  }

  // CLE-07 §4: the DELETE /api/accounts/batch body of performCascadeDelete,
  // parameterized by the passed ids + cascade keys (NOT the modal's
  // cascadeTarget). One copy, shared by the cascade modal and
  // accounts.bulkDelete / deleteAccount (+ refetch on success).
  const deleteAccountsByIds = useCallback(
    async (
      ids: string[],
      cascade: string[],
    ): Promise<{ ok: boolean; deleted: number; extra: number; error?: string }> => {
      if (ids.length === 0) return { ok: false, deleted: 0, extra: 0, error: "No accounts to delete." };
      try {
        const res = await fetch("/api/accounts/batch", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, cascade }),
        });
        if (!res.ok) return { ok: false, deleted: 0, extra: 0, error: "Delete failed." };
        const data = (await res.json().catch(() => ({}))) as { deleted?: number; cascaded?: Record<string, number> };
        const deleted = data.deleted ?? ids.length;
        const extra = Object.values(data.cascaded ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
        await refetchLoadedAccounts();
        return { ok: true, deleted, extra };
      } catch (e) {
        console.warn("accounts: cascade delete failed", e);
        return { ok: false, deleted: 0, extra: 0, error: "Delete failed." };
      }
    },
    [refetchLoadedAccounts],
  );

  // Soft-delete the targeted accounts plus any related sets the user ticked.
  // Routed through the batch endpoint so every delete also writes the
  // suppression ledger (keeps deleted accounts out of future TAM sourcing;
  // restoring lifts it). Everything is recoverable from the Archive view.
  async function performCascadeDelete(selectedKeys: string[]) {
    if (!cascadeTarget) return;
    setCascadeBusy(true);
    const r = await deleteAccountsByIds(cascadeTarget.ids, selectedKeys);
    if (!r.ok) {
      toast(r.error ?? "Delete failed.", "error");
    } else {
      toast(
        `Moved ${r.deleted} account${r.deleted === 1 ? "" : "s"}${r.extra > 0 ? ` + ${r.extra} related record${r.extra === 1 ? "" : "s"}` : ""} to Archive.`,
        "success",
      );
      setSelectedRows(new Set());
    }
    setCascadeBusy(false);
    setCascadeTarget(null);
  }

  // Debounce the search box and push it to the server. The accounts list
  // endpoint resolves the query to matching industries via an LLM (not a
  // hardcoded synonym list), so "medical" returns every health-care / medical
  // account across the whole tenant, paginated — not just the loaded page.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Debounce column-filter changes before they hit the server (same 350ms as
  // search) so toggling checkboxes / typing doesn't fire a request per change.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedColumnFilters(columnFilters), 350);
    return () => clearTimeout(t);
  }, [columnFilters]);

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
  // Prefer the server-computed effective stage (manual override > deal-derived);
  // the properties fallback covers streamed rows that bypass the list API.
  function getLifecycleStage(account: Account): string { return account.lifecycleStage || ((account.properties as Record<string, unknown>)?.lifecycleStage as string) || "new"; }

  interface Signal { type: string; title: string; description: string; relevance: string; reasoning?: string; sources?: Array<{ url: string; title: string }>; }
  function getSignals(account: Account): Signal[] { return ((account.properties as Record<string, unknown>)?.signals as Signal[]) || []; }

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
    // Streamed-but-not-yet-persisted TAM rows bypass the server-side filters,
    // so don't splice them in while a filter/search/tab is active — they'd show
    // regardless of the filter. They appear (filtered) once the build persists
    // and the list refetches.
    const anyFilterActive =
      !!debouncedSearch ||
      smartFilters.length > 0 ||
      filter !== "all" ||
      Object.values(columnFilters).some((s) => isColumnFilterActive(s));
    if (tamStream.rows.size === 0 || anyFilterActive) return accounts;
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
  }, [accounts, tamStream.rows, tamStream.rowOrder, debouncedSearch, smartFilters, filter, columnFilters]);

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
    score: { label: "Score", kind: "enum", get: (a) => displayScore(a.score, isEnriched(a))?.grade ?? null },
  };

  // Distinct values per enum column for the column-filter checkboxes. Prefer
  // the server facets (tenant-wide, so the menus stay complete even though
  // only filtered rows are loaded); fall back to the loaded rows until the
  // first response lands. Score is the fixed grade ladder.
  const columnOptions = useMemo(() => {
    if (serverFacets) {
      return {
        industry: serverFacets.industries,
        geography: serverFacets.geographies,
        size: serverFacets.sizes,
        revenue: serverFacets.revenues,
        stage: serverFacets.stages,
        score: ["A+", "A", "B", "C", "D", "F"],
      } as Record<string, string[]>;
    }
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
  }, [serverFacets, mergedAccounts]);

  // Tab, per-column, search, and score filters all run server-side now, so
  // `mergedAccounts` is already the matched + paginated set (and the header
  // total reflects the filters). We only apply any residual NL smart-filter
  // conditions the server can't express (e.g. explicit exclusions) — the score
  // threshold is idempotent here since it's already applied server-side.
  const filteredAccounts = (smartFilters.length > 0
    ? applyFilters(mergedAccounts, smartFilters)
    : mergedAccounts)
    .sort((a, b) => {
      // Primary: score DESC. Secondary: lit signals DESC — Monaco
      // "rise to top" behaviour for rows whose chips just flipped.
      const ds = (b.score ?? -1) - (a.score ?? -1);
      if (ds !== 0) return ds;
      return litSignalCount(b) - litSignalCount(a);
    });

  // Header checkbox state: checked when every visible row is selected (the
  // selection may hold MORE than the visible rows after a select-all-matching),
  // indeterminate when only part of it is.
  const allVisibleSelected =
    filteredAccounts.length > 0 && filteredAccounts.every((a) => selectedRows.has(a.id));

  // ── CLE-07: register this page's actions for the chat live-executor. The
  //    registered actions are captured ONCE at mount (CLE-03 keys registration
  //    by the id list), so each run() reads live state via refs and calls only
  //    stable setters / useCallback helpers / the §4 extractions above. ──
  const selectedRef = useRef(selectedRows); selectedRef.current = selectedRows;
  const viewRef = useRef({ excluded: viewExcluded, deleted: viewDeleted });
  viewRef.current = { excluded: viewExcluded, deleted: viewDeleted };
  const profilesRef = useRef(sourceProfiles); profilesRef.current = sourceProfiles;
  const filteredAccountsRef = useRef(filteredAccounts); filteredAccountsRef.current = filteredAccounts;
  const smartFiltersRef = useRef(smartFilters); smartFiltersRef.current = smartFilters;
  // Stable refs to the extracted network helpers / selectAllMatching so the
  // run()s never close over a stale identity (the helpers are useCallback with
  // non-empty deps; selectAllMatching is a re-created function declaration).
  const scoreByIdsRef = useRef(scoreByIds); scoreByIdsRef.current = scoreByIds;
  const detectSignalsByIdsRef = useRef(detectSignalsByIds); detectSignalsByIdsRef.current = detectSignalsByIds;
  const extractContactsByIdsRef = useRef(extractContactsByIds); extractContactsByIdsRef.current = extractContactsByIds;
  const setExclusionByIdsRef = useRef(setExclusionByIds); setExclusionByIdsRef.current = setExclusionByIds;
  const restoreAccountsResultRef = useRef(restoreAccountsResult); restoreAccountsResultRef.current = restoreAccountsResult;
  const deleteAccountsByIdsRef = useRef(deleteAccountsByIds); deleteAccountsByIdsRef.current = deleteAccountsByIds;
  const startTamBuildWithRef = useRef(startTamBuildWith); startTamBuildWithRef.current = startTamBuildWith;
  const runSmartSearchRef = useRef(runSmartSearch); runSmartSearchRef.current = runSmartSearch;
  const runEnrichRef = useRef(runEnrich); runEnrichRef.current = runEnrich;
  const selectAllMatchingRef = useRef(selectAllMatching); selectAllMatchingRef.current = selectAllMatching;
  const rowSetExclusionRef = useRef(rowSetExclusion); rowSetExclusionRef.current = rowSetExclusion;

  const accountListActions: PageAction[] = useMemo(
    () => [
      // ── applyFilter (9 column filters + tab + enrichment partition) ──────
      definePageAction({
        id: "accounts.applyFilter",
        title: "Filter the accounts list",
        description:
          "Apply the accounts list filters: source tab (all/sourced(tam)/added(manual)), enrichment partition " +
          "(all/unenriched/enriched), and the column filters — industry, geography, size, revenue, stage, score " +
          "grade (A+/A/B/C/D/F), name (text), domain (text), LinkedIn present/absent. Pass clear:true to reset " +
          "all filters. Replaces the current filter set; runs server-side across ALL accounts, not just the loaded page.",
        params: z.object({
          sourceTab: z.enum(["all", "tam", "manual"]).optional(),
          enrichmentPartition: z.enum(["all", "unenriched", "enriched"]).optional(),
          industry: z.array(z.string()).optional(),
          geography: z.array(z.string()).optional(),
          size: z.array(z.string()).optional(),
          revenue: z.array(z.string()).optional(),
          stage: z.array(z.string()).optional(),
          score: z.array(z.enum(["A+", "A", "B", "C", "D", "F"])).optional(),
          name: z.string().optional(),
          domain: z.string().optional(),
          linkedin: z.enum(["present", "absent"]).optional(),
          clear: z.boolean().optional(),
        }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (p): Promise<PageActionResult> => {
          if (p.clear) {
            setColumnFilters({}); setSmartFilters([]); setSmartMeta(null);
            setFilter("all"); setEnrichmentFilter("all"); setSearchQuery("");
            return okResult("Cleared all filters.");
          }
          if (p.sourceTab) setFilter(p.sourceTab);
          if (p.enrichmentPartition) setEnrichmentFilter(p.enrichmentPartition);
          const next: Record<string, ColumnFilterState> = {};
          if (p.name) next.name = { text: p.name };
          if (p.domain) next.domain = { text: p.domain };
          for (const k of ["industry", "geography", "size", "revenue", "stage", "score"] as const) {
            const vals = p[k]; if (vals?.length) next[k] = { values: vals };
          }
          if (p.linkedin) next.linkedin = { presence: p.linkedin === "present" ? "has" : "empty" };
          if (Object.keys(next).length > 0) setColumnFilters(next);
          return okResult("Filtered accounts by " + describeAccountFilters(p) + ".");
        },
      }),
      // ── smartSearch (NL -> FilterCondition[] + industry-aware text) ──────
      definePageAction({
        id: "accounts.smartSearch",
        title: "Search accounts",
        description:
          "Type into the accounts search box — an industry-aware text match or a natural-language query " +
          "(e.g. 'SaaS in France, high fit'). Runs server-side across all accounts. Pass an empty query to clear it.",
        params: z.object({ query: z.string() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ query }): Promise<PageActionResult> => {
          const q = query.trim();
          if (!q) { setSearchQuery(""); setSmartFilters([]); setSmartMeta(null); return okResult("Cleared the account search."); }
          const r = await runSmartSearchRef.current(q);
          if (r.filters.length > 0) { setSmartFilters(r.filters); setSmartMeta(r.meta); }
          else { setSearchQuery(q); }
          return r.filters.length > 0
            ? okResult("Applied " + r.filters.length + " smart filter" + (r.filters.length === 1 ? "" : "s") + " (" + (r.meta.reasoning || "matched") + ").", { count: r.filters.length })
            : okResult('Searched all fields for "' + q + '"; no structured filter applied.', { count: 0 });
        },
      }),
      // ── setView (active / excluded / archived) ──────────────────────────
      definePageAction({
        id: "accounts.setView",
        title: "Switch the accounts view",
        description:
          "Switch the accounts view: 'active' (working set), 'excluded' (accounts marked not a fit), " +
          "or 'archived' (soft-deleted accounts, restorable). Changes nothing persistent.",
        params: z.object({ view: z.enum(["active", "excluded", "archived"]) }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ view }): Promise<PageActionResult> => {
          setSelectedRows(new Set());
          if (view === "excluded") { setViewDeleted(false); setViewExcluded(true); return okResult("Showing accounts marked not a fit."); }
          if (view === "archived") { setViewExcluded(false); setViewDeleted(true); return okResult("Showing the archive of removed accounts."); }
          setViewExcluded(false); setViewDeleted(false);
          return okResult("Showing the active accounts.");
        },
      }),
      // ── selectAll (honest cap) ──────────────────────────────────────────
      definePageAction({
        id: "accounts.selectAll",
        title: "Select all matching accounts",
        description:
          "Select every account that matches the active view + filters (not just the loaded page), so a bulk " +
          "action can run on the whole set. Use before a bulk enrich/score/detect-signals/extract-contacts/" +
          "exclude/delete. The selection is capped at the server's id limit (up to 50,000) and reports honestly when capped.",
        params: z.object({ matchingCurrentFilter: z.literal(true) }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (): Promise<PageActionResult> => {
          const beforeVisible = filteredAccountsRef.current.length;
          // selectAllMatching returns the resolved set so the count is accurate
          // without waiting for the setSelectedRows render to land in the ref.
          const resolved = await selectAllMatchingRef.current();
          const n = resolved.size;
          const hasResidualNl = smartFiltersRef.current.some((c) => c.field !== "score");
          if (hasResidualNl && n === beforeVisible)
            return okResult("Selected the " + n + " loaded account" + (n === 1 ? "" : "s") + " (a text/NL filter can't be resolved server-side, so only the loaded rows were selected).", { count: n });
          return okResult("Selected " + n.toLocaleString() + " matching account" + (n === 1 ? "" : "s") + ".", { count: n });
        },
      }),
      // ── bulkEnrich (credits) ────────────────────────────────────────────
      definePageAction({
        id: "accounts.bulkEnrich",
        title: "Enrich the selected accounts",
        description:
          "Enrich every currently-selected account (industry, description, size, etc.) via the streaming enrich. " +
          "Uses enrichment credits. Select accounts first (accounts.selectAll). Confirms before spending. " +
          "Optionally pass criteria (the fields to fill) and/or accountIds to override the selection.",
        params: z.object({ criteria: z.array(z.string()).optional(), accountIds: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "credits", confirm: "risky",
        run: async ({ criteria, accountIds }): Promise<PageActionResult> => {
          const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("No accounts selected — select some first (or say 'select all matching').");
          runEnrichRef.current(criteria ?? ["industry", "description"], ids);
          return okResult("Enriching " + ids.length + " account" + (ids.length === 1 ? "" : "s") + "…", { count: ids.length });
        },
      }),
      // ── bulkScore ───────────────────────────────────────────────────────
      definePageAction({
        id: "accounts.bulkScore",
        title: "Score the selected accounts",
        description:
          "Re-score the selected accounts for ICP fit. Select accounts first. Confirms first. " +
          "(For a whole-library re-score of every account against every profile, use the headless scoring tool — that is not this action.)",
        params: z.object({ accountIds: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountIds }): Promise<PageActionResult> => {
          const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("No accounts selected — select some first (or say 'select all matching').");
          const r = await scoreByIdsRef.current(ids);
          return r.failed === 0
            ? okResult("Scored " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + ".", { count: r.succeeded })
            : okResult("Scored " + r.succeeded + " of " + r.total + "; " + r.failed + " failed.", { count: r.succeeded });
        },
      }),
      // ── bulkDetectSignals ───────────────────────────────────────────────
      definePageAction({
        id: "accounts.bulkDetectSignals",
        title: "Detect signals for the selected accounts",
        description:
          "Detect buying/intent signals for the selected accounts (only the enriched ones are eligible). Confirms first.",
        params: z.object({ accountIds: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountIds }): Promise<PageActionResult> => {
          const base = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (base.length === 0) return errResult("No accounts selected — select some first (or say 'select all matching').");
          const r = await detectSignalsByIdsRef.current(base);
          return r.failed === 0
            ? okResult("Detected signals for " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + ".", { count: r.succeeded })
            : okResult("Detected signals for " + r.succeeded + " of " + r.total + "; " + r.failed + " failed.", { count: r.succeeded });
        },
      }),
      // ── bulkExtractContacts (CREDITS, ALWAYS confirm) ───────────────────
      definePageAction({
        id: "accounts.bulkExtractContacts",
        title: "Extract contacts for the selected accounts",
        description:
          "Source real decision-maker contacts (from Apollo) for the selected accounts and add them. Uses credits " +
          "and can create many contacts. Select accounts first. ALWAYS confirms before spending.",
        params: z.object({ accountIds: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "credits", confirm: "always",
        run: async ({ accountIds }): Promise<PageActionResult> => {
          const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("No accounts selected — select some first (or say 'select all matching').");
          const r = await extractContactsByIdsRef.current(ids);
          if (r.error) return errResult(r.error);
          return r.totalCreated > 0
            ? okResult("Added " + r.totalCreated + " contact" + (r.totalCreated === 1 ? "" : "s") + " across " + r.accountsProcessed + " account" + (r.accountsProcessed === 1 ? "" : "s") + ".", { created: r.totalCreated })
            : okResult("No new contacts found for the selected accounts.", { created: 0 });
        },
      }),
      // ── bulkExclude ─────────────────────────────────────────────────────
      definePageAction({
        id: "accounts.bulkExclude",
        title: "Mark the selected accounts as not a fit",
        description: "Exclude the selected accounts ('not a fit'). Reversible (restore later). Confirms first.",
        params: z.object({ accountIds: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountIds }): Promise<PageActionResult> => {
          const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("No accounts selected — select some first (or say 'select all matching').");
          const r = await setExclusionByIdsRef.current(ids, "exclude");
          return r.succeeded === 0
            ? errResult("Couldn't exclude the accounts.")
            : okResult("Marked " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + " as not a fit." + (r.failed > 0 ? " " + r.failed + " failed." : ""), { count: r.succeeded });
        },
      }),
      // ── bulkRestore (view-dependent) ────────────────────────────────────
      definePageAction({
        id: "accounts.bulkRestore",
        title: "Restore the selected accounts",
        description:
          "Restore the selected accounts. In the Excluded view this un-excludes them; in the Archive view it " +
          "un-deletes them. Confirms first.",
        params: z.object({ accountIds: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountIds }): Promise<PageActionResult> => {
          const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("No accounts selected — select some first.");
          const { excluded, deleted } = viewRef.current;
          if (deleted) { const r = await restoreAccountsResultRef.current(ids); return r.ok ? okResult("Restored " + r.restored + " account" + (r.restored === 1 ? "" : "s") + ".") : errResult(r.error ?? "Couldn't restore."); }
          if (excluded) { const r = await setExclusionByIdsRef.current(ids, "include"); return r.succeeded > 0 ? okResult("Restored " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + ".") : errResult("Couldn't restore."); }
          return okResult("Nothing to restore in this view.");
        },
      }),
      // ── bulkDelete (DESTRUCTIVE, ALWAYS confirm) ────────────────────────
      definePageAction({
        id: "accounts.bulkDelete",
        title: "Delete the selected accounts",
        description:
          "Soft-delete the selected accounts (they move to the Archive and can be restored). Optionally cascade to " +
          "their contacts, deals, activities, notes, and/or tasks. ALWAYS confirms first.",
        params: z.object({
          accountIds: z.array(z.string()).optional(),
          cascade: z.array(z.enum(["contacts", "deals", "activities", "notes", "tasks"])).optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "always",
        run: async ({ accountIds, cascade }): Promise<PageActionResult> => {
          const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("No accounts selected — select some first (or say 'select all matching').");
          const r = await deleteAccountsByIdsRef.current(ids, cascade ?? []);
          return r.ok
            ? okResult("Moved " + r.deleted + " account" + (r.deleted === 1 ? "" : "s") + (r.extra > 0 ? " + " + r.extra + " related record" + (r.extra === 1 ? "" : "s") : "") + " to Archive.", { deleted: r.deleted })
            : errResult(r.error ?? "Failed to delete the accounts.");
        },
      }),
      // ── sendToCallMode (navigation) ─────────────────────────────────────
      definePageAction({
        id: "accounts.sendToCallMode",
        title: "Send the selected accounts to Call Mode",
        description: "Open Call Mode (the softphone) seeded with the selected accounts. Navigates; changes nothing persistent.",
        params: z.object({ accountIds: z.array(z.string()).optional() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ accountIds }): Promise<PageActionResult> => {
          const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("No accounts selected.");
          window.location.href = "/call-mode?accounts=" + encodeURIComponent(ids.join(","));
          return okResult("Opening Call Mode with " + ids.length + " account" + (ids.length === 1 ? "" : "s") + ".", { count: ids.length });
        },
      }),
      // ── enrichAccount (single row, credits) ─────────────────────────────
      definePageAction({
        id: "accounts.enrichAccount",
        title: "Enrich one account",
        description: "Enrich a single account by id (industry, description, etc.). Uses credits. Confirms first.",
        params: z.object({ accountId: z.string().min(1), criteria: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "credits", confirm: "risky",
        run: async ({ accountId, criteria }): Promise<PageActionResult> => {
          runEnrichRef.current(criteria ?? ["industry", "description"], [accountId]);
          return okResult("Enriching the account…", { highlight: { entityId: accountId, scope: "accounts" } });
        },
      }),
      // ── scoreAccount (single row) ───────────────────────────────────────
      definePageAction({
        id: "accounts.scoreAccount",
        title: "Score one account",
        description: "Re-score a single account by id for ICP fit. Confirms first.",
        params: z.object({ accountId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId }): Promise<PageActionResult> => {
          const r = await scoreByIdsRef.current([accountId]);
          return r.failed === 0
            ? okResult("Scored the account.", { highlight: { entityId: accountId, scope: "accounts", field: "score" } })
            : errResult("Couldn't score the account.");
        },
      }),
      // ── excludeAccount (single row) ─────────────────────────────────────
      definePageAction({
        id: "accounts.excludeAccount",
        title: "Mark one account as not a fit (or restore it)",
        description: "Exclude a single account ('not a fit'), or restore:true to un-exclude it. Confirms first.",
        params: z.object({ accountId: z.string().min(1), restore: z.boolean().optional() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ accountId, restore }): Promise<PageActionResult> => {
          await rowSetExclusionRef.current(accountId, restore ? "include" : "exclude");
          return okResult(
            restore ? "Restored the account to the active list." : "Marked the account as not a fit.",
            { highlight: { entityId: accountId, scope: "accounts" } },
          );
        },
      }),
      // ── deleteAccount (single row, DESTRUCTIVE, ALWAYS confirm) ──────────
      definePageAction({
        id: "accounts.deleteAccount",
        title: "Delete one account",
        description:
          "Soft-delete a single account by id (moves to the Archive, restorable). Optionally cascade to its " +
          "contacts/deals/activities/notes/tasks. ALWAYS confirms first.",
        params: z.object({
          accountId: z.string().min(1),
          cascade: z.array(z.enum(["contacts", "deals", "activities", "notes", "tasks"])).optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "always",
        run: async ({ accountId, cascade }): Promise<PageActionResult> => {
          const r = await deleteAccountsByIdsRef.current([accountId], cascade ?? []);
          return r.ok ? okResult("Moved the account to Archive.") : errResult(r.error ?? "Failed to delete the account.");
        },
      }),
      // ── startTamBuild (CREDITS, ALWAYS confirm) ─────────────────────────
      definePageAction({
        id: "accounts.startTamBuild",
        title: "Build a TAM (source new accounts)",
        description:
          "Source new accounts from your ICP and stream them into the list live. Pass icpId for one profile, " +
          "allProfiles:true for every usable profile, or neither for the tenant-wide planner. Uses sourcing " +
          "credits and creates many rows. ALWAYS confirms before sourcing.",
        params: z.object({ icpId: z.string().optional(), allProfiles: z.boolean().optional(), targetCount: z.number().optional() }),
        mutating: true, reversible: true, cost: "credits", confirm: "always",
        run: async ({ icpId, allProfiles, targetCount }): Promise<PageActionResult> => {
          if (icpId && !profilesRef.current.some((p) => p.id === icpId)) return errResult("No such ICP profile.");
          await startTamBuildWithRef.current({ icpId, allProfiles, targetCount });
          return okResult("Sourcing new accounts from your ICP — rows stream in live.");
        },
      }),
      // ── openPersonaSearch (opens the NL->ICP modal) ─────────────────────
      definePageAction({
        id: "accounts.openPersonaSearch",
        title: "Describe your ideal accounts (open the persona modal)",
        description:
          "Open the 'describe who you want to reach' modal so the user can phrase an ICP in natural language. " +
          "Opens the modal only; the user reviews and saves it there.",
        params: z.object({}),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (): Promise<PageActionResult> => {
          setShowPersona(true);
          return okResult("Opened the persona search — describe your ideal accounts and save it there.");
        },
      }),
    ],
    // Stable id set; run()s read live values via refs and call stable setters /
    // useCallback helpers (read through refs) — so registration happens once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(accountListActions);

  // CLE-15 — let the chat pulse a specific account row (e.g. the one it just
  // enriched / scored / excluded, or one it navigates to). Each <tr> carries
  // data-cle-entity; the locator resolves an id to the live row. Null-safe when
  // the row is filtered out or not mounted.
  const surfaceContainerRef = useRef<HTMLDivElement>(null);
  const accountsLocate = useCallback<EntityLocator>(
    (a) => surfaceContainerRef.current?.querySelector<HTMLElement>(`[data-cle-entity="${cssEscape(a.entityId)}"]`) ?? null,
    [],
  );
  useRegisterEntityLocator("accounts", accountsLocate);

  // Per-tab counts shown in parentheses (All / Sourced / Added). The server
  // counts reflect the active column/search/score filters but are independent
  // of the selected tab, so the badges evolve with the filters and add up
  // (all === tam + manual). Fall back to the loaded rows until page 1 lands.
  const tabCounts = deriveAccountTabCounts(
    serverCounts,
    accounts.map((a) => ({ isTam: isTAM(a) })),
  );

  // G27: Collect unique signal types across all accounts for individual columns
  const signalTypeColumns = Array.from(
    new Set(accounts.flatMap((a) => getSignals(a).map((s) => s.type)))
  ).slice(0, 5); // Cap at 5 signal columns to avoid table overflow

  // Picker model — built-ins + the always-on dynamic columns (custom signals,
  // detected signal types, custom fields), with every column currently on the
  // page shown as checked. Defined here so the dynamic lists are in scope.
  const { categories: pickerCategories, visible: pickerVisible } = useMemo(
    () =>
      buildPickerModel({
        visible: visibleCategories,
        hidden: hiddenCategories,
        dynamic: {
          customSignals: customSignals.map((c) => ({ id: c.id, name: c.name })),
          signalTypes: signalTypeColumns,
          customFields: customFields.map((f) => ({ id: f.id, name: f.name })),
        },
      }),
    [visibleCategories, hiddenCategories, customSignals, signalTypeColumns, customFields],
  );

  function accountHasSignalType(account: Account, signalType: string): Signal | null {
    return getSignals(account).find((s) => s.type === signalType) || null;
  }

  // === RENDER ===
  return (
    <div ref={surfaceContainerRef} className="flex h-full flex-col animate-content-in" style={{ background: "var(--color-bg-page)" }}>
      {/* A3 — bulk actions bar appears when one or more rows are checked. */}
      <BulkActionsBar
        count={selectedRows.size}
        onClear={() => setSelectedRows(new Set())}
        primary={
          <EnrichMenu
            targetCount={selectedRows.size}
            running={enrichStream.isRunning}
            processed={enrichStream.processed}
            total={enrichStream.total}
            onEnrich={(criteria) => runEnrich(criteria, Array.from(selectedRows))}
          />
        }
        actions={[
          { label: "Score", icon: <Target size={13} />, onClick: bulkScoreSelected },
          { label: detectingSignals ? "Detecting…" : "Detect signals", icon: <Radio size={13} />, onClick: detectSignals, disabled: detectingSignals },
          {
            label: extractingContacts ? "Extracting…" : "Extract contacts",
            icon: <UserPlus size={13} />,
            // Open the ICP preview first — don't source blind.
            onClick: () => {
              const ids = Array.from(selectedRows);
              if (ids.length > 0) setPreviewIds(ids);
            },
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
          ...(viewDeleted
            ? [
                {
                  label: "Restore",
                  icon: <RotateCcw size={13} />,
                  onClick: () => restoreAccounts(Array.from(selectedRows)),
                },
              ]
            : [
                {
                  label: viewExcluded ? "Restore" : "Not a fit",
                  icon: viewExcluded ? <RotateCcw size={13} /> : <Ban size={13} />,
                  onClick: () => bulkSetExclusion(viewExcluded ? "include" : "exclude"),
                },
                {
                  label: "Delete",
                  icon: <Trash2 size={13} />,
                  variant: "danger" as const,
                  onClick: () => openBulkCascadeDelete(),
                },
              ]),
        ]}
      />
      {/* Page header */}
      <PageHeader
        icon={<Building2 size={16} />}
        title="Accounts"
        subtitle={`${totalAccounts}`}
      >
        {/* Per-account actions (Enrich, Score, Detect signals) live in the
            selection bar — they only make sense once accounts are checked.
            Secondary workspace controls (views, pickers, setup, sourcing
            config) group behind ONE "More" menu: five wide buttons burned
            the header's width (founder request 2026-06-11). The sourcing
            CTA and Create stay visible — they're the primaries, and "Find
            more accounts" carries live build state a menu would hide. */}
        <MoreMenu
          label="More"
          items={[
            ...(TAM_PROPOSALS_ENTRY_ENABLED && proposalCount > 0
              ? [{
                  label: `Proposals (${proposalCount})`,
                  icon: <Sparkles size={13} />,
                  onClick: () => { window.location.href = "/tam/review"; },
                }]
              : []),
            {
              label: "Excluded",
              icon: <Ban size={13} />,
              checked: viewExcluded,
              onClick: () => { setSelectedRows(new Set()); setViewDeleted(false); setViewExcluded((v) => !v); },
            },
            {
              label: "Archive",
              icon: <Archive size={13} />,
              checked: viewDeleted,
              onClick: () => { setSelectedRows(new Set()); setViewExcluded(false); setViewDeleted((v) => !v); },
            },
            {
              label: "Categories",
              icon: <SlidersHorizontal size={13} />,
              divider: true,
              onClick: () => setShowCategoriesPanel(true),
            },
            {
              label: "Describe ICP",
              icon: <Target size={13} />,
              onClick: () => setShowPersona(true),
            },
            ...(sourceProfiles.length > 0
              ? [{
                  label: "Source from",
                  hint: sourceIcpId === "all"
                    ? "All profiles"
                    : (sourceProfiles.find((p) => p.id === sourceIcpId)?.name ?? sourceProfiles[0]?.name ?? ""),
                  icon: <Layers size={13} />,
                  submenu: [
                    ...(sourceProfiles.length > 1
                      ? [{
                          label: "All profiles",
                          checked: sourceIcpId === "all",
                          onClick: () => setSourceIcpId("all"),
                        }]
                      : []),
                    ...sourceProfiles.map((p, i) => ({
                      label: `${p.name}${i === 0 ? " (primary)" : ""}`,
                      checked: sourceIcpId === p.id,
                      onClick: () => setSourceIcpId(p.id),
                    })),
                  ],
                }]
              : []),
            {
              label: rescoringAll ? "Scoring accounts…" : "Score all accounts",
              hint: "Recompute ICP fit for every account",
              icon: <Gauge size={13} />,
              divider: true,
              disabled: rescoringAll,
              onClick: () => { void rescoreAllAccounts(); },
            },
          ]}
        />
        {/* Categories panel — controlled, anchored beside the More trigger;
            opened by the menu item above, dismisses itself. */}
        <ColumnPicker
          categories={pickerCategories}
          visible={pickerVisible}
          onToggle={toggleCategory}
          onReset={resetCategories}
          open={showCategoriesPanel}
          onOpenChange={setShowCategoriesPanel}
          hideTrigger
        />
        {/* Leaving a special view stays ONE visible click — never buried
            in the menu. Renders only inside the Excluded/Archive views. */}
        {(viewExcluded || viewDeleted) && (
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw size={13} />}
            onClick={() => { setSelectedRows(new Set()); setViewExcluded(false); setViewDeleted(false); }}
            title="Back to the active working set"
          >
            Back to active
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

      {showPersona && <PersonaSearch onClose={() => setShowPersona(false)} />}

      {/* TAM stream progress banner — sticky above the filter bar
          during a build, collapses to a completion / error state
          after `done`. */}
      {streamBanner && (
        <div>
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
              title={
                f === "all"
                  ? "Every account in this workspace"
                  : f === "tam"
                    ? "Sourced by Elevay: found by the engine from your ICP"
                    : "Added by you: created manually or imported"
              }
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: filter === f ? "var(--color-accent-soft)" : "transparent",
                color: filter === f ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {f === "all" ? `All (${tabCounts.all})` : f === "tam" ? `Sourced (${tabCounts.tam})` : `Added (${tabCounts.manual})`}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
          style={{
            background: panelActive > 0 ? "var(--color-accent-soft)" : "transparent",
            color: panelActive > 0 ? "var(--color-accent)" : "var(--color-text-tertiary)",
          }}
          title={t("filters.advancedAccounts")}
        >
          <SlidersHorizontal size={12} />
          Filtres
          {panelActive > 0 && (
            <span className="rounded-full px-1.5 text-[10px] font-medium tabular-nums" style={{ background: "var(--color-accent)", color: "#fff" }}>
              {panelActive}
            </span>
          )}
        </button>

        {/* Enrichment partition — independent of the source tab. Lets the user
            isolate the not-yet-enriched accounts so a bulk enrich doesn't pay to
            re-enrich the ones already enriched. Counts come from the tenant-wide
            working set (serverCounts), independent of this selection so each
            segment shows a stable total. */}
        <div className="flex items-center gap-0.5 border-l pl-2" style={{ borderColor: "var(--color-border-default)" }}>
          <Sparkles size={12} style={{ color: "var(--color-text-tertiary)", opacity: 0.7 }} aria-hidden="true" />
          {([
            { key: "all", label: "All", title: "Every account regardless of enrichment" },
            {
              key: "unenriched",
              label: serverCounts ? `To enrich (${serverCounts.unenriched})` : "To enrich",
              title: "Accounts still missing their base firmographics — what a bulk enrich would actually fill",
            },
            {
              key: "enriched",
              label: serverCounts ? `Enriched (${Math.max(0, serverCounts.total - serverCounts.unenriched)})` : "Enriched",
              title: "Accounts already enriched — skip these to avoid enriching twice",
            },
          ] as const).map((seg) => (
            <button
              key={seg.key}
              onClick={() => setEnrichmentFilter(seg.key)}
              title={seg.title}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: enrichmentFilter === seg.key ? "var(--color-accent-soft)" : "transparent",
                color: enrichmentFilter === seg.key ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {seg.label}
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

        {/* One intelligent search box. Type -> server-side, industry-aware
            search (debounced 350ms): the query is resolved to the matching
            industries via an LLM, so "medical" returns every health-care
            account across the whole tenant. Press Enter -> natural-language
            smart filters. Replaces the old pair (literal box + semantic bar). */}
        <div className="ml-auto w-80">
          <SmartSearchBar
            resourceType="account"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search accounts — or describe and press Enter (e.g. SaaS in France, high fit)"
            className="w-full"
            onFilters={(filters, meta) => {
              setSmartFilters(filters);
              setSmartMeta(meta);
              if (filters.length > 0) {
                toast(`Applied ${filters.length} smart filter${filters.length === 1 ? "" : "s"}`, "success");
              } else if (meta.unmatched.length > 0) {
                toast(`Searched all fields. Couldn't add a filter for: ${meta.unmatched.join(", ")}`, "info");
              }
            }}
            onError={(msg) => toast(msg, "error")}
          />
        </div>
      </FilterBar>

      <FiltersPanel
        open={showFilters}
        onOpenChange={setShowFilters}
        sections={filterSections}
        state={columnFilters}
        onChange={(key, next) =>
          setColumnFilters((prev) => {
            const n = { ...prev };
            if (next) n[key] = next;
            else delete n[key];
            return n;
          })
        }
      />

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

      {/* Search-active banner. The accounts endpoint resolves the query to
           matching industries via an LLM and filters server-side, so
           `totalAccounts` is the real matched count across the whole tenant
           (not just the loaded page). Shown whenever a search is active so
           the user knows the rows are a filtered slice, and can clear it. */}
      {debouncedSearch && (
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
              {totalAccounts}
            </strong>{" "}
            account{totalAccounts === 1 ? "" : "s"} match{" "}
            <span className="italic">&ldquo;{debouncedSearch}&rdquo;</span>
          </span>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
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

      {/* Table — min-h-0 lets this flex child shrink below its content so the
          overflow-auto actually scrolls the long account list (the classic
          flexbox trap: without it, flex items keep min-height:auto and the
          list overflows instead of scrolling). */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <TableSkeleton
            rows={8}
            // +4 for built-in TAM signals + N for custom signals.
            cols={9 + DEFAULT_SIGNALS.filter((s) => visibleCategories.has(`signal:${s.key}`)).length + EXTRA_COLUMNS.filter((c) => visibleCategories.has(c.key)).length + customSignals.filter((c) => !hiddenCategories.has(customSignalKey(c.id))).length + signalTypeColumns.filter((t) => !hiddenCategories.has(signalTypeKey(t))).length + customFields.filter((f) => !hiddenCategories.has(customFieldKey(f.id))).length}
          />
        ) : loadError ? (
          <EmptyState
            variant="error"
            title="Couldn't load your accounts"
            description="Something went wrong fetching your accounts. This is not an empty library."
            actionLabel="Retry"
            onAction={() => fetchAccounts()}
          />
        ) : mergedAccounts.length === 0 ? (
          debouncedSearch ? (
            /* The broad search ran server-side across every category and
               matched nothing — distinct from an empty library, so the user
               knows the search (not their data) is the reason. */
            <EmptyState
              icon={<Search size={24} />}
              title={`No accounts match "${debouncedSearch}"`}
              description="Nothing matched across name, website, industry or description. Try different words, or clear the search."
              actionLabel="Clear search"
              onAction={() => setSearchQuery("")}
              actionVariant="outline"
            />
          ) : (
            <EmptyState
              icon={<Building2 size={24} />}
              title="No accounts"
              description="Create accounts or import contacts to get started."
              actionLabel="Create account"
              onAction={() => setShowCreate(true)}
              actionVariant="gradient"
            />
          )
        ) : filteredAccounts.length === 0 ? (
          /* The search DID return rows (mergedAccounts > 0) but the active
             smart / column filters narrowed them to none. Name that cause
             precisely — never "no match for <search>", which is what made the
             count banner ("41 match") and this state contradict each other.
             Clearing here drops the filters, not the underlying search. */
          <EmptyState
            icon={<Filter size={24} />}
            title="No accounts match the active filters"
            description="Your search returned results, but the active filters narrowed them to none. Clear the filters to see them."
            actionLabel="Clear filters"
            onAction={() => {
              setSmartFilters([]);
              setSmartMeta(null);
              setColumnFilters({});
            }}
            actionVariant="outline"
          />
        ) : (
          <>
          <table className="ls-table" data-selecting={selectedRows.size > 0 ? "true" : undefined}>
            <thead>
              <tr>
                {/* Select-all checkbox */}
                <th className="check">
                  <input
                    type="checkbox"
                    aria-label="Select all accounts"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedRows.size > 0 && !allVisibleSelected;
                    }}
                    onChange={(e) => {
                      if (e.target.checked) void selectAllMatching();
                      else setSelectedRows(new Set());
                    }}
                    className="h-3 w-3 rounded"
                  />
                </th>
                {([
                  { label: "Account", icon: Building2, filterKey: "name" },
                  { label: "Website", icon: Globe, filterKey: "domain" },
                  // Icon-only header: keeps the LinkedIn column as narrow as
                  // its content (the icon link); the filter stays available.
                  { label: "", icon: null, filterKey: "linkedin" },
                  { label: "Industry", icon: Factory, filterKey: "industry" },
                  { label: "Geography", icon: MapPin, filterKey: "geography" },
                  { label: "Size", icon: Ruler, filterKey: "size" },
                  { label: "Revenue", icon: DollarSign, filterKey: "revenue" },
                  { label: "Stage", icon: GitBranch, filterKey: "stage" },
                  { label: "Score", icon: Gauge, filterKey: "score" },
                  { label: "Last Interaction", icon: Clock },
                  { label: "Connected to", icon: Users },
                  // Optional category columns — built-in signals + firmographic
                  // extras the user adds via the Categories picker. Header and
                  // body iterate the SAME visibility-filtered lists so they stay
                  // aligned (this also fixes the old 4-header / 5-body signal skew).
                  ...DEFAULT_SIGNALS
                    .filter((s) => visibleCategories.has(`signal:${s.key}`))
                    .map((s) => ({ label: signalLabelForHeader(s.key), icon: Sparkles as LucideIcon })),
                  ...EXTRA_COLUMNS
                    .filter((c) => visibleCategories.has(c.key))
                    .map((c) => ({ label: c.label, icon: null as LucideIcon | null })),
                  // User-defined custom signals. Each appears as its
                  // own column; names truncated to 16 chars in the
                  // header to keep row widths predictable. These + the
                  // signal-type and custom-field columns below are shown
                  // unless the user hid them via the Categories picker.
                  ...customSignals.filter((c) => !hiddenCategories.has(customSignalKey(c.id))).map((c) => ({
                    label: c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name,
                    icon: Radio as LucideIcon,
                  })),
                  ...signalTypeColumns.filter((t) => !hiddenCategories.has(signalTypeKey(t))).map((t) => ({ label: t.replace(/_/g, " "), icon: Radio as LucideIcon })),
                  ...customFields.filter((f) => !hiddenCategories.has(customFieldKey(f.id))).map((f) => ({ label: f.name, icon: null as LucideIcon | null })),
                  { label: "", icon: null },
                ] as Array<{ label: string; icon: LucideIcon | null; filterKey?: string }>).map((col, i) => {
                  const fcfg = col.filterKey ? FILTER_COLUMNS[col.filterKey] : undefined;
                  return (
                  <th key={i}>
                    <span className="flex items-center gap-1.5">
                      {col.icon && <col.icon size={12} style={{ opacity: 0.5 }} />}
                      {col.filterKey === "linkedin" && <span style={{ opacity: 0.5 }} title="LinkedIn"><LinkedInIcon size={12} /></span>}
                      {col.label}
                      {col.filterKey && fcfg && (
                        <ColumnFilter
                          label={fcfg.label}
                          kind={fcfg.kind}
                          options={columnOptions[col.filterKey]}
                          counts={serverFacetCounts?.[col.filterKey]}
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
                  <tr className="group" data-cle-entity={account.id} data-selected={selectedRows.has(account.id) ? "true" : undefined}>
                    {/* Row checkbox */}
                    <td className="check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${account.name || account.domain || "account"}`}
                        checked={selectedRows.has(account.id)}
                        onChange={(e) => {
                          const next = new Set(selectedRows);
                          if (e.target.checked) next.add(account.id); else next.delete(account.id);
                          setSelectedRows(next);
                        }}
                        className="h-3 w-3 rounded"
                      />
                    </td>
                    {/* Account name with logo */}
                    <td>
                      <div className="flex items-center gap-2.5">
                        {/* Expand contacts chevron */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (expandedAccountId === account.id) {
                              setExpandedAccountId(null);
                              setExpandedContacts([]);
                              setSourceResult(null);
                            } else {
                              setExpandedAccountId(account.id);
                              setSourceResult(null);
                              loadExpandedContacts(account.id);
                            }
                          }}
                          className="shrink-0 rounded p-0.5 transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {expandedAccountId === account.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
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
                          className="inline-flex max-w-[140px] items-center gap-1 text-[12px] transition-colors hover:underline"
                          style={{ color: "var(--color-accent)" }}
                          title={account.domain}
                        >
                          <span className="min-w-0 truncate">{account.domain}</span>
                          <ExternalLink size={10} className="shrink-0" style={{ opacity: 0.5 }} />
                        </a>
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* LinkedIn */}
                    <td>
                      {renderEnrichable(account.id, "linkedin", !!getLinkedInUrl(account), (() => {
                        const linkedIn = getLinkedInUrl(account);
                        if (!linkedIn) return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
                        return (
                          <a
                            href={linkedIn.startsWith("http") ? linkedIn : `https://${linkedIn}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center transition-opacity hover:opacity-70"
                            style={{ color: "#0A66C2" }}
                            title="Open LinkedIn profile"
                            aria-label="Open LinkedIn profile"
                          >
                            <LinkedInIcon size={13} />
                          </a>
                        );
                      })())}
                    </td>

                    {/* Industry -- sector icon + sector-hued badge */}
                    <td>
                      {renderEnrichable(account.id, "industry", !!account.industry, account.industry ? (
                        <IndustryBadge value={account.industry} className="max-w-[220px]" />
                      ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>)}
                    </td>

                    {/* Geography -- city / state / country */}
                    <td>
                      {renderEnrichable(account.id, "geography", !!formatGeography(account), (() => {
                        const geo = formatGeography(account);
                        if (!geo) return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
                        // Compact display: city + country only (state adds
                        // noise like "Zürich, Zurich"); full string on hover.
                        const geoParts = geo.split(", ");
                        const geoCompact = geoParts.length > 2 ? `${geoParts[0]}, ${geoParts[geoParts.length - 1]}` : geo;
                        return (
                          <span className="inline-flex max-w-[170px] items-center gap-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }} title={geo}>
                            <MapPin size={11} className="shrink-0" style={{ color: "var(--color-text-muted)" }} />
                            <span className="min-w-0 truncate">{geoCompact}</span>
                          </span>
                        );
                      })())}
                    </td>

                    {/* Size */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {renderEnrichable(account.id, "size", !!account.size, account.size || "—")}
                    </td>

                    {/* Revenue */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {renderEnrichable(account.id, "revenue", !!account.revenue, account.revenue || "—")}
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
                        const scoreInfo = displayScore(account.score, isEnriched(account));
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
                    {DEFAULT_SIGNALS.filter((s) => visibleCategories.has(`signal:${s.key}`)).map(({ key }) => {
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

                    {/* Firmographic extra columns (Categories picker) — founded
                        year / tech / funding / keywords, filled by enrichment. */}
                    {EXTRA_COLUMNS.filter((c) => visibleCategories.has(c.key)).map((c) => (
                      <td key={c.key}>{renderExtraCell(account, c.refKey)}</td>
                    ))}

                    {/* User-defined custom signals — one chip per
                        active signal, reads from
                        `properties.customSignals[signalId]`. */}
                    {customSignals.filter((custom) => !hiddenCategories.has(customSignalKey(custom.id))).map((custom) => {
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
                    {signalTypeColumns.filter((sigType) => !hiddenCategories.has(signalTypeKey(sigType))).map((sigType) => {
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

                    {/* Custom fields from data model */}
                    {customFields.filter((field) => !hiddenCategories.has(customFieldKey(field.id))).map((field) => (
                      <td key={field.id}>
                        {renderCustomFieldCell(account, field)}
                      </td>
                    ))}

                    {/* Actions — revealed on row hover / focus to cut clutter.
                        The primary action (Enrich) now lives in the top bar. */}
                    <td className="actions">
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          aria-label={viewDeleted ? `Restore ${account.name}` : viewExcluded ? `Restore ${account.name}` : `Mark ${account.name} as not a fit`}
                          title={viewDeleted ? "Restore removed account" : viewExcluded ? "Restore to active list" : "Not a fit (exclude — keeps the row, drops it from outbound and re-sourcing)"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (viewDeleted) restoreAccounts([account.id]);
                            else rowSetExclusion(account.id, viewExcluded ? "include" : "exclude");
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {viewDeleted || viewExcluded ? <RotateCcw size={13} /> : <Ban size={13} />}
                        </button>
                        {!viewDeleted && (
                        <button
                          type="button"
                          aria-label={`Delete ${account.name}`}
                          title="Delete account"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openCascadeDelete([account.id], account.name);
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                        )}
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
                            <div className="space-y-2">
                              <p className="text-[12px]" style={{ color: sourceResult?.tone === "error" ? "var(--color-error)" : "var(--color-text-tertiary)" }}>
                                {sourceResult ? sourceResult.text : "No contacts on file for this account yet."}
                              </p>
                              <div className="flex items-center gap-2.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => findContactsForAccount(account)}
                                  disabled={sourcingContacts}
                                  className="!px-2.5 !py-1"
                                >
                                  {sourcingContacts ? (
                                    <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Sourcing contacts…</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5"><UserPlus size={12} /> {sourceResult?.retry ? "Try again" : "Find contacts"}</span>
                                  )}
                                </Button>
                                {sourceResult?.href && (
                                  <a href={sourceResult.href} className="text-[11px] hover:underline" style={{ color: "var(--color-accent)" }}>
                                    {sourceResult.hrefLabel ?? "Open"}
                                  </a>
                                )}
                              </div>
                            </div>
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
          const scoreInfo = displayScore(a.score, isEnriched(a));
          const lc = getLifecycleStage(a);
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
              <PropertyRow label="Industry" value={a.industry ? <IndustryBadge value={a.industry} /> : null} />
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
                      Not enriched yet — pull industry, size and revenue automatically.
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
                      Enrich →
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

      {/* Delete — single row or the checkbox selection — with optional
          cascade to related data. Soft-delete: everything moves to the
          Archive view (toggle in the toolbar) and is restorable anytime. */}
      <CascadeDeleteModal
        open={!!cascadeTarget}
        entityKind={cascadeTarget && cascadeTarget.ids.length > 1 ? `${cascadeTarget.ids.length} accounts` : "account"}
        entityLabel={cascadeTarget?.label ?? "This account"}
        entityCount={cascadeTarget?.ids.length ?? 1}
        options={cascadeCounts}
        busy={cascadeBusy}
        onConfirm={performCascadeDelete}
        onCancel={() => { if (!cascadeBusy) setCascadeTarget(null); }}
      />

      {previewIds && (
        <SourcingPreviewModal
          open
          accountIds={previewIds}
          onClose={() => setPreviewIds(null)}
          onConfirm={(keptIds) => {
            setPreviewIds(null);
            void extractContactsSelected(keptIds);
          }}
        />
      )}
    </div>
  );
}
