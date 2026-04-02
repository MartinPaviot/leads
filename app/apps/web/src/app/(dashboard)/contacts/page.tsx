"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Search, Plus, Zap, X } from "lucide-react";
import { formatScore, ENRICHMENT_COLORS } from "@/lib/ui-utils";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/custom-fields";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, PropertyBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  companyId: string | null;
  score: number | null;
  scoreReasons: string[] | null;
  properties: Record<string, unknown> | null;
}

type EnrichStatus = "idle" | "enriching" | "done" | "failed";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({});
  const [enrichAllRunning, setEnrichAllRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { fields: customFields } = useCustomFields("contact");

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts");
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch {
      console.error("Failed to fetch contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setImportResult(
          `Imported ${data.created} contacts, ${data.companiesCreated} companies. ${data.skipped} skipped.`
        );
        fetchContacts();
      } else {
        setImportResult(`Error: ${data.error}`);
      }
    } catch {
      setImportResult("Import failed — network error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function isEnriched(contact: Contact): boolean {
    const props = contact.properties;
    return !!(contact.title && (contact.linkedinUrl || (props as Record<string, unknown>)?.seniority));
  }

  async function enrichSingle(id: string) {
    setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    try {
      const res = await fetch("/api/enrich-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [id] }),
      });
      if (res.ok) {
        setEnrichStatus((prev) => ({ ...prev, [id]: "done" }));
        await fetchContacts();
      } else {
        setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
      }
    } catch {
      setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
    }
  }

  async function enrichAll() {
    const unenriched = contacts.filter((c) => !isEnriched(c));
    if (unenriched.length === 0) return;

    setEnrichAllRunning(true);
    const ids = unenriched.map((c) => c.id);
    for (const id of ids) {
      setEnrichStatus((prev) => ({ ...prev, [id]: "enriching" }));
    }

    try {
      const res = await fetch("/api/enrich-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids }),
      });
      if (res.ok) {
        for (const id of ids) {
          setEnrichStatus((prev) => ({ ...prev, [id]: "done" }));
        }
        await fetchContacts();
      } else {
        for (const id of ids) {
          setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
        }
      }
    } catch {
      for (const id of ids) {
        setEnrichStatus((prev) => ({ ...prev, [id]: "failed" }));
      }
    } finally {
      setEnrichAllRunning(false);
    }
  }

  function enrichmentIndicator(contact: Contact) {
    const status = enrichStatus[contact.id];
    if (status === "enriching") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: ENRICHMENT_COLORS.enriching }}>
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: ENRICHMENT_COLORS.enriching }} />
          Enriching...
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: ENRICHMENT_COLORS.failed }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ENRICHMENT_COLORS.failed }} />
          Failed
        </span>
      );
    }
    if (isEnriched(contact)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: ENRICHMENT_COLORS.done }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ENRICHMENT_COLORS.done }} />
          Enriched
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: ENRICHMENT_COLORS.pending }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ENRICHMENT_COLORS.pending }} />
        Pending
      </span>
    );
  }

  function scoreDisplay(contact: Contact) {
    const scoreInfo = formatScore(contact.score);
    if (!scoreInfo) return <span style={{ color: "var(--color-text-tertiary)" }}>--</span>;

    return (
      <span
        className="inline-flex items-center gap-1.5 font-medium"
        title={contact.scoreReasons?.join("; ") || ""}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: scoreInfo.color }} />
        <span style={{ color: scoreInfo.color }}>{scoreInfo.grade}</span>
        {scoreInfo.icon && <span className="text-[10px]">{scoreInfo.icon}</span>}
        <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{scoreInfo.heat}</span>
      </span>
    );
  }

  const unenrichedCount = contacts.filter((c) => !isEnriched(c)).length;

  const filteredContacts = searchQuery.trim()
    ? contacts.filter((c) => {
        const q = searchQuery.toLowerCase();
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
        return (
          name.includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false) ||
          (c.title?.toLowerCase().includes(q) ?? false)
        );
      })
    : contacts;

  return (
    <div className="flex h-full flex-col">
      {/* -- Page header bar -- */}
      <PageHeader
        icon={<Users size={16} />}
        title="Contacts"
        subtitle={`${contacts.length}`}
      >
        {unenrichedCount > 0 && (
          <Badge variant="warning">{unenrichedCount} unenriched</Badge>
        )}
        {unenrichedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            icon={<Zap size={12} />}
            onClick={enrichAll}
            disabled={enrichAllRunning}
            loading={enrichAllRunning}
          >
            {enrichAllRunning ? "Enriching..." : `Enrich All (${unenrichedCount})`}
          </Button>
        )}
        <label className="cursor-pointer">
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            loading={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? "Importing..." : "Import CSV"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
            disabled={importing}
          />
        </label>
        <Button
          variant="gradient"
          size="sm"
          icon={<Plus size={12} />}
        >
          Create contact
        </Button>
      </PageHeader>

      {/* -- Filter bar -- */}
      <FilterBar>
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8"
            style={{ height: 30, fontSize: 12 }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </FilterBar>

      {/* -- Import result banner -- */}
      {importResult && (
        <div
          className="mx-5 mt-2 flex items-center justify-between rounded-md px-3 py-2 text-xs"
          style={{
            background: importResult.startsWith("Error")
              ? "var(--color-error-soft)"
              : "var(--color-success-soft)",
            color: importResult.startsWith("Error")
              ? "var(--color-error)"
              : "var(--color-success)",
          }}
        >
          <span>{importResult}</span>
          <button onClick={() => setImportResult(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* -- Table area -- */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton
            rows={5}
            cols={6 + customFields.length}
          />
        ) : filteredContacts.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={contacts.length === 0 ? "No contacts" : "No matching contacts"}
            description={
              contacts.length === 0
                ? "Import a CSV or create contacts to get started."
                : "Try adjusting your search query."
            }
          />
        ) : (
          <table className="ls-table">
            <thead>
              <tr>
                {["Status", "Name", "Email", "Title", "Phone", "Score",
                  ...customFields.map((f) => f.name),
                  "Actions"].map(
                  (header) => (
                    <th key={header}>
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="cursor-pointer"
                  onClick={() => (window.location.href = `/contacts/${contact.id}`)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    {enrichmentIndicator(contact)}
                  </td>
                  <td
                    className="font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                      "\u2014"}
                  </td>
                  <td style={{ color: "var(--color-text-secondary)" }}>
                    {contact.email || "\u2014"}
                  </td>
                  <td>
                    {contact.title ? (
                      <PropertyBadge value={contact.title} className="max-w-[180px] truncate" />
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>{"\u2014"}</span>
                    )}
                  </td>
                  <td style={{ color: "var(--color-text-secondary)" }}>
                    {contact.phone || "\u2014"}
                  </td>
                  <td>{scoreDisplay(contact)}</td>
                  {/* Custom fields from data model */}
                  {customFields.map((field) => {
                    const value = getCustomFieldValue(contact.properties, field.id);
                    return (
                      <td key={field.id} style={{ color: "var(--color-text-secondary)" }}>
                        {value != null && value !== ""
                          ? formatFieldValue(value, field.type)
                          : "\u2014"}
                      </td>
                    );
                  })}
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    {!isEnriched(contact) &&
                      enrichStatus[contact.id] !== "enriching" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => enrichSingle(contact.id)}
                        >
                          Enrich
                        </Button>
                      )}
                    {enrichStatus[contact.id] === "enriching" && (
                      <span className="text-[11px]" style={{ color: ENRICHMENT_COLORS.enriching }}>...</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
