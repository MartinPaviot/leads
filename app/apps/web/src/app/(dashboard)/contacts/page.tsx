"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Users, Search, Plus, Zap, X, Upload, Mail, Briefcase, Factory, Phone, Gauge, ExternalLink, Clock, ChevronDown, ChevronUp, History, GitMerge, Trash2, Archive, RotateCcw, Loader2, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions, useRegisterEntityLocator, cssEscape } from "@/lib/chat/page-actions/registry";
import type { EntityLocator } from "@/lib/chat/page-actions/registry";
import { SmartImport } from "@/components/smart-import";
import { CompanyLogo } from "@/components/ui/company-logo";
import { displayScore, ENRICHMENT_COLORS } from "@/lib/util/ui-utils";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/context/custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, TitleBadge, IndustryBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { MoreMenu } from "@/components/ui/more-menu";
import { useToast } from "@/components/ui/toast";
import { SmartSearchBar, ActiveFiltersChips } from "@/components/ui/smart-search-bar";
import { applyFilters } from "@/lib/search/filters";
import type { FilterCondition } from "@/lib/search/filters";
import { ColumnFilter, isColumnFilterActive, type ColumnFilterKind, type ColumnFilterState } from "@/components/ui/column-filter";
import { CascadeDeleteModal, type CascadeOption } from "@/components/ui/cascade-delete-modal";
import { chunkedBulkCall } from "@/lib/infra/chunk-bulk";
import { selectAllMatchingIds } from "@/lib/infra/select-all-matching";
import { phoneRegionLabel, PHONE_REGION_NONE, PHONE_REGION_UNKNOWN } from "@/lib/contacts/phone-region";
import { FiltersPanel, panelActiveCount, type PanelSection } from "@/components/ui/filters-panel";
import { seniorityLabel, compareSeniority } from "@/lib/contacts/seniority";
import { recencyLabel, RECENCY_BUCKETS } from "@/lib/contacts/recency";

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
  companyIndustry: string | null;
  score: number | null;
  scoreReasons: string[] | null;
  properties: Record<string, unknown> | null;
  lastInteraction: { date: string; summary: string | null } | null;
}

type EnrichStatus = "idle" | "enriching" | "done" | "failed";

/* ── CLE-08: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/** Human-readable summary of an applyFilter request (for the action result).
 *  Pure; emoji-free. Count is server-async, so it is not included here. */
