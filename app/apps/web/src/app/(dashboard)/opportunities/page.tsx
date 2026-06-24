"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions, useRegisterEntityLocator, cssEscape } from "@/lib/chat/page-actions/registry";
import type { EntityLocator } from "@/lib/chat/page-actions/registry";
import {
  CircleDot, Plus, BarChart3, ChevronDown, ChevronUp,
  Search, X, Building2, User, Calendar, DollarSign, Clock,
  LayoutGrid, List, SlidersHorizontal, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  ClipboardCheck, MonitorPlay, FlaskConical, FileText, Handshake, Trophy, XCircle,
  AlertTriangle, Zap, TrendingUp, Trash2, Archive, RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STAGE_COLORS as STAGE_DOT_COLORS_IMPORTED, RISK_STYLES } from "@/lib/util/ui-utils";
import { stageProbability, ageInStage, AGE_BUCKET_COLORS } from "@/lib/deals/deal-helpers";
import { CloseReasonDialog, type CloseReasonPayload } from "@/components/close-reason-dialog";
import { usePipelineStages } from "@/hooks/use-custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { CompanyLogo } from "@/components/ui/company-logo";
import { OwnerSelect } from "@/components/owner-select";
import { KanbanColumnSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { CascadeDeleteModal, type CascadeOption } from "@/components/ui/cascade-delete-modal";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";

/* ── Types ── */

interface Analytics {
  totalDeals: number;
  activeDeals: number;
  totalPipelineValue: number;
  wonValue: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
  avgDealValue: number;
  avgVelocityDays: number;
  valueByStage: Record<string, { count: number; value: number }>;
  funnel: Array<{ stage: string; count: number }>;
  riskSummary: { high: number; medium: number; low: number; none: number };
}

interface Deal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  companyId: string | null;
  companyDomain: string | null;
  contactId: string | null;
  ownerId: string | null;
  summary: string | null;
  expectedCloseDate: string | null;
  properties: Record<string, unknown> | null;
  companyName: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  createdAt: string | null;
  // Y8 / Y12 — surfaced from /api/opportunities so the table view can
  // render the probability + age-in-stage columns without a second fetch.
  updatedAt: string | null;
}

interface Account { id: string; name: string; domain: string | null }
interface Contact { id: string; firstName: string | null; lastName: string | null; email: string | null; companyId: string | null }

type ViewMode = "board" | "table";
type SortField = "name" | "value" | "expectedCloseDate" | "createdAt" | "companyName" | "stage";
type SortDir = "asc" | "desc";

const DISPLAY_PROPS_ALL = [
  { key: "companyName", label: "Account" },
  { key: "owner", label: "Owner" },
  { key: "value", label: "Deal value" },
  { key: "expectedCloseDate", label: "Close date" },
  { key: "summary", label: "Summary" },
  { key: "risk", label: "Risk level" },
  { key: "createdAt", label: "Created at" },
  // Y8 / Y12 — opt-in by default-off so the table stays slim until the
  // user explicitly turns these on. Both are pure derivations from
  // existing data — no schema or API change behind them.
  { key: "probability", label: "Probability" },
  { key: "ageInStage", label: "Age in stage" },
] as const;
type DisplayPropKey = (typeof DISPLAY_PROPS_ALL)[number]["key"];

interface ActiveFilter {
  field: string;
  label: string;
  op: "eq" | "contains" | "gte" | "lte";
  value: string;
}

const STAGES = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"] as const;
const STAGE_LABELS: Record<string, string> = {
  lead: "Lead", qualification: "Qualification", demo: "Demo", trial: "Trial",
  proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost",
};
const STAGE_DOT_COLORS = STAGE_DOT_COLORS_IMPORTED;

const STAGE_ICONS: Record<string, LucideIcon> = {
  lead: CircleDot,
  qualification: ClipboardCheck,
  demo: MonitorPlay,
  trial: FlaskConical,
  proposal: FileText,
  negotiation: Handshake,
  won: Trophy,
  lost: XCircle,
};

/* ── Helpers ── */

function getOwnerInitials(d: Deal): string {
  const f = d.ownerFirstName || "", l = d.ownerLastName || "";
  if (!f && !l) return "?";
  return (f[0] || "").toUpperCase() + (l[0] || "").toUpperCase();
}
function getOwnerName(d: Deal): string {
  return `${d.ownerFirstName || ""} ${d.ownerLastName || ""}`.trim() || "Unassigned";
}
function formatCloseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s), now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const fmt = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diff < 0) return `${fmt} (overdue)`;
  if (diff <= 7) return `${fmt} (${diff}d)`;
  return fmt;
}

/* ── CLE-06: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/** The board/table filter predicate — shared by `filteredDeals` and the
 *  registered `applyFilter` action's count, so the two can never diverge. */
function matchesDealFilters(d: Deal, filters: ActiveFilter[], stalledOnly: boolean): boolean {
  if (stalledOnly) {
    const age = ageInStage(d.updatedAt, d.stage);
    if (!age || (age.bucket !== "stalled" && age.bucket !== "frozen")) return false;
  }
  for (const f of filters) {
    if (f.field === "stage" && d.stage !== f.value) return false;
    if (f.field === "companyName" && !(d.companyName?.toLowerCase().includes(f.value.toLowerCase()))) return false;
    if (f.field === "owner") {
      const n = `${d.ownerFirstName || ""} ${d.ownerLastName || ""}`.trim().toLowerCase();
      if (!n.includes(f.value.toLowerCase())) return false;
    }
    if (f.field === "value" && f.op === "gte" && (d.value || 0) < Number(f.value)) return false;
    if (f.field === "value" && f.op === "lte" && (d.value || 0) > Number(f.value)) return false;
    if (f.field === "expectedCloseDate" && f.op === "lte" && d.expectedCloseDate && new Date(d.expectedCloseDate) > new Date(f.value)) return false;
    if (f.field === "risk") {
      const r = (d.properties as Record<string, unknown>)?.riskLevel as string || "none";
      if (r !== f.value) return false;
    }
  }
  return true;
}

/** Human-readable summary of an applyFilter request (for the action result). */
function describeFilters(p: {
  stage?: string; owner?: string; minValue?: number; maxValue?: number;
  closeDateBefore?: string; risk?: string; stalledOnly?: boolean; search?: string;
}): string {
  const parts: string[] = [];
  if (p.stage) parts.push(`stage ${p.stage}`);
  if (p.owner) parts.push(`owner ${p.owner}`);
  if (p.minValue != null) parts.push(`value >= ${p.minValue}`);
  if (p.maxValue != null) parts.push(`value <= ${p.maxValue}`);
  if (p.closeDateBefore) parts.push(`closing by ${p.closeDateBefore}`);
  if (p.risk) parts.push(`risk ${p.risk}`);
  if (p.stalledOnly) parts.push("stalled only");
  if (p.search) parts.push(`search "${p.search}"`);
  return parts.length ? parts.join(", ") : "no filters";
}

/* ── Main Component ── */

