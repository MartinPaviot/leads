"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Users, Search, Plus, Zap, X, Upload, Mail, Briefcase, Phone, Gauge, ExternalLink, Clock, ChevronDown, ChevronUp, History, GitMerge, Trash2, Archive, RotateCcw, type LucideIcon } from "lucide-react";
import { SmartImport } from "@/components/smart-import";
import { CompanyLogo } from "@/components/ui/company-logo";
import { displayScore, ENRICHMENT_COLORS } from "@/lib/util/ui-utils";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/context/custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, PropertyBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { useToast } from "@/components/ui/toast";
import { SmartSearchBar, ActiveFiltersChips } from "@/components/ui/smart-search-bar";
import { applyFilters } from "@/lib/search/filters";
import type { FilterCondition } from "@/lib/search/filters";
import { ColumnFilter, isColumnFilterActive, type ColumnFilterKind, type ColumnFilterState } from "@/components/ui/column-filter";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CascadeDeleteModal, type CascadeOption } from "@/components/ui/cascade-delete-modal";

function LinkedInIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
  score: number | null;
  scoreReasons: string[] | null;
  properties: Record<string, unknown> | null;
  lastInteraction: { date: string; summary: string | null } | null;
}

type EnrichStatus = "idle" | "enriching" | "done" | "failed";

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