function describeContactFilters(p: {
  contact?: string; companyName?: string[]; industry?: string[]; email?: string;
  title?: string[]; linkedin?: "present" | "absent"; phone?: string[];
  score?: string[];
}): string {
  const parts: string[] = [];
  if (p.contact) parts.push('name "' + p.contact + '"');
  if (p.companyName?.length) parts.push("company " + p.companyName.join("/"));
  if (p.industry?.length) parts.push("industry " + p.industry.join("/"));
  if (p.email) parts.push('email "' + p.email + '"');
  if (p.title?.length) parts.push("title " + p.title.join("/"));
  if (p.linkedin) parts.push("LinkedIn " + p.linkedin);
  if (p.phone?.length) parts.push("phone region " + p.phone.join("/"));
  if (p.score?.length) parts.push("score " + p.score.join("/"));
  return parts.length ? parts.join(", ") : "no filters";
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

/** Rows fetched per page — same batch size as the Accounts list, which the
 *  infinite scroll below mirrors. */
const PAGE_SIZE = 200;

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
  // Infinite scroll (parity with Accounts): pages accumulate as the user
  // scrolls; a sentinel below the last row auto-loads the next page when it
  // enters the scroll container's viewport.
  const [currentPage, setCurrentPage] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
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
  // "Score all contacts" (header More menu): true while the tenant-wide
  // ICP-fit run is in flight, so the item can't double-fire.
  const [scoringAll, setScoringAll] = useState(false);
  // Per-column header filters (Notion / Excel style), parity with Accounts.
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null);
  // Dedicated "Filtres" panel — houses the segment filters with no column home
  // (recency, seniority, region, sector family). Reads/writes `columnFilters`.
  const [showFilters, setShowFilters] = useState(false);
  // Sector-family facet (LLM-classified) — fetched lazily when the panel opens,
  // so the multi-second classification never blocks the contacts list.
  const [familyFacet, setFamilyFacet] = useState<Array<{ key: string; label: string; count: number }> | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  // Column filters run server-side (debounced) so they span ALL contacts, not
  // just the loaded 50-row page. Company options also come from the server.
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [serverCompanyOptions, setServerCompanyOptions] = useState<string[]>([]);
  // Distinct titles (frequency-ordered) across ALL contacts — the Title
  // header filter offers them as clickable values instead of free text.
  const [serverTitleOptions, setServerTitleOptions] = useState<string[]>([]);
  // Distinct company industries (frequency-ordered, with contact counts) —
  // options for the Industry column filter, Accounts-parity.
  const [serverIndustryOptions, setServerIndustryOptions] = useState<Array<{ industry: string; count: number }>>([]);
  // Per-value row counts keyed by the column's filterKey (companyName / industry
  // / title / score), for the "(N)" shown next to every value in the dropdowns.
  const [serverFilterCounts, setServerFilterCounts] = useState<Record<string, Record<string, number>> | null>(null);
  // Deletes — single row AND the checkbox selection — go through the cascade
  // modal (lets the user also delete the contacts' activities/notes/tasks in
  // one step). Everything is soft-delete, recoverable from Archive.
  const [cascadeTarget, setCascadeTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [cascadeCounts, setCascadeCounts] = useState<CascadeOption[] | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);
  const { fields: customFields } = useCustomFields("contact");

  /** Active search / filter state -> the query params /api/contacts
   *  understands. Shared by the page fetch and the post-mutation refetch. */
  const serializeContactFilters = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (viewDeleted) params.set("deleted", "true");
    if (debouncedSearch) params.set("search", debouncedSearch);
    // Map active column filters -> server params (see /api/contacts).
    const cf = debouncedColumnFilters;
    const txt = (k: string) => cf[k]?.text?.trim();
    const vals = (k: string) => (cf[k]?.values ?? []).filter(Boolean);
    const pres = (k: string) => cf[k]?.presence;
    if (txt("contact")) params.set("fName", txt("contact")!);
    if (txt("email")) params.set("fEmail", txt("email")!);
    if (vals("title").length) params.set("fTitleIn", vals("title").join(","));
    if (vals("companyName").length) params.set("fCompany", vals("companyName").join(","));
    if (vals("score").length) params.set("fGrade", vals("score").join(","));
    if (pres("linkedin")) params.set("fLinkedin", pres("linkedin")!);
    // Phone is now a region multi-select (dial codes + none/unknown) → fPhoneRegion.
    if (vals("phone").length) params.set("fPhoneRegion", vals("phone").join(","));
    // Panel filters (no column home): seniority + engagement recency + region.
    if (vals("seniority").length) params.set("fSeniority", vals("seniority").join(","));
    if (vals("recency").length) params.set("fRecency", vals("recency").join(","));
    if (vals("region").length) params.set("fRegion", vals("region").join(","));
    if (vals("family").length) params.set("fFamily", vals("family").join(","));
    // Industry column filter -> the contact's company industry (server-side,
    // same subquery shape as fCompany).
    if (vals("industry").length) params.set("fIndustry", vals("industry").join(","));
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
    return params;
  }, [viewDeleted, debouncedSearch, debouncedColumnFilters, smartFilters]);

  /** Fetch one page of contacts.
   *  - page=1, append=false → initial load / filter change (replaces list)
   *  - page>1, append=true  → infinite-scroll load (appends below)
   *  Any filter change recreates this callback, which re-runs the fetch
   *  effect below and resets the list to page 1. */
  const fetchContacts = useCallback(async (page = 1, append = false) => {
    try {
      if (page === 1 && !append) setLoading(true);
      else setLoadingMore(true);
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      for (const [k, v] of serializeContactFilters()) params.set(k, v);
      const res = await fetch(`/api/contacts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const batch: Contact[] = data.contacts || data.items || [];
        setContacts((prev) => (append ? [...prev, ...batch] : batch));
        setCurrentPage(data.pagination?.page ?? page);
        setTotalContacts(data.pagination?.total ?? batch.length);
        if (data.filterOptions?.companies) setServerCompanyOptions(data.filterOptions.companies);
        if (data.filterOptions?.titles) setServerTitleOptions(data.filterOptions.titles);
        if (data.filterOptions?.industries) setServerIndustryOptions(data.filterOptions.industries);
        if (data.filterCounts) setServerFilterCounts(data.filterCounts);
      }
    } catch (e) {
      console.warn("contacts: list fetch failed", e);
    } finally { setLoading(false); setLoadingMore(false); }
  }, [serializeContactFilters]);

  /** Reload every page loaded so far. Used after mutations (import, create,
   *  enrich, delete, restore) so the user keeps their scroll position and
   *  loaded rows instead of snapping back to the first page. */
  const refetchLoadedContacts = useCallback(async () => {
    try {
      const pagesToLoad = Math.max(currentPage, 1);
      let all: Contact[] = [];
      for (let p = 1; p <= pagesToLoad; p++) {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        for (const [k, v] of serializeContactFilters()) params.set(k, v);
        const res = await fetch(`/api/contacts?${params.toString()}`);
        if (!res.ok) break;
        const data = await res.json();
        const batch: Contact[] = data.contacts || data.items || [];
        all = [...all, ...batch];
        if (p === pagesToLoad) {
          setTotalContacts(data.pagination?.total ?? all.length);
          if (data.filterOptions?.companies) setServerCompanyOptions(data.filterOptions.companies);
          if (data.filterOptions?.titles) setServerTitleOptions(data.filterOptions.titles);
          if (data.filterOptions?.industries) setServerIndustryOptions(data.filterOptions.industries);
          if (data.filterCounts) setServerFilterCounts(data.filterCounts);
        }
      }
      setContacts(all);
    } catch (e) {
      console.warn("contacts: refetch failed", e);
    }
  }, [currentPage, serializeContactFilters]);

  const loadMoreContacts = useCallback(() => {
    if (loading || loadingMore) return;
    if (currentPage >= Math.ceil(totalContacts / PAGE_SIZE)) return;
    void fetchContacts(currentPage + 1, true);
  }, [fetchContacts, loading, loadingMore, currentPage, totalContacts]);

  // Auto-load on scroll: when the bottom sentinel enters the scroll
  // container's viewport, pull the next page (pre-fetching a little early
  // via rootMargin so growth feels seamless). `loadMoreContacts` is guarded
  // (no-op while a load is in flight or once the last page is reached) and
  // the effect re-binds after each page so it keeps chaining.
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    if (currentPage >= Math.ceil(totalContacts / PAGE_SIZE)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreContacts();
      },
      { root: scrollContainerRef.current ?? null, rootMargin: "300px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreContacts, currentPage, totalContacts, loading]);

  // Debounce the search box and push it to the server, so the search spans
  // ALL contacts (not just the loaded rows). A new query recreates
  // fetchContacts, which restarts the list from page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Debounce column-filter changes -> server; the filtered set restarts
  // from the top (page 1) via the fetch effect.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedColumnFilters(columnFilters);
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
        refetchLoadedContacts();
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
      if (res.ok) await refetchLoadedContacts();
      else toast("Enrichment failed.", "error");
    } catch { setEnrichStatus((prev) => ({ ...prev, [id]: "failed" })); toast("Enrichment failed.", "error"); }
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

  // CLE-08 §4: the POST /api/contacts body of handleCreateContact, parameterized
  // by the request body so both the create-modal button and contacts.createContact
  // issue the SAME request (+ refetch on success). One copy. The button keeps its
  // own toast / setShowCreate / setCreateForm reset.
  const submitCreateContact = useCallback(
    async (body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await refetchLoadedContacts();
          return { ok: true };
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: data.error || "Failed to create contact" };
      } catch {
        return { ok: false, error: "Failed to create contact" };
      }
    },
    [refetchLoadedContacts],
  );

  // Create contact
  async function handleCreateContact() {
    if (!createForm.firstName && !createForm.email) {
      toast("First name or email required", "error");
      return;
    }
    const r = await submitCreateContact(createForm);
    if (r.ok) {
      toast("Contact created", "success");
      setShowCreate(false);
      setCreateForm({ firstName: "", lastName: "", email: "", title: "", companyName: "" });
    } else {
      toast(r.error || "Failed to create contact", "error");
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
      await refetchLoadedContacts();
    } catch (e) {
      console.warn("contacts: restore failed", e);
      toast("Couldn't restore.", "error");
    }
  }

  // Open the cascade delete modal — for one row or the whole checkbox
  // selection — and load live related-data counts. One set-based aggregate
  // request, whatever the selection size.
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
      // The endpoint counts at most 500 ids per call — chunk and sum so the
      // modal's numbers stay truthful for select-all-sized selections.
      const counts: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 500) {
        const res = await fetch("/api/contacts/related-counts", {
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

  // Selection-bar Delete. A selection of one gets the contact's real name so
  // it reads exactly like a row delete.
  function openBulkCascadeDelete() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    const one = ids.length === 1 ? contacts.find((c) => c.id === ids[0]) : undefined;
    const label =
      ids.length === 1
        ? ([one?.firstName, one?.lastName].filter(Boolean).join(" ") || "This contact")
        : `${ids.length} selected contacts`;
    void openCascadeDelete(ids, label);
  }

  // CLE-08 §4: the per-id DELETE /api/contacts/:id { cascade } wave loop, lifted
  // verbatim from performCascadeDelete and parameterized by the ids + cascade keys
  // (NOT the modal's cascadeTarget). One copy of the delete loop, shared by the
  // cascade modal (button path) and contacts.bulkDelete (agent path). Returns the
  // counters; the caller owns its own toast / selection reset / refetch.
  const deleteContactsByIds = useCallback(
    async (
      ids: string[],
      cascade: string[],
    ): Promise<{ deleted: number; errors: number; extra: number; firstError: string | null }> => {
      let deleted = 0;
      let errors = 0;
      let extra = 0;
      let firstError: string | null = null;
      const WAVE = 6;
      for (let i = 0; i < ids.length; i += WAVE) {
        await Promise.all(
          ids.slice(i, i + WAVE).map(async (id) => {
            try {
              const res = await fetch(`/api/contacts/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cascade }),
              });
              if (res.ok) {
                deleted++;
                const data = (await res.json().catch(() => ({}))) as { cascaded?: Record<string, number> };
                extra += Object.values(data.cascaded ?? {}).reduce<number>((a, b) => a + (b ?? 0), 0);
              } else {
                errors++;
                if (!firstError) {
                  const data = (await res.json().catch(() => ({}))) as { error?: string };
                  firstError = data.error ?? null;
                }
              }
            } catch {
              errors++;
            }
          }),
        );
      }
      return { deleted, errors, extra, firstError };
    },
    [],
  );

  // Soft-delete the targeted contacts plus any related sets the user ticked.
  // Per-contact requests so each keeps its own delete timestamp (symmetric
  // restore) and a 409 (active sequence enrollment) only blocks that contact.
  // Requests run in small parallel waves — with "select all matching" a
  // selection can be the whole base, and strictly sequential round-trips
  // would take minutes.
  async function performCascadeDelete(selectedKeys: string[]) {
    if (!cascadeTarget) return;
    setCascadeBusy(true);
    const { deleted, errors, extra, firstError } = await deleteContactsByIds(cascadeTarget.ids, selectedKeys);
    setCascadeBusy(false);
    setCascadeTarget(null);
    if (deleted > 0) {
      toast(
        `Moved ${deleted} contact${deleted === 1 ? "" : "s"}${extra > 0 ? ` + ${extra} related record${extra === 1 ? "" : "s"}` : ""} to Archive${errors > 0 ? ` (${errors} failed)` : ""}.`,
        errors > 0 ? "warning" : "success",
      );
      setSelectedRows(new Set());
      refetchLoadedContacts();
    } else {
      toast(firstError || `Delete failed for ${errors} contact${errors > 1 ? "s" : ""}`, "error");
    }
  }

  // CLE-08 §4: the agent path's delete — runs the SAME per-id DELETE loop as the
  // cascade modal, on the LIVE selection, without re-opening the count-preview
  // modal (CLE-05's confirm card is already the agent's confirmation surface).
  // Returns a uniform result the contacts.bulkDelete run() surfaces.
  const deleteSelectedContacts = useCallback(
    async (cascade: string[]): Promise<{ ok: boolean; deleted: number; error?: string }> => {
      const ids = Array.from(selectedRows);
      if (ids.length === 0) return { ok: false, deleted: 0, error: "Select some contacts first." };
      const { deleted, errors, firstError } = await deleteContactsByIds(ids, cascade);
      if (deleted > 0) {
        setSelectedRows(new Set());
        await refetchLoadedContacts();
        return { ok: true, deleted };
      }
      return { ok: false, deleted: 0, error: firstError || `Delete failed for ${errors} contact${errors > 1 ? "s" : ""}` };
    },
    [selectedRows, deleteContactsByIds, refetchLoadedContacts],
  );

  // K2 — bulk actions that operate on the current selection. Enrich
  // reuses the single-shot endpoint; merge navigates to a dedicated
  // picker page with the selected ids pre-filled.
  async function bulkEnrichSelected() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    // The endpoint enriches at most 20 contacts per call (provider rate
    // guard) — fan out in 20-id chunks so EVERY selected contact is actually
    // processed. One POST with 990 ids used to enrich the first 20 and toast
    // "Enriched 990 contacts."
    const result = await chunkedBulkCall({
      ids,
      chunkSize: 20,
      endpoint: "/api/enrich-contacts",
      buildPayload: (chunk) => ({ contactIds: chunk }),
      onProgress: (done, total) => {
        if (total > 20) toast(`Enriching ${Math.min(done, total)} / ${total}…`, "info");
      },
    });
    const failedIds = new Set(result.errors.flatMap((e) => e.ids));
    setEnrichStatus((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = failedIds.has(id) ? "failed" : "done";
      return next;
    });
    if (result.succeeded > 0) {
      await refetchLoadedContacts();
      toast(
        result.failed === 0
          ? `Enriched ${result.succeeded} contact${result.succeeded === 1 ? "" : "s"}.`
          : `Enriched ${result.succeeded} of ${result.total} — ${result.failed} failed.`,
        result.failed === 0 ? "success" : "warning",
      );
    } else {
      toast("Bulk enrichment failed.", "error");
      console.warn("contacts: bulk enrich selected failed", result.errors);
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

  // "Score all contacts" (header More menu). One synchronous server-side
  // run over every contact: ICP-profile fit (company criteria + person
  // seniorities), same scale contract as accounts — score = 100 × the
  // primary profile's fit. No client fan-out: a 20-id chunk storm would
  // trip the rate limit on multi-thousand-contact tenants.
  async function scoreAllContacts() {
    if (scoringAll) return;
    setScoringAll(true);
    try {
      const res = await fetch("/api/score-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; scored?: number };
      if (!res.ok) {
        toast(data.error ?? `Scoring failed (${res.status})`, "error");
        return;
      }
      await refetchLoadedContacts();
      toast(`Scored ${data.scored ?? 0} contacts against your ICP profiles.`, "success");
    } catch (e) {
      toast("Scoring failed — network error.", "error");
      console.warn("contacts: score-all failed", e);
    } finally {
      setScoringAll(false);
    }
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
        toast(data?.error || "Deep enrichment isn't available.", "error");
        return;
      }
      // The deep pass runs at most 100 contacts per submission — say so
      // instead of silently dropping the rest of a select-all selection.
      const requested = data.requested ?? Math.min(ids.length, 100);
      toast(
        ids.length > 100
          ? `Deep enrichment runs 100 contacts at a time — searching ${requested} of ${ids.length} now. Run it again for the rest.`
          : `Searching ${requested} contact${requested === 1 ? "" : "s"} in depth — phones and emails appear as they're found.`,
        ids.length > 100 ? "warning" : "success",
      );
      setSelectedRows(new Set());
    } catch (e) {
      toast("Deep enrichment request failed.", "error");
      console.warn("contacts: fullenrich find-mobile failed", e);
    }
  }

  // Header-checkbox "select all": select EVERY contact matching the active
  // search/filters — the server resolves the full id set with the exact WHERE
  // the list and its count use — not just the loaded page. The loaded rows
  // are selected instantly for feedback; the full set replaces them when the
  // ids arrive. Residual non-score NL smart filters only exist client-side
  // (the server can't compute "all matching" for them), so with one active
  // the selection honestly stays the visible rows.
  // Returns the resolved selection set so a programmatic caller (the
  // contacts.selectAll page action) gets an accurate count without waiting for a
  // re-render to land in a ref. The checkbox caller ignores the return value —
  // behaviour-preserving.
  async function selectAllMatching(): Promise<Set<string>> {
    const visibleIds = filteredContacts.map((c) => c.id);
    const visibleSet = new Set(visibleIds);
    setSelectedRows(visibleSet);
    if (smartFilters.some((c) => c.field !== "score")) return visibleSet;
    if (contacts.length >= totalContacts) return visibleSet; // every matching row is already loaded
    const result = await selectAllMatchingIds({
      endpoint: "/api/contacts",
      params: serializeContactFilters(),
      visibleIds,
    });
    setSelectedRows(result.ids);
    if (result.failed) {
      toast(`Couldn't load the full list — selected the ${visibleIds.length} loaded contacts.`, "warning");
    } else if (result.truncated && result.total != null) {
      toast(`Selected the first ${result.ids.size.toLocaleString()} of ${result.total.toLocaleString()} matching contacts.`, "warning");
    }
    return result.ids;
  }

  // Header column-filter config — label + kind drive the <ColumnFilter>
  // dropdowns. The filtering itself runs server-side (see fetchContacts ->
  // /api/contacts), spanning ALL contacts rather than just the loaded page.
  const FILTER_COLUMNS: Record<string, { label: string; kind: ColumnFilterKind }> = {
    contact: { label: "Contact", kind: "text" },
    companyName: { label: "Company", kind: "enum" },
    // The contact's company sector — clickable industry values, like the
    // Accounts Industry column.
    industry: { label: "Industry", kind: "enum" },
    email: { label: "Email", kind: "text" },
    // Titles are clickable values (frequency-ordered, server-sourced) — the
    // user picks the precise roles instead of guessing a substring.
    title: { label: "Title", kind: "enum" },
    linkedin: { label: "LinkedIn", kind: "presence" },
    // Phone is filtered by country dial code (+41 / +33 / …) plus a "Sans
    // numéro" bucket — richer than has/empty, and what a romand rep needs to
    // split Swiss prospects from French noise. Server-computed (fPhoneRegion).
    phone: { label: "Phone", kind: "enum" },
    score: { label: "Score", kind: "enum" },
  };

  // Enum filter options come from the server now: company names across ALL
  // contacts (not just the loaded page, which would hide values the server can
  // still filter on), and grades are a fixed scale.
  const columnOptions = useMemo<Record<string, Array<string | { value: string; label: string }>>>(() => {
    // Phone-region options come from the server facet counts: dial codes
    // ordered by frequency, with the "Sans numéro"/"Indicatif inconnu" buckets
    // pinned last. Labels via the SSOT so "41" shows as "Suisse · +41".
    const phoneCounts = serverFilterCounts?.phone ?? {};
    const phoneRegions = Object.keys(phoneCounts)
      .sort((a, b) => {
        const sa = a === PHONE_REGION_NONE || a === PHONE_REGION_UNKNOWN ? 1 : 0;
        const sb = b === PHONE_REGION_NONE || b === PHONE_REGION_UNKNOWN ? 1 : 0;
        if (sa !== sb) return sa - sb;
        return (phoneCounts[b] ?? 0) - (phoneCounts[a] ?? 0);
      })
      .map((key) => ({ value: key, label: phoneRegionLabel(key) }));
    return {
      companyName: serverCompanyOptions,
      title: serverTitleOptions,
      industry: serverIndustryOptions.map((o) => o.industry),
      score: ["A+", "A", "B", "C", "D", "F"],
      phone: phoneRegions,
    };
  }, [serverCompanyOptions, serverTitleOptions, serverIndustryOptions, serverFilterCounts]);

  // Sections for the dedicated Filters panel — segment filters with no column
  // home. Phone reuses the column options; seniority/recency come from their
  // own server facet counts. Empty facets render "Aucune valeur".
  const filterSections = useMemo<PanelSection[]>(() => {
    const seniorityCounts = serverFilterCounts?.seniority ?? {};
    const seniorityOpts = Object.keys(seniorityCounts)
      .sort(compareSeniority)
      .map((k) => ({ value: k, label: seniorityLabel(k) }));
    const recencyCounts = serverFilterCounts?.recency ?? {};
    const recencyOpts = RECENCY_BUCKETS.filter((b) => recencyCounts[b] != null).map((b) => ({
      value: b as string,
      label: recencyLabel(b),
    }));
    const regionCounts = serverFilterCounts?.region ?? {};
    const regionOpts = Object.keys(regionCounts)
      .sort((a, b) => (regionCounts[b] ?? 0) - (regionCounts[a] ?? 0))
      .map((v) => ({ value: v, label: v }));
    const famList = familyFacet ?? [];
    const familyOpts = famList.map((f) => ({ value: f.key, label: f.label }));
    const familyCountsObj = Object.fromEntries(famList.map((f) => [f.key, f.count]));
    return [
      {
        title: "Secteur",
        filters: [
          { key: "family", label: "Famille sectorielle", options: familyOpts, counts: familyCountsObj, hint: familyLoading ? "Classement des secteurs…" : "Regroupe les industries en familles (santé, public, non-profit…)" },
        ],
      },
      {
        title: "Géographie",
        filters: [
          { key: "region", label: "Région / canton", options: regionOpts, counts: regionCounts, hint: "Romandie : Geneva, Vaud, Valais, Neuchâtel, Fribourg, Jura" },
        ],
      },
      {
        title: "Joignabilité",
        filters: [
          { key: "phone", label: "Indicatif téléphone", options: columnOptions.phone ?? [], counts: serverFilterCounts?.phone },
        ],
      },
      {
        title: "Engagement",
        filters: [
          { key: "recency", label: "Dernier contact", options: recencyOpts, counts: recencyCounts, hint: "Dernier échange réel — email, appel ou RDV" },
        ],
      },
      {
        title: "Persona",
        filters: [
          { key: "seniority", label: "Séniorité", options: seniorityOpts, counts: seniorityCounts },
        ],
      },
    ];
  }, [columnOptions, serverFilterCounts, familyFacet, familyLoading]);
  const panelActive = panelActiveCount(filterSections, columnFilters);

  // Lazy-load the sector-family facet the first time the Filtres panel opens.
  useEffect(() => {
    if (!showFilters || familyFacet !== null || familyLoading) return;
    setFamilyLoading(true);
    fetch("/api/industry-families?entity=contact")
      .then((r) => (r.ok ? r.json() : { families: [] }))
      .then((d) => setFamilyFacet(d.families ?? []))
      .catch(() => setFamilyFacet([]))
      .finally(() => setFamilyLoading(false));
  }, [showFilters, familyFacet, familyLoading]);

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

  // Header checkbox state: checked when every visible row is selected (the
  // selection may hold MORE than the visible rows after a select-all-matching),
  // indeterminate when only part of it is.
  const allVisibleSelected =
    filteredContacts.length > 0 && filteredContacts.every((c) => selectedRows.has(c.id));

  // ── CLE-08: register this page's actions for the chat live-executor. The
  //    registered actions are captured ONCE at mount (CLE-03 keys registration
  //    by the id list), so each run() reads live state via refs and calls only
  //    stable setters / useCallback helpers / the §4 extractions above. ──
  const selectedRef = useRef(selectedRows); selectedRef.current = selectedRows;
  const scoringRef = useRef(scoringAll); scoringRef.current = scoringAll;
  // Stable refs to the extracted helpers / re-created function declarations so a
  // run() never closes over a stale identity.
  const selectAllMatchingRef = useRef(selectAllMatching); selectAllMatchingRef.current = selectAllMatching;
  const bulkEnrichSelectedRef = useRef(bulkEnrichSelected); bulkEnrichSelectedRef.current = bulkEnrichSelected;
  const bulkFindMobileRef = useRef(bulkFindMobile); bulkFindMobileRef.current = bulkFindMobile;
  const bulkMergeSelectedRef = useRef(bulkMergeSelected); bulkMergeSelectedRef.current = bulkMergeSelected;
  const restoreContactsRef = useRef(restoreContacts); restoreContactsRef.current = restoreContacts;
  const scoreAllContactsRef = useRef(scoreAllContacts); scoreAllContactsRef.current = scoreAllContacts;
  const deleteSelectedContactsRef = useRef(deleteSelectedContacts); deleteSelectedContactsRef.current = deleteSelectedContacts;
  const submitCreateContactRef = useRef(submitCreateContact); submitCreateContactRef.current = submitCreateContact;

  const contactListActions: PageAction[] = useMemo(
    () => [
      // ── applyFilter (the 8 columns) ─────────────────────────────────────
      definePageAction({
        id: "contacts.applyFilter",
        title: "Filter the contacts list",
        description:
          "Apply the contacts list's column filters: contact name (text), company (names), industry, email " +
          "(text), title (one or more), LinkedIn present/absent, phone region (dial codes like +33 / +41, or none / unknown), score grade " +
          "(A+/A/B/C/D/F). Replaces the current column-filter set. Use when the user wants to narrow the list. " +
          "It runs server-side across ALL contacts, not just the loaded page.",
        params: z.object({
          contact: z.string().optional(),
          companyName: z.array(z.string()).optional(),
          industry: z.array(z.string()).optional(),
          email: z.string().optional(),
          title: z.array(z.string()).optional(),
          linkedin: z.enum(["present", "absent"]).optional(),
          phone: z.array(z.string()).optional(),
          score: z.array(z.enum(["A+", "A", "B", "C", "D", "F"])).optional(),
        }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (p): Promise<PageActionResult> => {
          const next: Record<string, ColumnFilterState> = {};
          if (p.contact) next.contact = { text: p.contact };
          if (p.email) next.email = { text: p.email };
          if (p.title?.length) next.title = { values: p.title };
          if (p.companyName?.length) next.companyName = { values: p.companyName };
          if (p.industry?.length) next.industry = { values: p.industry };
          if (p.score?.length) next.score = { values: p.score };
          if (p.linkedin) next.linkedin = { presence: p.linkedin === "present" ? "has" : "empty" };
          if (p.phone?.length) next.phone = { values: p.phone };
          setColumnFilters(next);
          return okResult("Filtered contacts by " + describeContactFilters(p) + ".");
        },
      }),
      // ── smartSearch ─────────────────────────────────────────────────────
      definePageAction({
        id: "contacts.smartSearch",
        title: "Search contacts",
        description:
          "Type into the contacts search box — a name/email match or a natural-language query " +
          "(e.g. 'CTOs at fintech'). Runs server-side across all contacts. Pass an empty query to clear it.",
        params: z.object({ query: z.string() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ query }): Promise<PageActionResult> => {
          setSearchQuery(query);
          return query.trim()
            ? okResult('Searching contacts for "' + query.trim() + '".')
            : okResult("Cleared the contact search.");
        },
      }),
      // ── selectAll ───────────────────────────────────────────────────────
      definePageAction({
        id: "contacts.selectAll",
        title: "Select all matching contacts",
        description:
          "Select every contact that matches the active filters/search (not just the loaded page), so a bulk " +
          "action can run on the whole set. Use before a bulk enrich/find-mobile/merge/delete.",
        params: z.object({ matchingCurrentFilter: z.boolean().optional() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (): Promise<PageActionResult> => {
          const resolved = await selectAllMatchingRef.current();
          const n = resolved.size;
          return okResult("Selected " + n + " matching contact" + (n === 1 ? "" : "s") + ".", { count: n });
        },
      }),
      // ── bulkEnrich (credits) ────────────────────────────────────────────
      definePageAction({
        id: "contacts.bulkEnrich",
        title: "Enrich the selected contacts",
        description:
          "Enrich every currently-selected contact (titles, seniority, LinkedIn, etc.). Uses enrichment credits. " +
          "Select contacts first (contacts.selectAll). Confirms before spending.",
        params: z.object({}),
        mutating: true, reversible: true, cost: "credits", confirm: "risky",
        run: async (): Promise<PageActionResult> => {
          const before = selectedRef.current.size;
          if (before === 0) return errResult("Select some contacts first.");
          await bulkEnrichSelectedRef.current();
          return okResult("Enriched the selected contacts (" + before + " requested) — see the rows for per-contact status.", { count: before });
        },
      }),
      // ── bulkFindMobile (credits, FullEnrich) ────────────────────────────
      definePageAction({
        id: "contacts.bulkFindMobile",
        title: "Find mobiles for the selected contacts",
        description:
          "Run the deep mobile/email enrichment (FullEnrich) on the selected contacts. Uses credits; results " +
          "arrive asynchronously as they're found. Runs 100 contacts per submission. Confirms before spending.",
        params: z.object({}),
        mutating: true, reversible: true, cost: "credits", confirm: "risky",
        run: async (): Promise<PageActionResult> => {
          const n = selectedRef.current.size;
          if (n === 0) return errResult("Select some contacts first.");
          await bulkFindMobileRef.current();
          const run = Math.min(n, 100);
          return okResult(
            "Searching mobiles for " + run + " contact" + (run === 1 ? "" : "s") +
            " — phones and emails appear as they're found." + (n > 100 ? " Run again for the remaining " + (n - 100) + "." : ""),
            { count: run },
          );
        },
      }),
      // ── bulkMerge (navigates to merge; ≥2) ──────────────────────────────
      definePageAction({
        id: "contacts.bulkMerge",
        title: "Merge the selected contacts",
        description:
          "Open the merge picker for the selected contacts (need at least 2). You pick the survivor there; " +
          "merging is destructive downstream and is confirmed on the merge page.",
        params: z.object({}),
        mutating: false, reversible: true, cost: "free", confirm: "risky",
        run: async (): Promise<PageActionResult> => {
          const n = selectedRef.current.size;
          if (n < 2) return errResult("Select at least 2 contacts to merge.");
          bulkMergeSelectedRef.current();
          return okResult("Opened the merge picker for " + n + " contacts.", { count: n });
        },
      }),
      // ── bulkDelete (destructive, always confirm) ────────────────────────
      definePageAction({
        id: "contacts.bulkDelete",
        title: "Delete the selected contacts",
        description:
          "Soft-delete the selected contacts (they move to the Archive and can be restored). Optionally cascade " +
          "to their activities, notes, and/or tasks. Always asks for confirmation first.",
        params: z.object({ cascade: z.array(z.enum(["activities", "notes", "tasks"])).optional() }),
        mutating: true, reversible: true, cost: "free", confirm: "always",
        run: async ({ cascade }): Promise<PageActionResult> => {
          if (selectedRef.current.size === 0) return errResult("Select some contacts first.");
          const r = await deleteSelectedContactsRef.current(cascade ?? []);
          return r.ok
            ? okResult("Moved " + r.deleted + " contact" + (r.deleted === 1 ? "" : "s") + " to Archive.", { deleted: r.deleted })
            : errResult(r.error ?? "Failed to delete the contacts.");
        },
      }),
      // ── bulkRestore (reversible) ────────────────────────────────────────
      definePageAction({
        id: "contacts.bulkRestore",
        title: "Restore the selected contacts",
        description: "Bring the selected soft-deleted contacts back from the Archive.",
        params: z.object({}),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async (): Promise<PageActionResult> => {
          const ids = Array.from(selectedRef.current);
          if (ids.length === 0) return errResult("Select some contacts first.");
          await restoreContactsRef.current(ids);
          return okResult("Restored " + ids.length + " contact" + (ids.length === 1 ? "" : "s") + ".", { count: ids.length });
        },
      }),
      // ── scoreAll (tenant-wide, risky) ───────────────────────────────────
      definePageAction({
        id: "contacts.scoreAll",
        title: "Score all contacts",
        description:
          "Recompute ICP fit for EVERY contact against your ICP profiles (one tenant-wide run). " +
          "Use when the user wants the whole base re-scored. Confirms first.",
        params: z.object({}),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async (): Promise<PageActionResult> => {
          if (scoringRef.current) return errResult("A scoring run is already in progress.");
          await scoreAllContactsRef.current();
          return okResult("Scored your contacts against your ICP profiles.");
        },
      }),
      // ── createContact (risky) ───────────────────────────────────────────
      definePageAction({
        id: "contacts.createContact",
        title: "Create a contact",
        description:
          "Create a new contact. Provide at least a first name or an email; optionally last name, title, " +
          "and the company to link (companyId). Use when the user wants to add a person.",
        params: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          title: z.string().optional(),
          companyId: z.string().optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async (p): Promise<PageActionResult> => {
          if (!p.firstName?.trim() && !p.email?.trim()) return errResult("First name or email required.");
          const body: Record<string, unknown> = {};
          if (p.firstName) body.firstName = p.firstName;
          if (p.lastName) body.lastName = p.lastName;
          if (p.email) body.email = p.email;
          if (p.title) body.title = p.title;
          if (p.companyId) body.companyId = p.companyId;
          const r = await submitCreateContactRef.current(body);
          const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "the contact";
          return r.ok ? okResult("Created contact " + name + ".") : errResult(r.error ?? "Failed to create contact.");
        },
      }),
      // ── openImport (HUMAN-BOUND: opens the CSV picker only) ──────────────
      definePageAction({
        id: "contacts.openImport",
        title: "Open the CSV import picker",
        description:
          "Open the CSV file picker so the user can import contacts. NOTE: you can OPEN the picker but you " +
          "CANNOT choose the file — the user must pick it in the dialog. Tell them the picker is open.",
        params: z.object({}),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (): Promise<PageActionResult> => {
          fileRef.current?.click();
          return okResult("Opened the CSV picker — choose a file to import (I can't pick the file for you).");
        },
      }),
      // ── openSmartImport (HUMAN-BOUND: opens the modal only) ──────────────
      definePageAction({
        id: "contacts.openSmartImport",
        title: "Open Smart Import",
        description:
          "Open the guided Smart Import modal so the user can map and import a CSV. You can OPEN it but the " +
          "user chooses and uploads the file. Tell them it's open.",
        params: z.object({}),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (): Promise<PageActionResult> => {
          setShowSmartImport(true);
          return okResult("Opened Smart Import — choose a CSV to map and import.");
        },
      }),
    ],
    // Stable id set; run()s read live state via refs / stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(contactListActions);

  // CLE-15 — let the chat pulse a specific contact row (e.g. one it navigates
  // to). Each <tr> carries data-cle-entity; the locator resolves an id to the
  // live row. Null-safe when the row is filtered out or not mounted.
  const surfaceContainerRef = useRef<HTMLDivElement>(null);
  const contactsLocate = useCallback<EntityLocator>(
    (a) => surfaceContainerRef.current?.querySelector<HTMLElement>(`[data-cle-entity="${cssEscape(a.entityId)}"]`) ?? null,
    [],
  );
  useRegisterEntityLocator("contacts", contactsLocate);

  return (
    <div ref={surfaceContainerRef} className="flex h-full flex-col animate-content-in">
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
                onClick: () => openBulkCascadeDelete(),
              },
            ]}
      />
      <PageHeader icon={<Users size={16} />} title="Contacts" subtitle={`${totalContacts}`}>
        {/* Enrich lives in the selection bar — it only makes sense once
            contacts are checked. Secondary controls (views, tenant-wide
            actions) group behind the same More menu as Accounts.
            "Find duplicates" is gone on purpose (founder rule
            2026-06-11): duplicates must never exist in the first place —
            dedup belongs upstream in the import/extract paths, and
            merging a checked selection stays available in the bulk bar. */}
        <MoreMenu
          label="More"
          items={[
            {
              label: "Archive",
              icon: <Archive size={13} />,
              checked: viewDeleted,
              onClick: () => { setViewDeleted((v) => !v); setSelectedRows(new Set()); },
            },
            {
              label: scoringAll ? "Scoring contacts…" : "Score all contacts",
              hint: "Recompute ICP fit for every contact",
              icon: <Gauge size={13} />,
              divider: true,
              disabled: scoringAll,
              onClick: () => { void scoreAllContacts(); },
            },
          ]}
        />
        {!viewDeleted && (
          <>
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
        {/* Leaving the Archive view stays ONE visible click — never
            buried in the menu (accounts convention). */}
        {viewDeleted && (
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw size={13} />}
            onClick={() => { setViewDeleted(false); setSelectedRows(new Set()); }}
            title="Back to the active contacts"
          >
            Back to active
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        {/* "All (N)" — Accounts-style anchor tab. N is the server total under
            the ACTIVE filters (search, column filters, smart filters), so it
            shrinks as the list narrows. Clicking it resets the list view. */}
        <button
          type="button"
          onClick={() => {
            setColumnFilters({});
            setSmartFilters([]);
            setSmartMeta(null);
            setSearchQuery("");
          }}
          className="shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
          title="Show all contacts — clears the active filters"
        >
          All ({totalContacts})
        </button>
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
          style={{
            background: panelActive > 0 ? "var(--color-accent-soft)" : "transparent",
            color: panelActive > 0 ? "var(--color-accent)" : "var(--color-text-tertiary)",
          }}
          title="Filtres avancés — joignabilité, engagement, persona"
        >
          <SlidersHorizontal size={12} />
          Filtres
          {panelActive > 0 && (
            <span className="rounded-full px-1.5 text-[10px] font-medium tabular-nums" style={{ background: "var(--color-accent)", color: "#fff" }}>
              {panelActive}
            </span>
          )}
        </button>
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
              {activeKeys.length} filtre{activeKeys.length === 1 ? "" : "s"} actif{activeKeys.length === 1 ? "" : "s"} — effacer
            </button>
          );
        })()}
        {/* One intelligent search, compact + right-aligned (parity with
            Accounts): type a name/email -> instant server search (spans all
            contacts); press Enter -> natural-language smart filters. */}
        <div className="ml-auto w-80 shrink-0">
          <SmartSearchBar
            resourceType="contact"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search contacts — or describe and press Enter (e.g. CTOs at fintech)"
            className="w-full"
            onFilters={(filters, meta) => {
              setSmartFilters(filters);
              setSmartMeta(meta);
              // smart-score filters server-side — the fetch effect restarts at page 1
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

      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
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
              description="Get your first contacts in two clicks — import a CSV you already have, or let Elevay find decision-makers at your TAM accounts."
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
          <>
          <table className="ls-table" data-selecting={selectedRows.size > 0 ? "true" : undefined}>
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    aria-label="Select all contacts"
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
                  { label: "Contact", icon: Users, field: "firstName", filterKey: "contact" },
                  { label: "Title", icon: Briefcase, field: "title", filterKey: "title" },
                  { label: "Company", icon: Briefcase, field: "companyName", filterKey: "companyName" },
                  { label: "Industry", icon: Factory, field: "companyIndustry", filterKey: "industry" },
                  { label: "Email", icon: Mail, field: "email", filterKey: "email" },
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
                          counts={serverFilterCounts?.[col.filterKey]}
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

                return (
                  <tr
                    key={contact.id}
                    data-cle-entity={contact.id}
                    data-selected={selectedRows.has(contact.id) ? "true" : undefined}
                    className="cursor-pointer"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                  >
                    {/* Selection checkbox */}
                    <td className="check" onClick={(e) => e.stopPropagation()}>
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
                        className="h-3 w-3 rounded"
                      />
                    </td>
                    {/* Contact name with avatar */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2.5">
                        <CompanyLogo domain={contact.companyDomain} name={contact.firstName || contact.email || "?"} size={24} />
                        <div className="min-w-0">
                          <button onClick={() => router.push(`/contacts/${contact.id}`)} className="truncate text-left text-[13px] font-medium transition-colors hover:underline" style={{ color: "var(--color-text-primary)" }}>
                            {name}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Title -- seniority-tier icon + hue (from Apollo enrichment) */}
                    <td>
                      {contact.title ? (
                        <TitleBadge
                          title={contact.title}
                          seniority={(contact.properties as Record<string, unknown> | null)?.seniority as string | undefined}
                          className="max-w-[180px]"
                        />
                      ) : <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>}
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
                    {/* Industry — the company's sector, same badge as Accounts */}
                    <td>
                      {contact.companyIndustry ? (
                        <IndustryBadge value={contact.companyIndustry} className="max-w-[180px]" />
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {contact.email || "—"}
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

                    {/* Actions — forced visible while enriching so the in-flight
                        spinner (the row's only live feedback) can't hide. */}
                    <td className="actions" style={enrichStatus[contact.id] === "enriching" ? { opacity: 1 } : undefined} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {enrichStatus[contact.id] === "enriching" ? (
                          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            <Loader2 size={12} className="animate-spin" /> Enriching…
                          </span>
                        ) : (!isEnriched(contact) && (
                          <Button variant="ghost" size="sm" onClick={() => enrichSingle(contact.id)} className="!px-2 !py-0.5">Enrich</Button>
                        ))}
                        <button
                          type="button"
                          aria-label={`Delete ${name}`}
                          title="Delete contact"
                          onClick={() => void openCascadeDelete([contact.id], name)}
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
          {/* Infinite scroll sentinel — the IntersectionObserver effect
              auto-loads the next page when this enters view, so the list
              grows on scroll with no click. The text doubles as a manual
              fallback (clickable) for the rare case the observer can't
              fire (e.g. the loaded rows are shorter than the viewport). */}
          {currentPage < Math.ceil(totalContacts / PAGE_SIZE) && (
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
                  onClick={loadMoreContacts}
                  className="text-[12px] transition-colors hover:underline"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Showing {contacts.length} of {totalContacts} — scroll to load more
                </button>
              )}
            </div>
          )}
          {currentPage >= Math.ceil(totalContacts / PAGE_SIZE) && contacts.length > 0 && (
            <div className="flex items-center justify-center py-3">
              <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                Showing all {contacts.length} contacts
              </span>
            </div>
          )}
          </>
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

      {showSmartImport && <SmartImport onClose={() => setShowSmartImport(false)} onComplete={() => void refetchLoadedContacts()} />}

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

      {/* Delete — single row or the checkbox selection — with optional
          cascade to related data. Soft-delete: everything moves to the
          Archive view and is restorable anytime. */}
      <CascadeDeleteModal
        open={!!cascadeTarget}
        entityKind={cascadeTarget && cascadeTarget.ids.length > 1 ? `${cascadeTarget.ids.length} contacts` : "contact"}
        entityLabel={cascadeTarget?.label ?? "This contact"}
        entityCount={cascadeTarget?.ids.length ?? 1}
        options={cascadeCounts}
        busy={cascadeBusy}
        onConfirm={performCascadeDelete}
        onCancel={() => { if (!cascadeBusy) setCascadeTarget(null); }}
      />
    </div>
  );
}