export default function OpportunitiesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsError, setDealsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const { stages: pipelineStages } = usePipelineStages();

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createStage, setCreateStage] = useState("lead");
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCloseDate, setNewCloseDate] = useState("");
  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);
  const [newAccountId, setNewAccountId] = useState("");
  const [newContactId, setNewContactId] = useState("");
  const [creating, setCreating] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  // Analytics
  const [analyzing, setAnalyzing] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Forecast
  const [showForecast, setShowForecast] = useState(false);
  const [forecast, setForecast] = useState<{
    scenarios: Array<{ period: string; p10: number; p50: number; p90: number; mean: number; dealCount: number }>;
    topDeals: Array<{ id: string; name: string; value: number; winProbability: number; expectedCloseWeek: string }>;
    riskFactors: string[];
    simulationCount: number;
    computedAt: string;
  } | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // View, display, filters
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced search pushed to the server. /api/opportunities resolves it to
  // the matching industries via an LLM (intelligent, not a hardcoded synonym
  // list), so "medical" surfaces deals at health-care companies — not just
  // deals whose name literally contains the word.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  // Archive view: true = show only soft-deleted opportunities (table only) so
  // they can be reviewed and restored (parity with the Accounts archive).
  const [viewDeleted, setViewDeleted] = useState(false);
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [displayProps, setDisplayProps] = useState<Set<DisplayPropKey>>(
    new Set(["companyName", "owner", "value", "expectedCloseDate", "risk"])
  );
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  // Y12 — quick-filter toggle. Keeps the pipeline-hygiene workflow one
  // click away: "show me only the deals I've let sit too long". The
  // threshold matches the kanban age-in-stage badge's "stalled"
  // bucket (14 days+), so visual signal on the card and the preset
  // agree on the same bar.
  const [stalledOnly, setStalledOnly] = useState(false);
  const displayPanelRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Deletes — single row AND the multi-selection (table view) — go through
  // the cascade modal (lets the user also delete the deals' activities/notes/
  // tasks in one step). Everything is soft-delete, recoverable from Archive.
  const [cascadeTarget, setCascadeTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [cascadeCounts, setCascadeCounts] = useState<CascadeOption[] | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Drag & drop
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const isDraggingRef = useRef(false);

  /* ── Data fetching ── */

  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsError(false);
      const r = await fetch("/api/pipeline/analytics");
      if (r.ok) setAnalytics(await r.json());
      else setAnalyticsError(true);
    }
    catch (e) { console.warn("opportunities: analytics fetch failed", e); setAnalyticsError(true); }
  }, []);

  const fetchDeals = useCallback(async () => {
    try {
      setDealsError(false);
      const params = new URLSearchParams();
      if (viewDeleted) params.set("deleted", "true");
      if (debouncedSearch) params.set("search", debouncedSearch);
      const qs = params.toString();
      const r = await fetch(`/api/opportunities${qs ? `?${qs}` : ""}`);
      if (r.ok) { const d = await r.json(); setDeals(d.deals || []); }
      // A 500 here previously rendered as an empty pipeline (board/table empty
      // state). Flag it so the view shows a retry instead.
      else setDealsError(true);
    } catch (e) { console.warn("opportunities: deals fetch failed", e); setDealsError(true); }
    finally { setLoading(false); }
  }, [debouncedSearch, viewDeleted]);

  const fetchAccounts = useCallback(async () => {
    try { const r = await fetch("/api/accounts?pageSize=200"); if (r.ok) { const d = await r.json(); setAccounts(d.accounts || []); } }
    catch (e) { console.warn("opportunities: accounts fetch failed", e); }
  }, []);

  const fetchContacts = useCallback(async () => {
    try { const r = await fetch("/api/contacts?pageSize=200"); if (r.ok) { const d = await r.json(); setContacts(d.contacts || []); } }
    catch (e) { console.warn("opportunities: contacts fetch failed", e); }
  }, []);

  const fetchForecast = useCallback(async () => {
    setForecastLoading(true);
    try {
      const r = await fetch("/api/forecast?granularity=month&horizon=3");
      if (r.ok) setForecast(await r.json());
    } catch (e) {
      console.warn("opportunities: forecast fetch failed", e);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  // ── CLE-06: live mirrors + parameterized network helpers. The registered
  //    page actions are captured once on mount (CLE-03 keys registration by the
  //    id list), so their run() must read current state via refs and call these
  //    stable helpers — never a stale closure. Each helper is the SINGLE copy of
  //    its network call; the button/drag handlers below delegate to it. ──
  const surfaceContainerRef = useRef<HTMLDivElement>(null); // CLE-15 highlight scope (spans board + table)
  const dealsRef = useRef(deals); dealsRef.current = deals;
  const stalledOnlyRef = useRef(stalledOnly); stalledOnlyRef.current = stalledOnly;
  const viewDeletedRef = useRef(viewDeleted); viewDeletedRef.current = viewDeleted;
  const showForecastRef = useRef(showForecast); showForecastRef.current = showForecast;
  const showAnalyticsRef = useRef(showAnalytics); showAnalyticsRef.current = showAnalytics;
  const forecastRef = useRef(forecast); forecastRef.current = forecast;
  const fetchDealsRef = useRef(fetchDeals); fetchDealsRef.current = fetchDeals;
  const stagesRef = useRef<Array<{ id: string }>>([]); // assigned below, after activeStages is computed

  const submitCreate = useCallback(
    async (input: {
      name: string; stage: string; value?: number; companyId?: string;
      contactId?: string; expectedCloseDate?: string; ownerId?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const r = await fetch("/api/opportunities", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name, stage: input.stage,
            value: input.value, companyId: input.companyId || undefined,
            contactId: input.contactId || undefined,
            expectedCloseDate: input.expectedCloseDate || undefined,
            ownerId: input.ownerId || undefined,
          }),
        });
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { error?: string };
          return { ok: false, error: b.error ?? "Failed to create opportunity." };
        }
        fetchDealsRef.current(); fetchAnalytics();
        return { ok: true };
      } catch (e) {
        console.warn("opportunities: create failed", e);
        return { ok: false, error: "Failed to create opportunity." };
      }
    },
    [fetchAnalytics],
  );

  const deleteDeals = useCallback(
    async (
      ids: string[],
      cascade: string[],
    ): Promise<{ ok: boolean; okCount: number; failed: number; extra: number; error?: string }> => {
      if (ids.length === 0) return { ok: false, okCount: 0, failed: 0, extra: 0, error: "No deals to delete." };
      const prev = dealsRef.current;
      const idSet = new Set(ids);
      setDeals((p) => p.filter((d) => !idSet.has(d.id)));
      try {
        const results = await Promise.all(
          ids.map((id) =>
            fetch(`/api/opportunities/${id}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cascade }),
            })
              .then(async (r) => {
                if (!r.ok) return null;
                const data = (await r.json().catch(() => ({}))) as { cascaded?: Record<string, number> };
                return Object.values(data.cascaded ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
              })
              .catch(() => null),
          ),
        );
        const okArr = results.filter((r): r is number => r !== null);
        const failed = results.length - okArr.length;
        const extra = okArr.reduce((a, b) => a + b, 0);
        if (okArr.length === 0) {
          setDeals(prev);
          return { ok: false, okCount: 0, failed, extra: 0, error: "Failed to delete." };
        }
        if (failed > 0) fetchDealsRef.current();
        fetchAnalytics();
        return { ok: true, okCount: okArr.length, failed, extra };
      } catch (e) {
        setDeals(prev);
        console.warn("opportunities: cascade delete failed", e);
        return { ok: false, okCount: 0, failed: ids.length, extra: 0, error: "Failed to delete." };
      }
    },
    [fetchAnalytics],
  );

  const restoreDealsResult = useCallback(
    async (ids: string[]): Promise<{ ok: boolean; restored?: number; error?: string }> => {
      if (ids.length === 0) return { ok: false, error: "No deals to restore." };
      try {
        const res = await fetch("/api/opportunities/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) return { ok: false, error: "Couldn't restore." };
        const data = await res.json().catch(() => ({ restored: ids.length }));
        await fetchDealsRef.current();
        return { ok: true, restored: (data as { restored?: number }).restored ?? ids.length };
      } catch (e) {
        console.warn("opportunities: restore failed", e);
        return { ok: false, error: "Couldn't restore." };
      }
    },
    [],
  );

  const analyzeDealsByIds = useCallback(
    async (ids: string[]): Promise<{ ok: boolean; error?: string }> => {
      if (ids.length === 0) return { ok: false, error: "No deals to analyze." };
      try {
        const r = await fetch("/api/deals/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealIds: ids }),
        });
        if (!r.ok) return { ok: false, error: "Failed to analyze deals." };
        await fetchDealsRef.current(); await fetchAnalytics();
        return { ok: true };
      } catch (e) {
        console.warn("opportunities: analyze failed", e);
        return { ok: false, error: "Failed to analyze deals." };
      }
    },
    [fetchAnalytics],
  );

  // Restore soft-deleted opportunities from the Archive view — clears
  // deleted_at and brings back the activities/notes/tasks cascade-deleted with
  // each deal (matched by the shared delete timestamp).
  async function restoreDeals(ids: string[]) {
    if (ids.length === 0) return;
    const r = await restoreDealsResult(ids);
    if (!r.ok) { toast("Couldn't restore.", "error"); return; }
    toast(`Restored ${r.restored} opportunit${r.restored === 1 ? "y" : "ies"}.`, "success");
    setSelectedRows(new Set());
  }

  useEffect(() => { fetchDeals(); }, [fetchDeals]);
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);
  // Debounce the search box -> server (industry-aware). 350ms after the user
  // stops typing; clearing snaps back to the full pipeline.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);
  useEffect(() => { if (showCreate) { fetchAccounts(); fetchContacts(); } }, [showCreate, fetchAccounts, fetchContacts]);
  // Multi-select only exists in the table view; drop it when switching to
  // the board so the bulk bar can't linger over a view with no checkboxes.
  useEffect(() => { if (viewMode !== "table") setSelectedRows(new Set()); }, [viewMode]);

  // Close ALL dropdowns/panels on outside click
  const accountDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) {
      const t = e.target as Node;
      if (showDisplayPanel && displayPanelRef.current && !displayPanelRef.current.contains(t)) setShowDisplayPanel(false);
      if (showFilterPanel && filterPanelRef.current && !filterPanelRef.current.contains(t)) setShowFilterPanel(false);
      if (showAccountDropdown && accountDropdownRef.current && !accountDropdownRef.current.contains(t)) setShowAccountDropdown(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showDisplayPanel, showFilterPanel, showAccountDropdown]);

  /* ── Actions ── */

  function openCreateForStage(stageId: string) {
    setCreateStage(stageId); setNewName(""); setNewValue(""); setNewCloseDate(""); setNewOwnerId(null);
    setNewAccountId(""); setNewContactId(""); setAccountSearch(""); setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const r = await submitCreate({
      name: newName.trim(), stage: createStage,
      value: newValue ? parseInt(newValue) : undefined,
      companyId: newAccountId || undefined, contactId: newContactId || undefined,
      expectedCloseDate: newCloseDate || undefined, ownerId: newOwnerId || undefined,
    });
    if (r.ok) setShowCreate(false);
    else toast("Failed to create opportunity", "error");
    setCreating(false);
  }

  async function analyzeDeals() {
    if (deals.length === 0) return;
    setAnalyzing(true);
    const r = await analyzeDealsByIds(deals.map((d) => d.id));
    toast(r.ok ? "Deal analysis complete" : "Failed to analyze deals", r.ok ? "success" : "error");
    setAnalyzing(false);
  }

  /* ── Drag & drop ── */

  function handleDragStart(e: React.DragEvent, id: string) {
    isDraggingRef.current = true; setDraggedDealId(id);
    e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move";
  }
  function handleDragEnd() { setTimeout(() => { isDraggingRef.current = false; }, 0); setDraggedDealId(null); setDragOverStage(null); }
  function handleDragOver(e: React.DragEvent, stage: string) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverStage(stage); }
  function handleDragLeave(e: React.DragEvent, el: HTMLDivElement) { if (!el.contains(e.relatedTarget as Node)) setDragOverStage(null); }

  // Y6 — when the drop target is won/lost we pause before firing the
  // PUT and collect a close reason from the user. Everything else
  // (drag optimistic update, rollback on failure) still runs through
  // commitStageChange — the dialog just adds a hop on the happy path.
  const [pendingClose, setPendingClose] = useState<{
    dealId: string;
    outcome: "won" | "lost";
    prev: Deal[];
  } | null>(null);

  async function handleDrop(e: React.DragEvent, newStage: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setDragOverStage(null); setDraggedDealId(null);
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === newStage) return;

    const prev = [...deals];
    setDeals((p) => p.map((d) => (d.id === id ? { ...d, stage: newStage } : d)));

    const lower = newStage.toLowerCase();
    if (lower === "won" || lower === "lost") {
      // Hold the close-reason dialog; commit happens on confirm.
      setPendingClose({ dealId: id, outcome: lower as "won" | "lost", prev });
      return;
    }
    void commitStageChange(id, newStage, prev);
  }

  async function commitStageChange(
    id: string,
    newStage: string,
    prev: Deal[],
    closeReason?: CloseReasonPayload
  ) {
    try {
      const body: Record<string, unknown> = { stage: newStage };
      if (closeReason) body.closeReason = closeReason;
      const r = await fetch(`/api/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) setDeals(prev);
      else fetchAnalytics();
    } catch {
      setDeals(prev);
    }
  }

  async function handleCloseReasonConfirm(payload: CloseReasonPayload) {
    if (!pendingClose) return;
    const { dealId, outcome, prev } = pendingClose;
    setPendingClose(null);
    await commitStageChange(dealId, outcome, prev, payload);
  }

  function handleCloseReasonCancel() {
    if (!pendingClose) return;
    // User backed out — roll back the optimistic stage move.
    setDeals(pendingClose.prev);
    setPendingClose(null);
  }

  function handleCardClick(id: string) { if (!isDraggingRef.current) router.push(`/opportunities/${id}`); }

  // Open the cascade delete modal — for one row or the whole multi-selection
  // — and load live related-data counts. One set-based aggregate request,
  // whatever the selection size.
  async function openCascadeDelete(ids: string[], label: string) {
    if (ids.length === 0) return;
    setCascadeTarget({ ids, label });
    setCascadeCounts(null);
    const labels: Array<[string, string]> = [
      ["activities", "Activities"],
      ["notes", "Notes"],
      ["tasks", "Tasks"],
    ];
    try {
      const res = await fetch("/api/opportunities/related-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { counts?: Record<string, number> };
      const counts = data.counts ?? {};
      setCascadeCounts(labels.map(([key, text]) => ({ key, label: text, count: counts[key] ?? 0 })));
    } catch {
      setCascadeCounts(labels.map(([key, text]) => ({ key, label: text, count: 0 })));
    }
  }

  // Selection-bar Delete. A selection of one gets the deal's real name so it
  // reads exactly like a row delete.
  function openBulkCascadeDelete() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    const label =
      ids.length === 1
        ? (deals.find((d) => d.id === ids[0])?.name ?? "This opportunity")
        : `${ids.length} selected opportunities`;
    void openCascadeDelete(ids, label);
  }

  // Soft-delete the targeted deals plus any related sets the user ticked.
  // Optimistic removal with rollback on total failure; per-deal requests so
  // each keeps its own delete timestamp (symmetric restore).
  async function performCascadeDelete(selectedKeys: string[]) {
    if (!cascadeTarget) return;
    const ids = cascadeTarget.ids;
    setCascadeBusy(true);
    const r = await deleteDeals(ids, selectedKeys);
    if (!r.ok) {
      toast("Failed to delete opportunit" + (ids.length === 1 ? "y" : "ies"), "error");
    } else {
      toast(
        `Moved ${r.okCount} opportunit${r.okCount === 1 ? "y" : "ies"}${r.extra > 0 ? ` + ${r.extra} related record${r.extra === 1 ? "" : "s"}` : ""} to Archive${r.failed > 0 ? ` (${r.failed} failed)` : ""}.`,
        r.failed > 0 ? "warning" : "success",
      );
      setSelectedRows(new Set());
    }
    setCascadeBusy(false);
    setCascadeTarget(null);
  }

  /* ── Computed ── */

  // Y9 — carry `wipLimit` through to the column header so we can badge
  // over-capacity columns. Built-in stages have no WIP limit by default.
  const activeStages = pipelineStages.length > 0
    ? pipelineStages.map((s) => ({ id: s.id, name: s.name, description: s.description, wipLimit: s.wipLimit ?? null }))
    : STAGES.map((s) => ({ id: s, name: STAGE_LABELS[s] || s, description: "", wipLimit: null as number | null }));

  const stageOptions = activeStages.map((s) => ({ value: s.id, label: s.name }));

  // ── CLE-06: register this page's actions for the chat live-executor. run()s
  //    reuse the existing handlers/extractions above; live values via refs. ──
  stagesRef.current = activeStages;
  const opportunityListActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "opportunities.moveStage",
        title: "Move a deal to a stage",
        description:
          "Move one deal on the board to a pipeline stage (e.g. demo, negotiation, won, lost). " +
          "Moving to Won or Lost requires a close reason; pass closeReason {reason, note?} to set it, " +
          "otherwise the user is asked to pick one. Use when the user names a deal and a target stage.",
        params: z.object({
          dealId: z.string().min(1),
          stage: z.string().min(1),
          closeReason: z.object({ reason: z.string().min(1), note: z.string().optional() }).optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ dealId, stage, closeReason }): Promise<PageActionResult> => {
          const list = dealsRef.current;
          const deal = list.find((d) => d.id === dealId);
          if (!deal) return errResult(`Deal ${dealId} is not in the current view.`);
          const valid = stagesRef.current.some((s) => s.id === stage) || (STAGES as readonly string[]).includes(stage);
          if (!valid) return errResult(`Unknown stage "${stage}".`);
          if (deal.stage === stage) return okResult(`${deal.name} is already in ${stage}.`);
          const lower = stage.toLowerCase();
          const prev = [...list];
          setDeals((p) => p.map((d) => (d.id === dealId ? { ...d, stage } : d)));
          if (lower === "won" || lower === "lost") {
            if (!closeReason) {
              setPendingClose({ dealId, outcome: lower as "won" | "lost", prev });
              return errResult(
                "close_reason_required",
                `Moved ${deal.name} toward ${stage} — pick a close reason in the dialog to confirm.`,
              );
            }
            if (closeReason.reason === "other" && !closeReason.note?.trim()) {
              setDeals(prev);
              return errResult('A note is required when the reason is "other".');
            }
            // Commit with the canonical lowercase "won"/"lost" (the pipeline's
            // closed-stage ids); the optimistic setDeals above used the raw stage.
            await commitStageChange(dealId, lower, prev, { reason: closeReason.reason, note: closeReason.note?.trim() ?? null });
            return okResult(`Marked ${deal.name} ${lower === "won" ? "Won" : "Lost"} (${closeReason.reason}).`, {
              highlight: { entityId: dealId, scope: "opportunities", field: "stage" },
            });
          }
          await commitStageChange(dealId, stage, prev);
          const moved = dealsRef.current.find((d) => d.id === dealId);
          return moved?.stage === stage
            ? okResult(`Moved ${deal.name} to ${stage}.`, { highlight: { entityId: dealId, scope: "opportunities", field: "stage" } })
            : errResult(`The move to ${stage} did not persist; it has been rolled back.`);
        },
      }),
      definePageAction({
        id: "opportunities.createDeal",
        title: "Create an opportunity",
        description:
          "Create a new deal on the pipeline. Name is required; optionally set the account, contact, stage " +
          "(defaults to lead), value, expected close date, owner. Use when the user wants to add a deal.",
        params: z.object({
          name: z.string().min(1),
          accountId: z.string().optional(),
          contactId: z.string().optional(),
          stage: z.string().optional(),
          value: z.number().optional(),
          expectedCloseDate: z.string().optional(),
          ownerId: z.string().optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async (p): Promise<PageActionResult> => {
          const name = p.name.trim();
          if (!name) return errResult("A deal name is required.");
          const stage = p.stage && stagesRef.current.some((s) => s.id === p.stage) ? p.stage : "lead";
          const r = await submitCreate({
            name, stage, value: p.value, companyId: p.accountId, contactId: p.contactId,
            expectedCloseDate: p.expectedCloseDate, ownerId: p.ownerId,
          });
          return r.ok ? okResult(`Created opportunity "${name}".`) : errResult(r.error ?? "Failed to create opportunity.");
        },
      }),
      definePageAction({
        id: "opportunities.applyFilter",
        title: "Filter the pipeline",
        description:
          "Apply visible filters to the board/table: stage, owner, min/max value, close-date-before, risk level, " +
          "stalled-only (deals 14+ days in stage), and a text/sector search. Replaces the current filter set.",
        params: z.object({
          stage: z.string().optional(),
          owner: z.string().optional(),
          minValue: z.number().optional(),
          maxValue: z.number().optional(),
          closeDateBefore: z.string().optional(),
          risk: z.enum(["high", "medium", "low", "none"]).optional(),
          stalledOnly: z.boolean().optional(),
          search: z.string().optional(),
        }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (p): Promise<PageActionResult> => {
          const next: ActiveFilter[] = [];
          if (p.stage) next.push({ field: "stage", label: `Stage: ${p.stage}`, op: "eq", value: p.stage });
          if (p.owner) next.push({ field: "owner", label: `Owner: ${p.owner}`, op: "eq", value: p.owner });
          if (p.minValue != null) next.push({ field: "value", label: `Value >= ${p.minValue}`, op: "gte", value: String(p.minValue) });
          if (p.maxValue != null) next.push({ field: "value", label: `Value <= ${p.maxValue}`, op: "lte", value: String(p.maxValue) });
          if (p.closeDateBefore) next.push({ field: "expectedCloseDate", label: `Close <= ${p.closeDateBefore}`, op: "lte", value: p.closeDateBefore });
          if (p.risk) next.push({ field: "risk", label: `Risk: ${p.risk}`, op: "eq", value: p.risk });
          setActiveFilters(next);
          if (p.stalledOnly != null) setStalledOnly(p.stalledOnly);
          if (p.search != null) setSearchQuery(p.search);
          const stalled = p.stalledOnly ?? stalledOnlyRef.current;
          const count = dealsRef.current.filter((d) => matchesDealFilters(d, next, stalled)).length;
          const desc = describeFilters(p);
          return okResult(
            count === 0 ? `No deals match (${desc}).` : `Filtered to ${count} deal${count === 1 ? "" : "s"} (${desc}).`,
            { count },
          );
        },
      }),
      definePageAction({
        id: "opportunities.setView",
        title: "Switch the pipeline view",
        description: "Switch between the board (kanban) and table layouts; optionally show the archive of removed deals.",
        params: z.object({ view: z.enum(["board", "table"]), archived: z.boolean().optional() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ view, archived }): Promise<PageActionResult> => {
          if (archived) {
            setViewDeleted(true); setViewMode("table"); setSelectedRows(new Set());
            setShowAnalytics(false); setShowForecast(false);
            return okResult("Showing the archive (table).");
          }
          if (viewDeletedRef.current) setViewDeleted(false);
          setViewMode(view);
          return okResult(`Switched to ${view} view.`);
        },
      }),
      definePageAction({
        id: "opportunities.delete",
        title: "Delete an opportunity",
        description:
          "Soft-delete a deal (it moves to the archive and can be restored). Optionally cascade to the deal's " +
          "activities, notes, and/or tasks. Always asks for confirmation first.",
        params: z.object({
          dealId: z.string().min(1),
          cascade: z.array(z.enum(["activities", "notes", "tasks"])).optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "always",
        run: async ({ dealId, cascade }): Promise<PageActionResult> => {
          const deal = dealsRef.current.find((d) => d.id === dealId);
          if (!deal) return errResult(`Deal ${dealId} is not in the current view.`);
          const r = await deleteDeals([dealId], cascade ?? []);
          return r.ok ? okResult(`Moved ${deal.name} to Archive.`) : errResult(r.error ?? "Failed to delete the opportunity.");
        },
      }),
      definePageAction({
        id: "opportunities.restore",
        title: "Restore an archived opportunity",
        description: "Bring a soft-deleted deal back from the archive.",
        params: z.object({ dealId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ dealId }): Promise<PageActionResult> => {
          const r = await restoreDealsResult([dealId]);
          return r.ok ? okResult("Restored the opportunity.") : errResult(r.error ?? "Couldn't restore.");
        },
      }),
      definePageAction({
        id: "opportunities.analyzePipeline",
        title: "Analyze the pipeline",
        description:
          "Run AI deal analysis over the loaded deals (or a specific set of deal ids) — refreshes risk, next steps " +
          "and stage signals. Use when the user asks to analyze or score the pipeline.",
        params: z.object({ dealIds: z.array(z.string()).optional() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ dealIds }): Promise<PageActionResult> => {
          const ids = dealIds ?? dealsRef.current.map((d) => d.id);
          if (ids.length === 0) return errResult("No deals to analyze.", "No deals to analyze.");
          const r = await analyzeDealsByIds(ids);
          return r.ok
            ? okResult(`Analyzed ${ids.length} deal${ids.length === 1 ? "" : "s"}.`)
            : errResult(r.error ?? "Failed to analyze deals.");
        },
      }),
      definePageAction({
        id: "opportunities.toggleForecast",
        title: "Show or hide the forecast",
        description: "Open or close the revenue-forecast panel.",
        params: z.object({ open: z.boolean().optional() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ open }): Promise<PageActionResult> => {
          const next = open ?? !showForecastRef.current;
          setShowForecast(next);
          if (next && !forecastRef.current) fetchForecast();
          return okResult(next ? "Opened the forecast." : "Closed the forecast.");
        },
      }),
      definePageAction({
        id: "opportunities.toggleAnalytics",
        title: "Show or hide analytics",
        description: "Open or close the pipeline analytics KPI strip.",
        params: z.object({ open: z.boolean().optional() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ open }): Promise<PageActionResult> => {
          const next = open ?? !showAnalyticsRef.current;
          setShowAnalytics(next);
          return okResult(next ? "Opened analytics." : "Closed analytics.");
        },
      }),
    ],
    // Stable id set; run() reads live values via refs and calls stable
    // setters/useCallback helpers — so registration happens once (CLE-03).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(opportunityListActions);

  // CLE-15 — let the chat pulse a specific deal (the moved deal, or a record the
  // chat navigates to). The locator resolves an id to whichever node renders it
  // in the CURRENT view (board card or table row both carry data-cle-entity).
  // Null-safe: returns null when the deal is filtered out or not mounted.
  const opportunitiesLocate = useCallback<EntityLocator>(
    (a) => surfaceContainerRef.current?.querySelector<HTMLElement>(`[data-cle-entity="${cssEscape(a.entityId)}"]`) ?? null,
    [],
  );
  useRegisterEntityLocator("opportunities", opportunitiesLocate);

  // Filter. Text/sector search is server-side (industry-aware), so the loaded
  // `deals` are already the matched set — the client predicate only applies the
  // stalled preset + active chips. Shared with the applyFilter action's count.
  const filteredDeals = deals.filter((d) => matchesDealFilters(d, activeFilters, stalledOnly));

  // Y12 — precompute the preset's current-tenant hit count so the
  // toggle button shows "Stalled (7)" instead of forcing the user to
  // click to discover the count.
  const stalledCount = deals.reduce((n, d) => {
    const age = ageInStage(d.updatedAt, d.stage);
    return age && (age.bucket === "stalled" || age.bucket === "frozen") ? n + 1 : n;
  }, 0);

  // Sort
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    let c = 0;
    switch (sortField) {
      case "name": c = a.name.localeCompare(b.name); break;
      case "value": c = (a.value || 0) - (b.value || 0); break;
      case "expectedCloseDate":
        c = (a.expectedCloseDate ? new Date(a.expectedCloseDate).getTime() : Infinity)
          - (b.expectedCloseDate ? new Date(b.expectedCloseDate).getTime() : Infinity); break;
      case "createdAt":
        c = (a.createdAt ? new Date(a.createdAt).getTime() : 0)
          - (b.createdAt ? new Date(b.createdAt).getTime() : 0); break;
      case "companyName": c = (a.companyName || "").localeCompare(b.companyName || ""); break;
      case "stage": c = activeStages.findIndex((s) => s.id === a.stage) - activeStages.findIndex((s) => s.id === b.stage); break;
    }
    return sortDir === "asc" ? c : -c;
  });

  const dealsByStage = activeStages.reduce((acc, stage) => {
    acc[stage.id] = sortedDeals.filter((d) => d.stage === stage.id || d.stage.toLowerCase() === stage.name.toLowerCase());
    return acc;
  }, {} as Record<string, Deal[]>);

  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0);
  const uniqueOwners = [...new Set(deals.filter((d) => d.ownerFirstName || d.ownerLastName).map((d) => `${d.ownerFirstName || ""} ${d.ownerLastName || ""}`.trim()))];
  const uniqueAccounts = [...new Set(deals.filter((d) => d.companyName).map((d) => d.companyName!))];

  const filteredAccountList = accountSearch.trim()
    ? accounts.filter((a) => a.name.toLowerCase().includes(accountSearch.toLowerCase()) || (a.domain?.toLowerCase().includes(accountSearch.toLowerCase()) ?? false))
    : accounts;
  const filteredContactList = newAccountId ? contacts.filter((c) => c.companyId === newAccountId) : contacts;

  /* ── Risk helpers ── */

  function getRiskBorder(d: Deal) { const r = (d.properties as Record<string, unknown>)?.riskLevel as string; return RISK_STYLES[r]?.text || "transparent"; }
  function getRiskReasons(d: Deal): string[] {
    // The deal-analyze pipeline writes specific risk reasons to
    // `properties.risks` as `string[]`. The legacy churn-risk-detector
    // also writes `riskReasons` (different name, same idea). We accept
    // both so existing data renders without a backfill migration.
    const props = (d.properties as Record<string, unknown>) || {};
    const a = Array.isArray(props.risks) ? (props.risks as unknown[]) : [];
    const b = Array.isArray(props.riskReasons) ? (props.riskReasons as unknown[]) : [];
    return [...a, ...b].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  function getRiskBadge(d: Deal) {
    const r = (d.properties as Record<string, unknown>)?.riskLevel as string;
    if (!r || r === "none") return null;
    const reasons = getRiskReasons(d);
    // Monaco-parity: every risk flag must have a *why*. The native
    // `title` attribute gives a no-JS, accessible tooltip; the visible
    // ⓘ glyph hints to the founder that hovering reveals reasons. If
    // analyse hasn't run yet we still show the badge but mark it
    // "no reason yet" so the founder knows the data is still warming.
    const tooltip =
      reasons.length > 0
        ? `Why ${r.toUpperCase()} risk:\n• ${reasons.slice(0, 5).join("\n• ")}`
        : `Risk level: ${r.toUpperCase()} (run /analyze for specific reasons)`;
    return (
      <span title={tooltip} className="inline-flex items-center gap-1">
        <Badge variant={r === "high" ? "error" : r === "medium" ? "warning" : "info"} size="sm">
          {r.toUpperCase()}
        </Badge>
        {reasons.length > 0 && (
          <span
            aria-hidden
            className="text-[10px] leading-none"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            ⓘ
          </span>
        )}
      </span>
    );
  }
  function hasMomentum(d: Deal) { return ((d.properties as Record<string, unknown>)?.recentActivityCount as number || 0) >= 3; }

  /* ── Sub-components ── */

  function DisplayPanel() {
    return (
      <div className="absolute right-0 top-full mt-1 z-30 w-72 rounded-lg py-3 px-4" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog)" }}>
        <div className="flex gap-2 mb-3">
          {(["board", "table"] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)} className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors"
              style={{ background: viewMode === m ? "var(--color-bg-hover)" : "transparent", color: viewMode === m ? "var(--color-text-primary)" : "var(--color-text-tertiary)", border: viewMode === m ? "1px solid var(--color-border-default)" : "1px solid transparent" }}>
              {m === "board" ? <LayoutGrid size={13} /> : <List size={13} />} {m === "board" ? "Board" : "Table"}
            </button>
          ))}
        </div>
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowUpDown size={11} style={{ color: "var(--color-text-tertiary)" }} />
            <span className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Sorting</span>
          </div>
          <div className="flex gap-1.5">
            <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}
              className="flex-1 h-7 rounded-md px-2 text-[12px] outline-none" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}>
              <option value="createdAt">Created at</option><option value="name">Name</option><option value="value">Deal value</option>
              <option value="expectedCloseDate">Close date</option><option value="companyName">Account</option><option value="stage">Stage</option>
            </select>
            <button onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
              className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}>
              {sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            </button>
          </div>
        </div>
        <div>
          <span className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Display properties</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DISPLAY_PROPS_ALL.map((p) => {
              const on = displayProps.has(p.key);
              return (
                <button key={p.key} onClick={() => setDisplayProps((prev) => { const n = new Set(prev); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{ background: on ? "var(--color-accent-soft, rgba(44,107,237,0.12))" : "var(--color-bg-hover)", color: on ? "var(--color-accent)" : "var(--color-text-tertiary)", border: on ? "1px solid var(--color-accent)" : "1px solid var(--color-border-default)" }}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function FilterPanel() {
    const [field, setField] = useState("");
    const [val, setVal] = useState("");
    function add(f: string, l: string, op: ActiveFilter["op"], v: string) {
      if (!v.trim()) return;
      setActiveFilters((p) => [...p, { field: f, label: `${l}: ${v}`, op, value: v }]);
      setShowFilterPanel(false);
    }
    const items = [
      { field: "stage", label: "Stage", icon: <CircleDot size={12} /> },
      { field: "companyName", label: "Account", icon: <Building2 size={12} /> },
      { field: "owner", label: "Owner", icon: <User size={12} /> },
      { field: "value", label: "Deal value", icon: <DollarSign size={12} /> },
      { field: "expectedCloseDate", label: "Close date", icon: <Calendar size={12} /> },
      { field: "risk", label: "Risk level", icon: <BarChart3 size={12} /> },
    ];
    const btn = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] transition-colors";
    const btnStyle = { color: "var(--color-text-primary)" } as React.CSSProperties;
    const hover = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = "var(--color-bg-hover)"; };
    const leave = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = "transparent"; };

    return (
      <div className="absolute left-0 top-full mt-1 z-30 w-60 rounded-lg py-2" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog)" }}>
        {!field ? (
          <div className="px-1">
            {items.map((it) => (
              <button key={it.field} onClick={() => setField(it.field)} className={btn} style={btnStyle} onMouseEnter={hover} onMouseLeave={leave}>
                <span style={{ color: "var(--color-text-tertiary)" }}>{it.icon}</span> {it.label}
              </button>
            ))}
          </div>
        ) : field === "stage" ? (
          <div className="px-1">
            <p className="px-2 pb-1 text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Stage is...</p>
            {activeStages.map((s) => (
              <button key={s.id} onClick={() => add("stage", "Stage", "eq", s.id)} className={btn} style={btnStyle} onMouseEnter={hover} onMouseLeave={leave}>
                {(() => { const Icon = STAGE_ICONS[s.id] || CircleDot; return <Icon size={13} style={{ color: STAGE_DOT_COLORS[s.id as keyof typeof STAGE_DOT_COLORS] || "var(--color-text-tertiary)" }} />; })()} {s.name}
              </button>
            ))}
          </div>
        ) : field === "companyName" ? (
          <div className="px-1">
            <p className="px-2 pb-1 text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Account is...</p>
            {uniqueAccounts.length > 0 ? uniqueAccounts.map((n) => (
              <button key={n} onClick={() => add("companyName", "Account", "contains", n)} className={btn} style={btnStyle} onMouseEnter={hover} onMouseLeave={leave}>
                <Building2 size={11} style={{ color: "var(--color-text-tertiary)" }} /> {n}
              </button>
            )) : <p className="px-3 py-2 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>No accounts</p>}
          </div>
        ) : field === "owner" ? (
          <div className="px-1">
            <p className="px-2 pb-1 text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Owner is...</p>
            {uniqueOwners.map((n) => (
              <button key={n} onClick={() => add("owner", "Owner", "eq", n)} className={btn} style={btnStyle} onMouseEnter={hover} onMouseLeave={leave}>
                <User size={11} style={{ color: "var(--color-text-tertiary)" }} /> {n}
              </button>
            ))}
          </div>
        ) : field === "value" ? (
          <div className="px-3 py-1">
            <p className="pb-1.5 text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Value greater than...</p>
            <div className="flex gap-1.5">
              <Input placeholder="Min $" type="number" value={val} onChange={(e) => setVal(e.target.value)} style={{ height: 28, fontSize: 11 }} />
              <Button size="sm" variant="outline" onClick={() => add("value", "Value >=", "gte", val)}>OK</Button>
            </div>
          </div>
        ) : field === "expectedCloseDate" ? (
          <div className="px-3 py-1">
            <p className="pb-1.5 text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Closing before...</p>
            <div className="flex gap-1.5">
              <Input type="date" value={val} onChange={(e) => setVal(e.target.value)} style={{ height: 28, fontSize: 11 }} />
              <Button size="sm" variant="outline" onClick={() => add("expectedCloseDate", "Close <=", "lte", val)}>OK</Button>
            </div>
          </div>
        ) : field === "risk" ? (
          <div className="px-1">
            <p className="px-2 pb-1 text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Risk is...</p>
            {(["high", "medium", "low", "none"] as const).map((lv) => (
              <button key={lv} onClick={() => add("risk", "Risk", "eq", lv)} className={`${btn} capitalize`} style={btnStyle} onMouseEnter={hover} onMouseLeave={leave}>
                <span className="h-2 w-2 rounded-full" style={{ background: lv === "high" ? "var(--color-error)" : lv === "medium" ? "var(--color-warning)" : lv === "low" ? "var(--color-success)" : "var(--color-text-muted)" }} /> {lv}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  /* ── Render ── */

  return (
    <div ref={surfaceContainerRef} className="flex h-full flex-col animate-content-in" style={{ background: "var(--color-bg-card)" }}>
      {/* Multi-select bar (table view) — appears when rows are checked. */}
      <BulkActionsBar
        count={selectedRows.size}
        onClear={() => setSelectedRows(new Set())}
        actions={viewDeleted
          ? [
              { label: "Restore", icon: <RotateCcw size={13} />, onClick: () => restoreDeals(Array.from(selectedRows)) },
            ]
          : [
              {
                label: "Delete",
                icon: <Trash2 size={13} />,
                variant: "danger",
                onClick: () => openBulkCascadeDelete(),
              },
            ]}
      />
      {/* Header */}
      <PageHeader
        icon={<CircleDot size={16} />}
        title="Opportunities"
        subtitle={`${deals.length} deal${deals.length !== 1 ? "s" : ""}${totalValue > 0 ? ` \u00b7 $${totalValue.toLocaleString()} pipeline` : ""}`}
      >
        {!viewDeleted && (
          <>
            <Button
              variant={showForecast ? "gradient" : "outline"}
              size="sm"
              icon={<TrendingUp size={12} />}
              onClick={() => {
                const next = !showForecast;
                setShowForecast(next);
                if (next && !forecast) fetchForecast();
              }}
            >
              Forecast {showForecast ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </Button>
            {analytics && (
              <Button variant="outline" size="sm" icon={<BarChart3 size={12} />} onClick={() => setShowAnalytics(!showAnalytics)}>
                Analytics {showAnalytics ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={analyzeDeals} disabled={analyzing || deals.length === 0} loading={analyzing}>
              {analyzing ? "Analyzing..." : "Analyze Pipeline"}
            </Button>
            <Button variant="gradient" size="sm" icon={<Plus size={12} />} onClick={() => openCreateForStage("lead")}>
              Create Opportunity
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          icon={viewDeleted ? <RotateCcw size={12} /> : <Archive size={12} />}
          onClick={() => {
            if (viewDeleted) { setViewDeleted(false); setSelectedRows(new Set()); }
            else { setViewDeleted(true); setViewMode("table"); setSelectedRows(new Set()); setShowAnalytics(false); setShowForecast(false); }
          }}
          title={viewDeleted ? "Back to the active pipeline" : "Review removed opportunities and restore them"}
        >
          {viewDeleted ? "Back to active" : "Archive"}
        </Button>
      </PageHeader>

      {/* Toolbar */}
      <FilterBar>
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-tertiary)" }} />
          <Input type="text" placeholder="Search deals, accounts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-8" style={{ height: 30, fontSize: 12 }} />
          {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-tertiary)" }}><X size={12} /></button>}
        </div>
        <div className="relative" ref={filterPanelRef}>
          <Button variant={activeFilters.length > 0 ? "gradient" : "outline"} size="sm" icon={<Filter size={12} />}
            onClick={() => { setShowFilterPanel(!showFilterPanel); setShowDisplayPanel(false); }}>
            Filter{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
          </Button>
          {showFilterPanel && <FilterPanel />}
        </div>
        {/* Y12 — Stalled preset. Renders greyed-out when nothing qualifies
             so the button still stays in its spot but doesn't invite a
             click that returns an empty board. */}
        <button
          type="button"
          onClick={() => setStalledOnly((s) => !s)}
          disabled={stalledCount === 0 && !stalledOnly}
          aria-pressed={stalledOnly}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: stalledOnly ? "var(--color-warning-soft)" : "transparent",
            color: stalledOnly ? "var(--color-warning)" : "var(--color-text-secondary)",
            border: `1px solid ${stalledOnly ? "var(--color-warning)" : "var(--color-border-default)"}`,
          }}
          title={
            stalledOnly
              ? "Showing deals that have sat in their stage for 14+ days"
              : stalledCount === 0
                ? "No stalled deals right now"
                : `Show only the ${stalledCount} deal${stalledCount === 1 ? "" : "s"} that have sat in their stage for 14+ days`
          }
        >
          <AlertTriangle size={12} />
          Stalled{stalledCount > 0 ? ` · ${stalledCount}` : ""}
        </button>
        <div className="relative" ref={displayPanelRef}>
          <Button variant="outline" size="sm" icon={<SlidersHorizontal size={12} />}
            onClick={() => { setShowDisplayPanel(!showDisplayPanel); setShowFilterPanel(false); }}>
            Display
          </Button>
          {showDisplayPanel && <DisplayPanel />}
        </div>
        {!viewDeleted && (
          <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--color-border-default)" }}>
            {(["board", "table"] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{ background: viewMode === m ? "var(--color-accent)" : "transparent", color: viewMode === m ? "white" : "var(--color-text-secondary)", borderLeft: m === "table" ? "1px solid var(--color-border-default)" : "none" }}>
                {m === "board" ? <LayoutGrid size={12} /> : <List size={12} />} {m === "board" ? "Board" : "Table"}
              </button>
            ))}
          </div>
        )}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 ml-1">
            {activeFilters.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(44,107,237,0.1)", color: "var(--color-accent)" }}>
                {f.label} <button onClick={() => setActiveFilters((p) => p.filter((_, j) => j !== i))}><X size={10} /></button>
              </span>
            ))}
            <button onClick={() => setActiveFilters([])} className="text-[10px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Clear all</button>
          </div>
        )}
      </FilterBar>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-3">

        {/* Create Opportunity Modal */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Opportunity" size="md"
          footer={<>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="gradient" size="sm" onClick={(e) => handleCreate(e as unknown as React.FormEvent)} disabled={creating || !newName.trim()} loading={creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </>}>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="relative" ref={accountDropdownRef}>
              <label className="text-[13px] font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>
                <Building2 size={12} className="inline mr-1" style={{ verticalAlign: "-1px" }} /> Account
              </label>
              <Input
                value={newAccountId ? accounts.find((a) => a.id === newAccountId)?.name || accountSearch : accountSearch}
                onChange={(e) => { setAccountSearch(e.target.value); setNewAccountId(""); setShowAccountDropdown(true); }}
                onFocus={() => setShowAccountDropdown(true)} placeholder="Search accounts..."
              />
              {showAccountDropdown && filteredAccountList.length > 0 && !newAccountId && (
                <div className="absolute z-20 mt-1 w-full max-h-40 overflow-auto rounded-md py-1" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog)" }}>
                  {filteredAccountList.slice(0, 8).map((a) => (
                    <button key={a.id} type="button" className="w-full px-3 py-1.5 text-left text-[13px] transition-colors" style={{ color: "var(--color-text-primary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      onClick={() => { setNewAccountId(a.id); setAccountSearch(a.name); setShowAccountDropdown(false); }}>
                      <span className="font-medium">{a.name}</span>
                      {a.domain && <span className="ml-2 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{a.domain}</span>}
                    </button>
                  ))}
                </div>
              )}
              {newAccountId && <button type="button" className="absolute right-2 top-[34px]" style={{ color: "var(--color-text-tertiary)" }} onClick={() => { setNewAccountId(""); setAccountSearch(""); }}><X size={12} /></button>}
            </div>
            <Input label="Deal name *" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Acme Corp - Enterprise Plan" autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Stage" value={createStage} onChange={(e) => setCreateStage(e.target.value)} options={stageOptions} />
              <Input label="Value ($)" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="10000" type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Expected close date" value={newCloseDate} onChange={(e) => setNewCloseDate(e.target.value)} type="date" />
              <div>
                <label className="text-[13px] font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Contact</label>
                <select value={newContactId} onChange={(e) => setNewContactId(e.target.value)} className="h-8 w-full rounded-md px-2.5 text-[13px] outline-none"
                  style={{ background: "var(--color-bg-card)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}>
                  <option value="">No contact</option>
                  {(filteredContactList.length > 0 ? filteredContactList : contacts).slice(0, 50).map((c) => (
                    <option key={c.id} value={c.id}>{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[13px] font-medium mb-1 block" style={{ color: "var(--color-text-secondary)" }}>Owner</label>
              <OwnerSelect value={newOwnerId} onChange={setNewOwnerId} defaultToSelf className="h-8 w-full" />
            </div>
          </form>
        </Modal>

        {/* (e) Revenue Forecast Panel */}
        {showForecast && (
          <div className="mb-3">
            {forecastLoading ? (
              <Card><CardBody className="py-6 text-center">
                <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>Computing forecast (10,000 simulations)...</p>
              </CardBody></Card>
            ) : forecast ? (
              <Card>
                <CardBody>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} style={{ color: "var(--color-accent)" }} />
                      <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Revenue Forecast</span>
                      <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {forecast.simulationCount.toLocaleString()} Monte Carlo simulations
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchForecast} disabled={forecastLoading}>
                      Refresh
                    </Button>
                  </div>

                  {/* Range bar chart */}
                  {forecast.scenarios.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {forecast.scenarios.map((s) => {
                        const maxP90 = Math.max(...forecast.scenarios.map((sc) => sc.p90), 1);
                        return (
                          <div key={s.period} className="flex items-center gap-3">
                            <span className="w-16 text-right text-[12px] font-medium tabular-nums shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                              {s.period}
                            </span>
                            <div className="flex-1 h-6 relative rounded" style={{ background: "var(--color-bg-page)" }}>
                              {/* p10-p90 range bar */}
                              <div
                                className="absolute top-0.5 bottom-0.5 rounded"
                                style={{
                                  left: `${(s.p10 / maxP90) * 100}%`,
                                  width: `${((s.p90 - s.p10) / maxP90) * 100}%`,
                                  background: "var(--color-accent-soft, rgba(37,99,235,0.15))",
                                  border: "1px solid var(--color-accent)",
                                  minWidth: 4,
                                }}
                              />
                              {/* p50 marker */}
                              <div
                                className="absolute top-0 bottom-0 w-0.5"
                                style={{
                                  left: `${(s.p50 / maxP90) * 100}%`,
                                  background: "var(--color-accent)",
                                }}
                              />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
                                ${(s.p10 / 1000).toFixed(0)}K
                              </span>
                              <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--color-accent)" }}>
                                ${(s.p50 / 1000).toFixed(0)}K
                              </span>
                              <span className="text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
                                ${(s.p90 / 1000).toFixed(0)}K
                              </span>
                            </div>
                            <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-tertiary)" }}>
                              {s.dealCount} deals
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 ml-[76px] mt-1">
                        <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Pessimistic (p10)</span>
                        <span className="h-px flex-1" style={{ background: "var(--color-border-default)" }} />
                        <span className="text-[10px] font-medium" style={{ color: "var(--color-accent)" }}>Likely (p50)</span>
                        <span className="h-px flex-1" style={{ background: "var(--color-border-default)" }} />
                        <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Optimistic (p90)</span>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-4 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>No forecast scenarios to display.</p>
                  )}

                  {/* Top deals table */}
                  {forecast.topDeals.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">Top Deals by Expected Revenue</p>
                      <div className="rounded-md overflow-hidden" style={{ border: "1px solid var(--color-border-default)" }}>
                        <table className="w-full text-left">
                          <thead>
                            <tr style={{ background: "var(--color-bg-hover)" }}>
                              <th className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Deal</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Value</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Win Prob</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Close</th>
                            </tr>
                          </thead>
                          <tbody>
                            {forecast.topDeals.slice(0, 5).map((d) => {
                              const probPct = Math.round(d.winProbability * 100);
                              return (
                                <tr
                                  key={d.id}
                                  className="cursor-pointer transition-colors"
                                  style={{ borderTop: "1px solid var(--color-border-default)" }}
                                  onClick={() => router.push(`/opportunities/${d.id}`)}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                >
                                  <td className="px-2 py-1.5 text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{d.name}</td>
                                  <td className="px-2 py-1.5 text-right text-[12px] font-medium tabular-nums" style={{ color: "var(--color-success)" }}>${d.value.toLocaleString()}</td>
                                  <td className="px-2 py-1.5 text-right">
                                    <span
                                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                                      style={{
                                        background: probPct >= 70 ? "var(--color-success-soft)" : probPct >= 40 ? "var(--color-warning-soft)" : "var(--color-error-soft)",
                                        color: probPct >= 70 ? "var(--color-success)" : probPct >= 40 ? "var(--color-warning)" : "var(--color-error)",
                                      }}
                                    >
                                      {probPct}%
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>{d.expectedCloseWeek}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Risk factors */}
                  {forecast.riskFactors.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">Risk Factors</p>
                      <div className="flex flex-wrap gap-1.5">
                        {forecast.riskFactors.map((rf, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
                            title={rf}
                          >
                            <AlertTriangle size={9} />
                            {rf.length > 60 ? rf.slice(0, 57) + "..." : rf}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            ) : (
              <Card><CardBody className="py-4 text-center">
                <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>No forecast data available. Add deals to your pipeline first.</p>
              </CardBody></Card>
            )}
          </div>
        )}

        {/* KPI Row — compact */}
        {showAnalytics && analytics ? (
          <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
            <Card><CardBody className="px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Pipeline</p>
              <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>${analytics.totalPipelineValue.toLocaleString()}</p>
            </CardBody></Card>
            <Card><CardBody className="px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Won</p>
              <p className="text-[15px] font-semibold" style={{ color: "var(--color-success)" }}>${analytics.wonValue.toLocaleString()}</p>
            </CardBody></Card>
            <Card><CardBody className="px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Win Rate</p>
              <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{analytics.winRate}%</p>
            </CardBody></Card>
            <Card><CardBody className="px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Avg Deal</p>
              <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>${analytics.avgDealValue.toLocaleString()}</p>
            </CardBody></Card>
            <Card><CardBody className="px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Velocity</p>
              <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{analytics.avgVelocityDays}d</p>
            </CardBody></Card>
            <Card><CardBody className="px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>At Risk</p>
              <p className="text-[15px] font-semibold" style={{ color: analytics.riskSummary.high > 0 ? "var(--color-error)" : analytics.riskSummary.medium > 0 ? "var(--color-warning)" : "var(--color-success)" }}>
                {analytics.riskSummary.high + analytics.riskSummary.medium}
              </p>
            </CardBody></Card>
          </div>
        ) : showAnalytics && analyticsError ? (
          <div className="mb-3 flex items-center gap-3 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            <span>Couldn&apos;t load pipeline metrics.</span>
            <button
              type="button"
              onClick={() => fetchAnalytics()}
              className="rounded px-2 py-0.5 font-medium"
              style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Main view */}
        {loading ? (
          <div className="flex flex-1 items-stretch gap-3 overflow-x-auto">
            {[{ name: "Lead", cards: 3 }, { name: "Qualification", cards: 2 }, { name: "Demo", cards: 2 }, { name: "Proposal", cards: 1 }, { name: "Negotiation", cards: 1 }, { name: "Won", cards: 1 }].map((s, idx) => (
              <KanbanColumnSkeleton key={s.name} name={s.name} cards={s.cards} index={idx} />
            ))}
          </div>
        ) : dealsError && deals.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Couldn&apos;t load your pipeline</p>
            <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>Something went wrong. Your deals are safe — try again.</p>
            <button
              type="button"
              onClick={() => fetchDeals()}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
            >
              Retry
            </button>
          </div>
        ) : viewMode === "table" ? (
          /* ── TABLE VIEW ── */
          <div className="flex-1 overflow-auto rounded-md" style={{ border: "1px solid var(--color-border-default)" }}>
            <table className="w-full text-left">
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border-default)" }}>
                  <th className="px-3 py-2" style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all deals"
                      checked={selectedRows.size > 0 && selectedRows.size === sortedDeals.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedRows(new Set(sortedDeals.map((d) => d.id)));
                        else setSelectedRows(new Set());
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                  </th>
                  {[
                    { key: "name" as SortField, label: "Deal", always: true },
                    { key: "companyName" as SortField, label: "Account", always: false, prop: "companyName" as DisplayPropKey },
                    { key: "stage" as SortField, label: "Stage", always: true },
                    { key: "value" as SortField, label: "Value", always: false, prop: "value" as DisplayPropKey, right: true },
                    { key: "name" as SortField, label: "Owner", always: false, prop: "owner" as DisplayPropKey, noSort: true },
                    { key: "expectedCloseDate" as SortField, label: "Close date", always: false, prop: "expectedCloseDate" as DisplayPropKey },
                    { key: "name" as SortField, label: "Risk", always: false, prop: "risk" as DisplayPropKey, noSort: true },
                    { key: "name" as SortField, label: "Probability", always: false, prop: "probability" as DisplayPropKey, noSort: true, right: true },
                    { key: "name" as SortField, label: "Age in stage", always: false, prop: "ageInStage" as DisplayPropKey, noSort: true },
                  ].filter((col) => col.always || (col.prop && displayProps.has(col.prop))).map((col) => (
                    <th key={col.label} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${col.right ? "text-right" : ""}`} style={{ color: "var(--color-text-secondary)" }}>
                      {col.noSort ? col.label : (
                        <button className="flex items-center gap-1" onClick={() => { setSortField(col.key); setSortDir((d) => sortField === col.key ? (d === "asc" ? "desc" : "asc") : "asc"); }}>
                          {col.label} {sortField === col.key && (sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </button>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2" style={{ width: 44 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sortedDeals.map((deal) => (
                  <tr key={deal.id} data-cle-entity={deal.id} data-selected={selectedRows.has(deal.id) ? "true" : undefined} onClick={() => handleCardClick(deal.id)} className="cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--color-border-default)", background: selectedRows.has(deal.id) ? "var(--color-bg-selected, var(--color-bg-hover))" : undefined }}
                    onMouseEnter={(e) => { if (!selectedRows.has(deal.id)) e.currentTarget.style.background = "var(--color-bg-hover)"; }} onMouseLeave={(e) => { if (!selectedRows.has(deal.id)) e.currentTarget.style.background = "transparent"; }}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${deal.name}`}
                        checked={selectedRows.has(deal.id)}
                        onChange={(e) => {
                          const next = new Set(selectedRows);
                          if (e.target.checked) next.add(deal.id); else next.delete(deal.id);
                          setSelectedRows(next);
                        }}
                        className="h-3.5 w-3.5 rounded"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[13px] font-medium inline-flex items-center gap-1" style={{ color: "var(--color-text-primary)" }}>
                        {hasMomentum(deal) && <Zap size={12} style={{ color: "var(--color-warning)" }} aria-label="Momentum" />}
                        {deal.name}
                      </span>
                    </td>
                    {displayProps.has("companyName") && <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{deal.companyName || "—"}</td>}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {(() => { const Icon = STAGE_ICONS[deal.stage] || CircleDot; return <Icon size={13} style={{ color: STAGE_DOT_COLORS[deal.stage as keyof typeof STAGE_DOT_COLORS] || "var(--color-text-tertiary)" }} />; })()}
                        <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{STAGE_LABELS[deal.stage] || deal.stage}</span>
                      </div>
                    </td>
                    {displayProps.has("value") && <td className="px-3 py-2.5 text-right text-[12px] font-medium" style={{ color: deal.value ? "var(--color-success)" : "var(--color-text-tertiary)" }}>{deal.value ? `$${deal.value.toLocaleString()}` : "—"}</td>}
                    {displayProps.has("owner") && (
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold" style={{ background: "var(--color-accent)", color: "white" }}>{getOwnerInitials(deal)}</div>
                        <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{getOwnerName(deal)}</span>
                      </div></td>
                    )}
                    {displayProps.has("expectedCloseDate") && <td className="px-3 py-2.5 text-[12px]" style={{ color: formatCloseDate(deal.expectedCloseDate)?.includes("overdue") ? "var(--color-error)" : "var(--color-text-secondary)" }}>{formatCloseDate(deal.expectedCloseDate) || "—"}</td>}
                    {displayProps.has("risk") && <td className="px-3 py-2.5">{getRiskBadge(deal) || <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>—</span>}</td>}
                    {/* Y8 — probability column. Pure derive from stage so
                        a future per-deal override (Y8 follow-up) just
                        needs to swap the helper call for a property
                        lookup. */}
                    {displayProps.has("probability") && (() => {
                      const p = stageProbability(deal.stage);
                      return (
                        <td className="px-3 py-2.5 text-right text-[12px] font-medium tabular-nums" style={{ color: p === null ? "var(--color-text-tertiary)" : "var(--color-text-secondary)" }}>
                          {p === null ? "—" : `${p}%`}
                        </td>
                      );
                    })()}
                    {/* Y12 — age-in-stage badge. Uses updatedAt as the
                        best-available "last activity on this deal"
                        timestamp. Won/Lost rows render "—" because
                        ageInStage returns null for closed stages. */}
                    {displayProps.has("ageInStage") && (() => {
                      const age = ageInStage(deal.updatedAt, deal.stage);
                      if (!age) {
                        return (
                          <td className="px-3 py-2.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>—</td>
                        );
                      }
                      const c = AGE_BUCKET_COLORS[age.bucket];
                      return (
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                            style={{ background: c.bg, color: c.text }}
                            title={`${age.long} in this stage`}
                          >
                            {age.short}
                          </span>
                        </td>
                      );
                    })()}
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`Delete ${deal.name}`}
                        title="Delete opportunity"
                        onClick={() => void openCascadeDelete([deal.id], deal.name ?? "This opportunity")}
                        className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {sortedDeals.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>No deals match your filters</td></tr>}
              </tbody>
            </table>
            {sortedDeals.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 text-[11px] font-medium" style={{ background: "var(--color-bg-hover)", borderTop: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}>
                <span>{sortedDeals.length} deal{sortedDeals.length !== 1 ? "s" : ""}</span>
                <span style={{ color: "var(--color-success)" }}>Total: ${sortedDeals.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()}</span>
              </div>
            )}
          </div>
        ) : (
          /* ── BOARD VIEW (Lightfield-style) ── */
          <div className="flex flex-1 items-stretch gap-3 overflow-x-auto">
            {activeStages.map((stage, idx) => {
              const stageDeals = dealsByStage[stage.id] || [];
              const dotColor = STAGE_DOT_COLORS[stage.id as keyof typeof STAGE_DOT_COLORS]
                || (idx < 2 ? "var(--color-text-tertiary)" : idx < 4 ? "var(--color-warning)" : "var(--color-success)");
              const stageTotal = stageDeals.reduce((s, d) => s + (d.value || 0), 0);

              return (
                <div key={stage.id}
                  className="flex w-[280px] flex-shrink-0 flex-col transition-colors duration-150"
                  style={{
                    background: dragOverStage === stage.id ? "rgba(44,107,237,0.04)" : "transparent",
                  }}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={(e) => handleDragLeave(e, e.currentTarget)}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  {/* Column header */}
                  <div className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {(() => { const Icon = STAGE_ICONS[stage.id] || CircleDot; return <Icon size={14} style={{ color: dotColor }} />; })()}
                        <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{stage.name}</span>
                        <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                          {stage.wipLimit ? `${stageDeals.length}/${stage.wipLimit}` : stageDeals.length}
                        </span>
                        {/* Y9 — over-capacity badge. Amber so it reads as a
                            nudge, not a hard error; the limit is advisory,
                            not enforced. */}
                        {stage.wipLimit != null && stageDeals.length > stage.wipLimit && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                            style={{
                              background: "var(--color-warning-soft)",
                              color: "var(--color-warning)",
                            }}
                            title={`${stageDeals.length} deals in this stage — WIP limit is ${stage.wipLimit}. Move some forward before adding more.`}
                          >
                            Over capacity
                          </span>
                        )}
                      </div>
                      <button onClick={() => openCreateForStage(stage.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                        style={{ color: "var(--color-text-tertiary)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-card)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        title={`Add to ${stage.name}`}>
                        <Plus size={14} />
                      </button>
                    </div>
                    {/* Stage $ total — Monaco-parity: pipeline value
                        per column visible in the header so the founder
                        sees revenue distribution at a glance. Tabular
                        nums keep digits aligned across columns. */}
                    <div
                      className="mt-1 text-[11px] tabular-nums"
                      style={{ color: stageTotal > 0 ? "var(--color-success)" : "var(--color-text-tertiary)" }}
                      title={`Total pipeline value in ${stage.name}`}
                    >
                      ${stageTotal.toLocaleString()}
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 space-y-2 overflow-y-auto p-2">
                    {stageDeals.map((deal) => (
                      <div key={deal.id} data-cle-entity={deal.id} draggable
                        onDragStart={(e) => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleCardClick(deal.id)}
                        className={`group relative rounded-lg p-3 transition-all duration-150 ${draggedDealId === deal.id ? "opacity-40" : ""}`}
                        style={{
                          background: "var(--color-bg-card)",
                          border: "1px solid var(--color-border-default)",
                          borderLeft: `3px solid ${getRiskBorder(deal)}`,
                          cursor: draggedDealId === deal.id ? "grabbing" : "grab",
                        }}
                      >
                        {/* Delete — appears on card hover, top-right. */}
                        <button
                          type="button"
                          aria-label={`Delete ${deal.name}`}
                          title="Delete opportunity"
                          onClick={(e) => { e.stopPropagation(); void openCascadeDelete([deal.id], deal.name ?? "This opportunity"); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ color: "var(--color-text-muted)", background: "var(--color-bg-card)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                        {/* Account */}
                        {displayProps.has("companyName") && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {deal.companyDomain ? (
                              <CompanyLogo domain={deal.companyDomain} name={deal.companyName || "?"} size={16} />
                            ) : (
                              <Building2 size={12} style={{ color: "var(--color-accent)" }} />
                            )}
                            <span className="text-[12px] font-medium" style={{ color: deal.companyName ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                              {deal.companyName || "No account"}
                            </span>
                          </div>
                        )}

                        {/* Deal name */}
                        <div className="flex items-center gap-1.5 mb-2">
                          <CircleDot size={12} style={{ color: "var(--color-text-tertiary)" }} />
                          <span className="text-[12px] font-medium leading-tight" style={{ color: "var(--color-text-primary)" }}>
                            {hasMomentum(deal) && <Zap size={12} style={{ color: "var(--color-warning)" }} aria-label="Momentum" />}
                            {deal.name}
                          </span>
                        </div>

                        {/* Properties — each on its own line, like Lightfield */}
                        <div className="space-y-1.5">
                          {/* Owner */}
                          {displayProps.has("owner") && (
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold flex-shrink-0"
                                style={{ background: "var(--color-accent)", color: "white" }}>
                                {getOwnerInitials(deal)}
                              </div>
                              <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{getOwnerName(deal)}</span>
                            </div>
                          )}

                          {/* Value */}
                          {displayProps.has("value") && (
                            <div className="flex items-center gap-2">
                              <DollarSign size={12} className="flex-shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                              <span className="text-[12px]" style={{ color: deal.value ? "var(--color-success)" : "var(--color-text-muted)" }}>
                                {deal.value ? `$${deal.value.toLocaleString()}` : "No amount"}
                              </span>
                            </div>
                          )}

                          {/* Close date */}
                          {displayProps.has("expectedCloseDate") && (
                            <div className="flex items-center gap-2">
                              <Calendar size={12} className="flex-shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                              <span className="text-[12px]" style={{
                                color: deal.expectedCloseDate
                                  ? (formatCloseDate(deal.expectedCloseDate)?.includes("overdue") ? "var(--color-error)" : "var(--color-text-secondary)")
                                  : "var(--color-text-muted)"
                              }}>
                                {deal.expectedCloseDate ? formatCloseDate(deal.expectedCloseDate) : "No close date"}
                              </span>
                            </div>
                          )}

                          {/* Risk */}
                          {displayProps.has("risk") && getRiskBadge(deal) && (
                            <div className="flex items-center gap-2">
                              {getRiskBadge(deal)}
                            </div>
                          )}
                        </div>

                        {/* Summary */}
                        {displayProps.has("summary") && deal.summary && (
                          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed" style={{ color: "var(--color-text-tertiary)" }}>
                            {deal.summary}
                          </p>
                        )}
                      </div>
                    ))}

                    {/* Empty state */}
                    {stageDeals.length === 0 && (
                      <button onClick={() => openCreateForStage(stage.id)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-4 text-[12px] transition-colors"
                        style={{ color: "var(--color-text-tertiary)", border: "1px dashed var(--color-border-default)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-card)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <Plus size={13} /> Create opportunity
                      </button>
                    )}
                  </div>

                  {/* Column footer */}
                  <div className="flex items-center justify-center gap-1 px-3 py-2"
                    style={{ color: stageTotal > 0 ? "var(--color-success)" : "var(--color-text-muted)" }}>
                    <DollarSign size={11} />
                    <span className="text-[12px] font-medium">${stageTotal.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CloseReasonDialog
        open={pendingClose !== null}
        outcome={pendingClose?.outcome ?? null}
        dealName={
          pendingClose
            ? (deals.find((d) => d.id === pendingClose.dealId)?.name ?? "this deal")
            : ""
        }
        onConfirm={handleCloseReasonConfirm}
        onCancel={handleCloseReasonCancel}
      />

      {/* Delete — single row or the multi-selection — with optional cascade
          to related data. Soft-delete: everything moves to the Archive view
          and is restorable anytime. */}
      <CascadeDeleteModal
        open={!!cascadeTarget}
        entityKind={cascadeTarget && cascadeTarget.ids.length > 1 ? `${cascadeTarget.ids.length} opportunities` : "opportunity"}
        entityLabel={cascadeTarget?.label ?? "This opportunity"}
        entityCount={cascadeTarget?.ids.length ?? 1}
        options={cascadeCounts}
        busy={cascadeBusy}
        onConfirm={performCascadeDelete}
        onCancel={() => { if (!cascadeBusy) setCascadeTarget(null); }}
      />
    </div>
  );
}