export default function ContactsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Pagination
  const [page, setPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const pageSize = 50;
  // Sort
  const [sortField, setSortField] = useState<string>("firstName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Create contact
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ firstName: "", lastName: "", email: "", title: "", companyName: "" });
  // Smart Search — stacks on top of the text search box, powered by
  // /api/filters/parse-nl (resourceType: "contact"). Applied before the
  // text search so the user can combine "CTOs at fintech" with a
  // freeform typo-tolerant name lookup in the same session.
  const [smartFilters, setSmartFilters] = useState<FilterCondition[]>([]);
  const [smartMeta, setSmartMeta] = useState<{ reasoning: string; unmatched: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [importHistory, setImportHistory] = useState<Array<{ id: string; fileName: string; recordType: string; totalRows: number; createdCount: number; skippedCount: number; companiesCreated: number; status: string; createdAt: string }>>([]);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  // Archive view: true = show only soft-deleted contacts so they can be
  // reviewed and restored (parity with the Accounts archive).
  const [viewDeleted, setViewDeleted] = useState(false);
  // Per-column header filters (Notion / Excel style), parity with Accounts.
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null);
  // Column filters run server-side (debounced) so they span ALL contacts, not
  // just the loaded 50-row page. Company options also come from the server.
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [serverCompanyOptions, setServerCompanyOptions] = useState<string[]>([]);
  // Delete confirmation (single row or current selection).
  const [deleteTarget, setDeleteTarget] = useState<{ type: "single" | "bulk"; id?: string; name?: string } | null>(null);
  // Single-contact delete goes through the cascade modal (lets the user also
  // delete the contact's activities/notes/tasks in one step).
  const [cascadeTarget, setCascadeTarget] = useState<{ id: string; name: string } | null>(null);
  const [cascadeCounts, setCascadeCounts] = useState<CascadeOption[] | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { fields: customFields } = useCustomFields("contact");

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (viewDeleted) params.set("deleted", "true");
      if (debouncedSearch) params.set("search", debouncedSearch);
      // Map active column filters -> server params (see /api/contacts).
      const cf = debouncedColumnFilters;
      const txt = (k: string) => cf[k]?.text?.trim();
      const vals = (k: string) => (cf[k]?.values ?? []).filter(Boolean);
      const pres = (k: string) => cf[k]?.presence;
      if (txt("contact")) params.set("fName", txt("contact")!);
      if (txt("email")) params.set("fEmail", txt("email")!);
      if (txt("title")) params.set("fTitle", txt("title")!);
      if (vals("companyName").length) params.set("fCompany", vals("companyName").join(","));
      if (vals("score").length) params.set("fGrade", vals("score").join(","));
      if (pres("linkedin")) params.set("fLinkedin", pres("linkedin")!);
      if (pres("phone")) params.set("fPhone", pres("phone")!);
      // Smart-filter score threshold -> server (parity with accounts) so the
      // count reflects it; any residual non-score conditions stay client-side.
      for (const c of smartFilters) {
        if (c.field !== "score") continue;
        const n = typeof c.value === "number" ? c.value : Number(c.value);
        if (!Number.isFinite(n)) continue;
        if (c.operator === "gte" || c.operator === "gt") params.set("fScoreMin", String(n));
        else if (c.operator === "lte" || c.operator === "lt") params.set("fScoreMax", String(n));
        else if (c.operator === "eq") { params.set("fScoreMin", String(n)); params.set("fScoreMax", String(n)); }
      }

      const res = await fetch(`/api/contacts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || data.items || []);
        setTotalContacts(data.pagination?.total ?? (data.contacts || data.items)?.length ?? 0);
        if (data.filterOptions?.companies) setServerCompanyOptions(data.filterOptions.companies);
      }
    } catch (e) {
      console.warn("contacts: list fetch failed", e);
    } finally { setLoading(false); }
  }, [page, debouncedSearch, debouncedColumnFilters, smartFilters, viewDeleted]);

  // Debounce the search box and push it to the server, so the search spans ALL
  // contacts (not just the loaded 50-row page). Reset to page 1 on a new query.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Debounce column-filter changes -> server, and reset to page 1 so the
  // filtered set starts at the top.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedColumnFilters(columnFilters);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [columnFilters]);

  useEffect(() => {
    fetchContacts();
    fetch("/api/import/history")
      .then(r => r.ok ? r.json() : { imports: [] })
      .then(d => setImportHistory(d.imports || []))
      .catch((e) => console.warn("contacts: import history fetch failed", e));
  }, [fetchContacts]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportResult(`Imported ${data.created} contacts, ${data.companiesCreated} companies. ${data.skipped} skipped.`);
        fetchContacts();
      } else { setImportResult(`Error: ${data.error}`); }
    } catch { setImportResult("Import failed — network error"); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function isEnriched(contact: Contact): boolean {
    const props = contact.properties;
    return !!(contact.title && (contact.linkedinUrl || (props as Record<string, unknown>)?.seniority));
  }

  async function enrichSingle(id: string) {
    setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    try {
      const res = await fetch("/api/enrich-contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactIds: [id] }) });
      setEnrichStatus((prev) => ({ ...prev, [id]: res.ok ? "done" : "failed" }));
      if (res.ok) await fetchContacts();
    } catch { setEnrichStatus((prev) => ({ ...prev, [id]: "failed" })); }
  }


  // Sort contacts client-side
  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  // Create contact
  async function handleCreateContact() {
    if (!createForm.firstName && !createForm.email) {
      toast("First name or email required", "error");
      return;
    }
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        toast("Contact created", "success");
        setShowCreate(false);
        setCreateForm({ firstName: "", lastName: "", email: "", title: "", companyName: "" });
        fetchContacts();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to create contact", "error");
      }
    } catch {
      toast("Failed to create contact", "error");
    }
  }

  // Restore soft-deleted contacts from the Archive view — clears deleted_at,
  // lifts the suppression, and brings back the cascade children deleted with
  // each contact (matched by the shared delete timestamp).
  async function restoreContacts(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/contacts/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) { toast("Couldn't restore.", "error"); return; }
      const data = await res.json().catch(() => ({ restored: ids.length }));
      toast(`Restored ${data.restored} contact${data.restored === 1 ? "" : "s"}.`, "success");
      setSelectedRows(new Set());
      await fetchContacts();
    } catch (e) {
      console.warn("contacts: restore failed", e);
      toast("Couldn't restore.", "error");
    }
  }

  // Delete — single row or the current selection. Confirmed via the
  // <ConfirmDialog>; the actual requests fire here.
  async function performDelete() {
    if (!deleteTarget) return;
    const ids = deleteTarget.type === "single" && deleteTarget.id
      ? [deleteTarget.id]
      : Array.from(selectedRows);
    if (ids.length === 0) { setDeleteTarget(null); return; }
    setDeleting(true);
    let deleted = 0;
    let errors = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
        else errors++;
      } catch { errors++; }
    }
    setSelectedRows(new Set());
    setDeleting(false);
    setDeleteTarget(null);
    if (deleted > 0) {
      toast(`Deleted ${deleted} contact${deleted > 1 ? "s" : ""}${errors > 0 ? ` (${errors} failed)` : ""}`, "success");
      fetchContacts();
    } else {
      toast(`Delete failed for ${errors} contact${errors > 1 ? "s" : ""}`, "error");
    }
  }

  // Open the single-contact cascade modal and load live related-data counts.
  async function openCascadeDelete(id: string, name: string) {
    setCascadeTarget({ id, name });
    setCascadeCounts(null);
    const labels: Array<[string, string]> = [
      ["activities", "Activities"],
      ["notes", "Notes"],
      ["tasks", "Tasks"],
    ];
    try {
      const res = await fetch(`/api/contacts/${id}/related-counts`);
      const data = (await res.json().catch(() => ({}))) as { counts?: Record<string, number> };
      const counts = data.counts ?? {};
      setCascadeCounts(labels.map(([key, label]) => ({ key, label, count: counts[key] ?? 0 })));
    } catch {
      setCascadeCounts(labels.map(([key, label]) => ({ key, label, count: 0 })));
    }
  }

  // Soft-delete one contact plus any related sets the user ticked. The contact
  // route may 409 if the contact has active sequence enrollments.
  async function performCascadeDelete(selectedKeys: string[]) {
    if (!cascadeTarget) return;
    setCascadeBusy(true);
    try {
      const res = await fetch(`/api/contacts/${cascadeTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cascade: selectedKeys }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast(data.error || "Delete failed.", "error");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { cascaded?: Record<string, number> };
      const extra = Object.values(data.cascaded ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
      toast(
        extra > 0 ? `Deleted contact + ${extra} related record${extra === 1 ? "" : "s"}.` : "Deleted contact.",
        "success",
      );
      setSelectedRows(new Set());
      fetchContacts();
    } catch (e) {
      toast("Delete failed.", "error");
      console.warn("contacts: cascade delete failed", e);
    } finally {
      setCascadeBusy(false);
      setCascadeTarget(null);
    }
  }

  // K2 — bulk actions that operate on the current selection. Enrich
  // reuses the single-shot endpoint; merge navigates to a dedicated
  // picker page with the selected ids pre-filled.
  async function bulkEnrichSelected() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    try {
      const res = await fetch("/api/enrich-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids }),
      });
      for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: res.ok ? "done" : "failed" }));
      if (res.ok) {
        await fetchContacts();
        toast(`Enriched ${ids.length} contact${ids.length === 1 ? "" : "s"}.`, "success");
      } else {
        toast("Bulk enrichment failed.", "error");
      }
    } catch (e) {
      for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
      toast("Bulk enrichment failed.", "error");
      console.warn("contacts: bulk enrich selected failed", e);
    }
  }

  function bulkMergeSelected() {
    const ids = Array.from(selectedRows);
    if (ids.length < 2) {
      toast("Select at least 2 contacts to merge.", "info");
      return;
    }
    router.push(`/contacts/merge?ids=${ids.join(",")}`);
  }

  // Deep async mobile/email enrichment via FullEnrich (EU-strong, finds
  // what the synchronous waterfall missed). Fires one bulk request;
  // contacts update as FullEnrich posts results to /api/webhooks/fullenrich.
  async function bulkFindMobile() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    toast(`Searching mobiles for ${ids.length} contact${ids.length === 1 ? "" : "s"}…`, "info");
    try {
      const res = await fetch("/api/contacts/fullenrich-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data?.error || "FullEnrich isn't available.", "error");
        return;
      }
      toast(
        `FullEnrich is searching ${data.requested ?? ids.length} contact${(data.requested ?? ids.length) === 1 ? "" : "s"} — phones and emails appear as they're found.`,
        "success",
      );
      setSelectedRows(new Set());
    } catch (e) {
      toast("FullEnrich request failed.", "error");
      console.warn("contacts: fullenrich find-mobile failed", e);
    }
  }


  // Header column-filter config — label + kind drive the <ColumnFilter>
  // dropdowns. The filtering itself runs server-side (see fetchContacts ->
  // /api/contacts), spanning ALL contacts rather than just the loaded page.
  const FILTER_COLUMNS: Record<string, { label: string; kind: ColumnFilterKind }> = {
    contact: { label: "Contact", kind: "text" },
    companyName: { label: "Company", kind: "enum" },
    email: { label: "Email", kind: "text" },
    title: { label: "Title", kind: "text" },
    linkedin: { label: "LinkedIn", kind: "presence" },
    phone: { label: "Phone", kind: "presence" },
    score: { label: "Score", kind: "enum" },
  };

  // Enum filter options come from the server now: company names across ALL
  // contacts (not just the loaded page, which would hide values the server can
  // still filter on), and grades are a fixed scale.
  const columnOptions = useMemo<Record<string, string[]>>(() => ({
    companyName: serverCompanyOptions,
    score: ["A+", "A", "B", "C", "D", "F"],
  }), [serverCompanyOptions]);

  // Column filters now run server-side (see fetchContacts -> /api/contacts), so
  // `contacts` is already the filtered + paginated set. Only the NL smart
  // filters refine it client-side here.
  const smartFilteredContacts = smartFilters.length > 0
    ? applyFilters(contacts, smartFilters)
    : contacts;

  // The typed text search now runs server-side (debouncedSearch -> /api/contacts
  // ?search=) so it spans ALL contacts, not just the loaded page; smart filters
  // and column filters refine that set client-side. No client text re-filter
  // (it would also wrongly filter a natural-language query as a literal term).

  // Sort
  const filteredContacts = [...smartFilteredContacts].sort((a, b) => {
    let av: string | number | null = null;
    let bv: string | number | null = null;
    if (sortField === "firstName") { av = [a.firstName, a.lastName].filter(Boolean).join(" "); bv = [b.firstName, b.lastName].filter(Boolean).join(" "); }
    else if (sortField === "companyName") { av = a.companyName; bv = b.companyName; }
    else if (sortField === "email") { av = a.email; bv = b.email; }
    else if (sortField === "title") { av = a.title; bv = b.title; }
    else if (sortField === "score") { av = a.score; bv = b.score; }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(totalContacts / pageSize);

  return (
    <div className="flex h-full flex-col animate-content-in">
      <BulkActionsBar
        count={selectedRows.size}
        onClear={() => setSelectedRows(new Set())}
        actions={viewDeleted
          ? [
              { label: "Restore", icon: <RotateCcw size={13} />, onClick: () => restoreContacts(Array.from(selectedRows)) },
            ]
          : [
              { label: "Enrich", icon: <Zap size={13} />, onClick: bulkEnrichSelected },
              { label: "Find mobile", icon: <Phone size={13} />, onClick: bulkFindMobile },
              {
                label: "Merge",
                icon: <GitMerge size={13} />,
                onClick: bulkMergeSelected,
                disabled: selectedRows.size < 2,
              },
              {
                label: "Delete",
                icon: <Trash2 size={13} />,
                variant: "danger",
                onClick: () => setDeleteTarget({ type: "bulk" }),
              },
            ]}
      />
      <PageHeader icon={<Users size={16} />} title="Contacts" subtitle={`${contacts.length}`}>
        {/* Enrich lives in the selection bar — it only makes sense once
            contacts are checked. The toolbar keeps workspace-level actions.
            In the Archive view only the toggle back stays. */}
        {!viewDeleted && (
          <>
            <Button variant="outline" size="sm" icon={<GitMerge size={12} />} onClick={() => router.push("/contacts/merge")}>
              Find duplicates
            </Button>
            <Button variant="outline" size="sm" icon={<Upload size={12} />} onClick={() => setShowSmartImport(true)} style={{ color: "var(--color-accent)" }}>
              Smart Import
            </Button>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" disabled={importing} loading={importing} onClick={() => fileRef.current?.click()}>
                {importing ? "Importing..." : "Import CSV"}
              </Button>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
            <Button variant="gradient" size="sm" icon={<Plus size={12} />} onClick={() => setShowCreate(true)}>Create contact</Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          icon={viewDeleted ? <RotateCcw size={13} /> : <Archive size={13} />}
          onClick={() => { setViewDeleted((v) => !v); setSelectedRows(new Set()); setPage(1); }}
          title={viewDeleted ? "Back to the active contacts" : "Review removed contacts and restore them"}
        >
          {viewDeleted ? "Back to active" : "Archive"}
        </Button>
      </PageHeader>

      <FilterBar>
        {/* One intelligent search: type a name/email -> instant server search
            (spans all contacts); press Enter -> natural-language smart filters. */}
        <div className="flex-1">
          <SmartSearchBar
            resourceType="contact"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search a name or email — or describe and press Enter (e.g. CTOs at fintech in Geneva)"
            className="w-full"
            onFilters={(filters, meta) => {
              setSmartFilters(filters);
              setSmartMeta(meta);
              setPage(1); // smart-score now filters server-side — start at page 1
              // Keep the broad server text search (debouncedSearch) running and
              // let the extracted refinements (score / exclusions) compose on
              // top. The search box already matches the words across every
              // category — clearing it here would throw that away and leave a
              // literal client filter that contradicts the result.
              if (filters.length > 0) {
                toast(`Applied ${filters.length} smart filter${filters.length === 1 ? "" : "s"}`, "success");
              } else if (meta.unmatched.length > 0) {
                toast(`Searched all fields. Couldn't add a filter for: ${meta.unmatched.join(", ")}`, "info");
              }
            }}
            onError={(msg) => toast(msg, "error")}
          />
        </div>
        {(() => {
          const activeKeys = Object.keys(columnFilters).filter((k) => isColumnFilterActive(columnFilters[k]));
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
      </FilterBar>
      <ActiveFiltersChips
        filters={smartFilters}
        reasoning={smartMeta?.reasoning}
        unmatched={smartMeta?.unmatched}
        fieldLabels={{
          firstName: "First name",
          lastName: "Last name",
          title: "Title",
          email: "Email",
          companyName: "Company",
        }}
        onRemove={(i) => {
          setSmartFilters((prev) => prev.filter((_, idx) => idx !== i));
        }}
        onClear={() => {
          setSmartFilters([]);
          setSmartMeta(null);
        }}
      />

      {importResult && (
        <div className="flex w-full items-center justify-between px-6 py-2 text-xs"
          style={{ background: importResult.startsWith("Error") ? "var(--color-error-soft)" : "var(--color-success-soft)", color: importResult.startsWith("Error") ? "var(--color-error)" : "var(--color-success)" }}>
          <span>{importResult}</span>
          <button onClick={() => setImportResult(null)}><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={5} cols={10 + customFields.length} />
        ) : filteredContacts.length === 0 ? (
          /* K15 — fresh-tenant empty state offers two clear paths to
             value: import what the user already has, or have us go
             enrich the TAM accounts they just built. The "search returned
             nothing" case keeps the simpler search-clear CTA. Key off whether
             a search/filter is actually active (not `contacts.length === 0`,
             which is also true on a search miss — that wrongly showed the
             import CTA for a query that simply matched nothing). */
          !debouncedSearch &&
          smartFilters.length === 0 &&
          !Object.values(columnFilters).some((s) => isColumnFilterActive(s)) ? (
            <EmptyState
              icon={<Users size={28} />}
              title="No contacts yet"
              description="Get your first contacts in two clicks — import a CSV you already have, or let Apollo find decision-makers at your TAM accounts."
              actionLabel="Import CSV"
              onAction={() => setShowSmartImport(true)}
              actionVariant="gradient"
              secondaryActionLabel="Find contacts at top accounts"
              onSecondaryAction={() => router.push("/accounts?sort=score&dir=desc")}
            />
          ) : (
            <EmptyState
              icon={<Users size={28} />}
              title="No matching contacts"
              description="Try adjusting your search query, or clear it to see your full list."
              actionLabel="Clear search"
              onAction={() => setSearchQuery("")}
              actionVariant="outline"
            />
          )
        ) : (
          <table className="ls-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all contacts"
                    checked={selectedRows.size > 0 && selectedRows.size === filteredContacts.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRows(new Set(filteredContacts.map((c) => c.id)));
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                    className="h-3.5 w-3.5 rounded"
                  />
                </th>
                {([
                  { label: "Contact", icon: Users, field: "firstName", filterKey: "contact" },
                  { label: "Company", icon: Briefcase, field: "companyName", filterKey: "companyName" },
                  { label: "Email", icon: Mail, field: "email", filterKey: "email" },
                  { label: "Title", icon: Briefcase, field: "title", filterKey: "title" },
                  { label: "LinkedIn", icon: null as LucideIcon | null, field: null, filterKey: "linkedin" },
                  { label: "Phone", icon: Phone, field: null, filterKey: "phone" },
                  { label: "Score", icon: Gauge, field: "score", filterKey: "score" },
                  { label: "Last Interaction", icon: Clock, field: null },
                  ...customFields.map((f) => ({ label: f.name, icon: null as LucideIcon | null, field: null })),
                  { label: "", icon: null, field: null },
                ] as Array<{ label: string; icon: LucideIcon | null; field: string | null; filterKey?: string }>).map((col, i) => {
                  const fcfg = col.filterKey ? FILTER_COLUMNS[col.filterKey] : undefined;
                  return (
                  <th
                    key={i}
                    onClick={col.field ? () => handleSort(col.field!) : undefined}
                    style={col.field ? { cursor: "pointer", userSelect: "none" } : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.icon && <col.icon size={12} style={{ opacity: 0.5 }} />}
                      {col.label === "LinkedIn" && <span style={{ opacity: 0.5 }}><LinkedInIcon size={12} /></span>}
                      {col.label}
                      {col.field && sortField === col.field && (
                        <span className="text-[10px]">{sortDir === "asc" ? "^" : "v"}</span>
                      )}
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
              {filteredContacts.map((contact) => {
                const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";
                const statusColor = enrichStatus[contact.id] === "enriching" ? "var(--color-warning)"
                  : isEnriched(contact) ? "var(--color-success)"
                  : enrichStatus[contact.id] === "failed" ? "var(--color-error)"
                  : "var(--color-text-muted)";

                return (
                  <tr
                    key={contact.id}
                    data-selected={selectedRows.has(contact.id) ? "true" : undefined}
                    className="cursor-pointer"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                  >
                    {/* Selection checkbox */}
                    <td style={{ width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || contact.id}`}
                        checked={selectedRows.has(contact.id)}
                        onChange={(e) => {
                          const next = new Set(selectedRows);
                          if (e.target.checked) next.add(contact.id);
                          else next.delete(contact.id);
                          setSelectedRows(next);
                        }}
                        className="h-3.5 w-3.5 rounded"
                      />
                    </td>
                    {/* Contact name with avatar + status */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${enrichStatus[contact.id] === "enriching" ? "animate-pulse" : ""}`} style={{ background: statusColor }} />
                        <CompanyLogo domain={contact.companyDomain} name={contact.firstName || contact.email || "?"} size={24} />
                        <div className="min-w-0">
                          <button onClick={() => router.push(`/contacts/${contact.id}`)} className="truncate text-left text-[13px] font-medium transition-colors hover:underline" style={{ color: "var(--color-text-primary)" }}>
                            {name}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Company */}
                    <td>
                      {contact.companyName ? (
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{contact.companyName}</span>
                          {contact.companyDomain && (
                            <a href={`https://${contact.companyDomain}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <ExternalLink size={10} style={{ color: "var(--color-accent)", opacity: 0.5 }} />
                            </a>
                          )}
                        </div>
                      ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>

                    {/* Email */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {contact.email || "—"}
                    </td>

                    {/* Title */}
                    <td>
                      {contact.title ? (
                        <PropertyBadge value={contact.title} className="max-w-[180px] truncate" />
                      ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>

                    {/* LinkedIn */}
                    <td onClick={(e) => e.stopPropagation()}>
                      {contact.linkedinUrl ? (
                        <a href={contact.linkedinUrl.startsWith("http") ? contact.linkedinUrl : `https://${contact.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] transition-colors hover:underline" style={{ color: "#0A66C2" }}>
                          <LinkedInIcon size={13} />
                          <span>Profile</span>
                        </a>
                      ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>

                    {/* Phone */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {contact.phone || "—"}
                    </td>

                    {/* Score */}
                    <td>
                      {(() => {
                        const scoreInfo = displayScore(contact.score, isEnriched(contact));
                        if (!scoreInfo) return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
                        return (
                          <span className="flex items-center gap-1.5" title={contact.scoreReasons?.join("; ") || ""}>
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
                      {contact.lastInteraction ? (
                        <div title={contact.lastInteraction.summary || undefined}>
                          <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{timeAgo(contact.lastInteraction.date)}</span>
                          {contact.lastInteraction.summary && (
                            <p className="mt-0.5 max-w-[150px] truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{contact.lastInteraction.summary}</p>
                          )}
                        </div>
                      ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>}
                    </td>

                    {/* Custom fields */}
                    {customFields.map((field) => {
                      const value = getCustomFieldValue(contact.properties, field.id);
                      return (
                        <td key={field.id} style={{ color: "var(--color-text-secondary)" }}>
                          {value != null && value !== "" ? formatFieldValue(value, field.type) : "—"}
                        </td>
                      );
                    })}

                    {/* Actions */}
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {!isEnriched(contact) && enrichStatus[contact.id] !== "enriching" && (
                          <Button variant="ghost" size="sm" onClick={() => enrichSingle(contact.id)} className="!px-2 !py-0.5">Enrich</Button>
                        )}
                        <button
                          type="button"
                          aria-label={`Delete ${name}`}
                          title="Delete contact"
                          onClick={() => openCascadeDelete(contact.id, name)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Import History */}
      {importHistory.length > 0 && (
        <div className="shrink-0 px-4 pb-4">
          <button
            onClick={() => setShowImportHistory(!showImportHistory)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
            style={{ color: "var(--color-text-tertiary)", background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <History size={13} />
            Import history ({importHistory.length})
            {showImportHistory ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />}
          </button>
          {showImportHistory && (
            <div className="mt-2 space-y-1.5">
              {importHistory.map((imp) => (
                <div key={imp.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {imp.createdCount} contacts created
                      {imp.companiesCreated > 0 && `, ${imp.companiesCreated} companies`}
                      {imp.skippedCount > 0 && ` (${imp.skippedCount} skipped)`}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {new Date(imp.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}{imp.totalRows} rows · {imp.status}
                    </p>
                  </div>
                  <Badge variant={imp.status === "completed" ? "success" : imp.status === "partial" ? "warning" : "error"} size="sm">
                    {imp.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-5 py-2" style={{ borderColor: "var(--color-border)" }}>
          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {totalContacts} contacts · Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}

      {showSmartImport && <SmartImport onClose={() => setShowSmartImport(false)} onComplete={fetchContacts} />}

      {/* Create contact dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl p-6 shadow-xl" style={{ background: "var(--color-bg-card)" }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>Create Contact</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="First name" value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} />
                <Input placeholder="Last name" value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} />
              </div>
              <Input placeholder="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
              <Input placeholder="Title" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} />
              <Input placeholder="Company name" value={createForm.companyName} onChange={(e) => setCreateForm({ ...createForm, companyName: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="gradient" size="sm" onClick={handleCreateContact}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation — single row or current selection. */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={
          deleteTarget?.type === "bulk"
            ? `Delete ${selectedRows.size} contact${selectedRows.size === 1 ? "" : "s"}?`
            : "Delete contact?"
        }
        description={
          deleteTarget?.type === "bulk"
            ? `The selected contact${selectedRows.size === 1 ? "" : "s"} will be removed. Their activity history is kept.`
            : `"${deleteTarget?.name || "This contact"}" will be removed. Their activity history is kept.`
        }
        confirmLabel={
          deleteTarget?.type === "bulk" ? `Delete ${selectedRows.size}` : "Delete"
        }
        variant="destructive"
        busy={deleting}
        onConfirm={performDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />

      {/* Single-contact delete with optional cascade to related data. */}
      <CascadeDeleteModal
        open={!!cascadeTarget}
        entityKind="contact"
        entityLabel={cascadeTarget?.name ?? "This contact"}
        options={cascadeCounts}
        busy={cascadeBusy}
        onConfirm={performCascadeDelete}
        onCancel={() => { if (!cascadeBusy) setCascadeTarget(null); }}
      />
    </div>
  );
}
