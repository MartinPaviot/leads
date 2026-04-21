"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDot, Plus, BarChart3, ChevronDown, ChevronUp,
  Search, X, Building2, User, Calendar, DollarSign, Clock,
  LayoutGrid, List, SlidersHorizontal, Filter, ArrowUpDown, ArrowUp, ArrowDown,
  ClipboardCheck, MonitorPlay, FlaskConical, FileText, Handshake, Trophy, XCircle,
  AlertTriangle, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STAGE_COLORS as STAGE_DOT_COLORS_IMPORTED, RISK_STYLES } from "@/lib/ui-utils";
import { stageProbability, ageInStage, AGE_BUCKET_COLORS } from "@/lib/deal-helpers";
import { CloseReasonDialog, type CloseReasonPayload } from "@/components/close-reason-dialog";
import { usePipelineStages } from "@/hooks/use-custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { CompanyLogo } from "@/components/ui/company-logo";
import { useToast } from "@/components/ui/toast";

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

/* ── Main Component ── */

export default function OpportunitiesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const { stages: pipelineStages } = usePipelineStages();

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createStage, setCreateStage] = useState("lead");
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCloseDate, setNewCloseDate] = useState("");
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
  const [showAnalytics, setShowAnalytics] = useState(true);

  // View, display, filters
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
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

  // Drag & drop
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const isDraggingRef = useRef(false);

  /* ── Data fetching ── */

  const fetchAnalytics = useCallback(async () => {
    try { const r = await fetch("/api/pipeline/analytics"); if (r.ok) setAnalytics(await r.json()); }
    catch (e) { console.warn("opportunities: analytics fetch failed", e); }
  }, []);

  const fetchDeals = useCallback(async () => {
    try {
      const r = await fetch("/api/opportunities");
      if (r.ok) { const d = await r.json(); setDeals(d.deals || []); }
    } catch (e) { console.warn("opportunities: deals fetch failed", e); }
    finally { setLoading(false); }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try { const r = await fetch("/api/accounts?pageSize=200"); if (r.ok) { const d = await r.json(); setAccounts(d.accounts || []); } }
    catch (e) { console.warn("opportunities: accounts fetch failed", e); }
  }, []);

  const fetchContacts = useCallback(async () => {
    try { const r = await fetch("/api/contacts?pageSize=200"); if (r.ok) { const d = await r.json(); setContacts(d.contacts || []); } }
    catch (e) { console.warn("opportunities: contacts fetch failed", e); }
  }, []);

  useEffect(() => { fetchDeals(); fetchAnalytics(); }, [fetchDeals, fetchAnalytics]);
  useEffect(() => { if (showCreate) { fetchAccounts(); fetchContacts(); } }, [showCreate, fetchAccounts, fetchContacts]);

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
    setCreateStage(stageId); setNewName(""); setNewValue(""); setNewCloseDate("");
    setNewAccountId(""); setNewContactId(""); setAccountSearch(""); setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/opportunities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(), stage: createStage,
          value: newValue ? parseInt(newValue) : undefined,
          companyId: newAccountId || undefined, contactId: newContactId || undefined,
          expectedCloseDate: newCloseDate || undefined,
        }),
      });
      if (r.ok) {
        setShowCreate(false); fetchDeals(); fetchAnalytics();
      } else {
        toast("Failed to create opportunity", "error");
      }
    } catch (e) {
      toast("Failed to create opportunity", "error");
      console.warn("opportunities: create failed", e);
    } finally { setCreating(false); }
  }

  async function analyzeDeals() {
    if (deals.length === 0) return;
    setAnalyzing(true);
    try {
      const r = await fetch("/api/deals/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealIds: deals.map((d) => d.id) }),
      });
      if (r.ok) {
        await fetchDeals(); await fetchAnalytics();
        toast("Deal analysis complete", "success");
      } else {
        toast("Failed to analyze deals", "error");
      }
    } catch (e) {
      toast("Failed to analyze deals", "error");
      console.warn("opportunities: analyze failed", e);
    } finally { setAnalyzing(false); }
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

  /* ── Computed ── */

  // Y9 — carry `wipLimit` through to the column header so we can badge
  // over-capacity columns. Built-in stages have no WIP limit by default.
  const activeStages = pipelineStages.length > 0
    ? pipelineStages.map((s) => ({ id: s.id, name: s.name, description: s.description, wipLimit: s.wipLimit ?? null }))
    : STAGES.map((s) => ({ id: s, name: STAGE_LABELS[s] || s, description: "", wipLimit: null as number | null }));

  const stageOptions = activeStages.map((s) => ({ value: s.id, label: s.name }));

  // Filter
  const filteredDeals = deals.filter((d) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !(d.companyName?.toLowerCase().includes(q))) return false;
    }
    // Y12 — "Stalled" preset: only deals whose age-in-stage falls in
    // the stalled / frozen buckets (>= 14 days). Won/Lost are excluded
    // because ageInStage returns null for closed stages, so the filter
    // naturally hides them.
    if (stalledOnly) {
      const age = ageInStage(d.updatedAt, d.stage);
      if (!age || (age.bucket !== "stalled" && age.bucket !== "frozen")) return false;
    }
    for (const f of activeFilters) {
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
  });

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
  function getRiskBadge(d: Deal) {
    const r = (d.properties as Record<string, unknown>)?.riskLevel as string;
    if (!r || r === "none") return null;
    return <Badge variant={r === "high" ? "error" : r === "medium" ? "warning" : "info"} size="sm">{r.toUpperCase()}</Badge>;
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
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-card)" }}>
      {/* Header */}
      <PageHeader
        icon={<CircleDot size={16} />}
        title="Opportunities"
        subtitle={`${deals.length} deal${deals.length !== 1 ? "s" : ""}${totalValue > 0 ? ` \u00b7 $${totalValue.toLocaleString()} pipeline` : ""}`}
      >
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
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--color-border-default)" }}>
          {(["board", "table"] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{ background: viewMode === m ? "var(--color-accent)" : "transparent", color: viewMode === m ? "white" : "var(--color-text-secondary)", borderLeft: m === "table" ? "1px solid var(--color-border-default)" : "none" }}>
              {m === "board" ? <LayoutGrid size={12} /> : <List size={12} />} {m === "board" ? "Board" : "Table"}
            </button>
          ))}
        </div>
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
          </form>
        </Modal>

        {/* KPI Row — compact */}
        {analytics && showAnalytics && (
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
        )}

        {/* Main view */}
        {loading ? (
          <p className="mt-6 text-sm" style={{ color: "var(--color-text-tertiary)" }}>Loading...</p>
        ) : viewMode === "table" ? (
          /* ── TABLE VIEW ── */
          <div className="flex-1 overflow-auto rounded-md" style={{ border: "1px solid var(--color-border-default)" }}>
            <table className="w-full text-left">
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border-default)" }}>
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
                </tr>
              </thead>
              <tbody>
                {sortedDeals.map((deal) => (
                  <tr key={deal.id} onClick={() => handleCardClick(deal.id)} className="cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--color-border-default)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
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
                  </tr>
                ))}
                {sortedDeals.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-sm" style={{ color: "var(--color-text-tertiary)" }}>No deals match your filters</td></tr>}
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
                  <div className="flex items-center justify-between px-3 py-2.5">
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

                  {/* Cards */}
                  <div className="flex-1 space-y-2 overflow-y-auto p-2">
                    {stageDeals.map((deal) => (
                      <div key={deal.id} draggable
                        onDragStart={(e) => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleCardClick(deal.id)}
                        className={`rounded-lg p-3 transition-all duration-150 ${draggedDealId === deal.id ? "opacity-40" : ""}`}
                        style={{
                          background: "var(--color-bg-card)",
                          border: "1px solid var(--color-border-default)",
                          borderLeft: `3px solid ${getRiskBorder(deal)}`,
                          cursor: draggedDealId === deal.id ? "grabbing" : "grab",
                        }}
                      >
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
    </div>
  );
}
