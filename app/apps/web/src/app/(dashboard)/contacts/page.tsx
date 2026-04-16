"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Search, Plus, Zap, X, Upload, Mail, Briefcase, Phone, Gauge, ExternalLink, Clock, ChevronDown, ChevronUp, History, GitMerge, type LucideIcon } from "lucide-react";
import { SmartImport } from "@/components/smart-import";
import { CompanyLogo } from "@/components/ui/company-logo";
import { formatScore, ENRICHMENT_COLORS } from "@/lib/ui-utils";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, PropertyBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { useToast } from "@/components/ui/toast";
import { SmartSearchBar, ActiveFiltersChips } from "@/components/ui/smart-search-bar";
import { applyFilters } from "@/lib/filters";
import type { FilterCondition } from "@/lib/filters";

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
  const [enrichAllRunning, setEnrichAllRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const { fields: customFields } = useCustomFields("contact");

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/contacts?page=${page}&pageSize=${pageSize}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        setTotalContacts(data.pagination?.total ?? data.contacts?.length ?? 0);
      }
    } catch (e) {
      console.warn("contacts: list fetch failed", e);
    } finally { setLoading(false); }
  }, [page]);

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

  async function enrichAll() {
    const unenriched = contacts.filter((c) => !isEnriched(c));
    if (unenriched.length === 0) return;
    setEnrichAllRunning(true);
    const ids = unenriched.map((c) => c.id);
    for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    try {
      const res = await fetch("/api/enrich-contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactIds: ids }) });
      for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: res.ok ? "done" : "failed" }));
      if (res.ok) await fetchContacts();
    } catch { for (const id of ids) setEnrichStatus((prev) => ({ ...prev, [id]: "failed" })); }
    finally { setEnrichAllRunning(false); }
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

  // Bulk delete
  async function bulkDeleteSelected() {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
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
    if (deleted > 0) {
      toast(`Deleted ${deleted} contact${deleted > 1 ? "s" : ""}${errors > 0 ? ` (${errors} failed)` : ""}`, deleted > 0 ? "success" : "error");
      fetchContacts();
    } else {
      toast(`Delete failed for ${errors} contact${errors > 1 ? "s" : ""}`, "error");
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

  const unenrichedCount = contacts.filter((c) => !isEnriched(c)).length;

  const smartFilteredContacts = smartFilters.length > 0
    ? applyFilters(contacts, smartFilters)
    : contacts;

  const textFiltered = searchQuery.trim()
    ? smartFilteredContacts.filter((c) => {
        const q = searchQuery.toLowerCase();
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
        return name.includes(q) || (c.email?.toLowerCase().includes(q) ?? false) || (c.title?.toLowerCase().includes(q) ?? false) || (c.companyName?.toLowerCase().includes(q) ?? false);
      })
    : smartFilteredContacts;

  // Sort
  const filteredContacts = [...textFiltered].sort((a, b) => {
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
    <div className="flex h-full flex-col">
      <BulkActionsBar
        count={selectedRows.size}
        onClear={() => setSelectedRows(new Set())}
        actions={[
          { label: "Enrich", icon: <Zap size={13} />, onClick: bulkEnrichSelected },
          {
            label: "Merge",
            icon: <GitMerge size={13} />,
            onClick: bulkMergeSelected,
            disabled: selectedRows.size < 2,
          },
          {
            label: "Delete",
            icon: <X size={13} />,
            onClick: bulkDeleteSelected,
          },
        ]}
      />
      <PageHeader icon={<Users size={16} />} title="Contacts" subtitle={`${contacts.length}`}>
        {unenrichedCount > 0 && (
          <Button variant="outline" size="sm" icon={<Zap size={12} />} onClick={enrichAll} disabled={enrichAllRunning} loading={enrichAllRunning}>
            {enrichAllRunning ? "Enriching..." : `Enrich All (${unenrichedCount})`}
          </Button>
        )}
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
      </PageHeader>

      <FilterBar>
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-tertiary)" }} />
          <Input type="text" placeholder="Search contacts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-8" style={{ height: 30, fontSize: 12 }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-tertiary)" }}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="w-64">
          <SmartSearchBar
            resourceType="contact"
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
        <div className="mx-5 mt-2 flex items-center justify-between rounded-md px-3 py-2 text-xs"
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
             nothing" case keeps the simpler search-clear CTA. */
          contacts.length === 0 ? (
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
                  { label: "Contact", icon: Users, field: "firstName" },
                  { label: "Company", icon: Briefcase, field: "companyName" },
                  { label: "Email", icon: Mail, field: "email" },
                  { label: "Title", icon: Briefcase, field: "title" },
                  { label: "LinkedIn", icon: null as LucideIcon | null, field: null },
                  { label: "Phone", icon: Phone, field: null },
                  { label: "Score", icon: Gauge, field: "score" },
                  { label: "Last Interaction", icon: Clock, field: null },
                  ...customFields.map((f) => ({ label: f.name, icon: null as LucideIcon | null, field: null })),
                  { label: "", icon: null, field: null },
                ] as Array<{ label: string; icon: LucideIcon | null; field: string | null }>).map((col, i) => (
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
                    </span>
                  </th>
                ))}
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
                        const scoreInfo = formatScore(contact.score);
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
                      {!isEnriched(contact) && enrichStatus[contact.id] !== "enriching" && (
                        <Button variant="ghost" size="sm" onClick={() => enrichSingle(contact.id)} className="!px-2 !py-0.5">Enrich</Button>
                      )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="w-full max-w-md rounded-xl p-6 shadow-xl" style={{ background: "var(--color-bg-card)" }}>
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
    </div>
  );
}
