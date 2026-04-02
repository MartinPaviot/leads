"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Search, Plus, Zap, X } from "lucide-react";
import { badgeColorIndex, BADGE_COLORS, formatScore, ENRICHMENT_COLORS } from "@/lib/ui-utils";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { getCustomFieldValue, formatFieldValue } from "@/lib/custom-fields";

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
      {/* ── Page header bar (44px) ── */}
      <div
        className="flex shrink-0 items-center justify-between px-5"
        style={{
          height: "var(--header-height)",
          background: "var(--color-bg-surface)",
          borderBottom: "0.5px solid var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-3">
          <Users size={16} style={{ color: "var(--color-text-tertiary)" }} />
          <h1
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Contacts
          </h1>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: "var(--color-bg-muted)",
              color: "var(--color-text-secondary)",
            }}
          >
            {contacts.length}
          </span>
          {unenrichedCount > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: "var(--color-warning-soft)",
                color: "var(--color-warning)",
              }}
            >
              {unenrichedCount} unenriched
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unenrichedCount > 0 && (
            <button
              onClick={enrichAll}
              disabled={enrichAllRunning}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-accent-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-accent-soft)";
              }}
            >
              <Zap size={12} />
              {enrichAllRunning ? "Enriching..." : `Enrich All (${unenrichedCount})`}
            </button>
          )}
          <label
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              border: "0.5px solid var(--color-border-default)",
              color: "var(--color-text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-default)";
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
          >
            {importing ? "Importing..." : "Import CSV"}
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              className="hidden"
              disabled={importing}
            />
          </label>
          <button
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
            style={{
              background: "var(--color-accent)",
              boxShadow: "var(--shadow-button)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--color-accent)";
            }}
          >
            <Plus size={12} />
            Create contact
          </button>
        </div>
      </div>

      {/* ── Filter bar (40px) ── */}
      <div
        className="flex shrink-0 items-center gap-3 px-5"
        style={{
          height: "var(--filter-bar-height)",
          background: "var(--color-bg-surface)",
          borderBottom: "0.5px solid var(--color-border-default)",
        }}
      >
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md py-1.5 pl-8 pr-8 text-xs outline-none"
            style={{
              background: "var(--color-bg-muted)",
              color: "var(--color-text-primary)",
              border: "0.5px solid var(--color-border-default)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-default)";
            }}
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
      </div>

      {/* ── Import result banner ── */}
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

      {/* ── Table area ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-0 px-5 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="skeleton rounded"
                style={{ height: "var(--table-row-height)" }}
              />
            ))}
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Users size={32} style={{ color: "var(--color-text-muted)" }} />
            <p
              className="mt-3 text-sm font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {contacts.length === 0 ? "No contacts" : "No matching contacts"}
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {contacts.length === 0
                ? "Import a CSV or create contacts to get started."
                : "Try adjusting your search query."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead
              className="sticky top-0 z-10"
              style={{ background: "var(--color-bg-surface)" }}
            >
              <tr>
                {["Status", "Name", "Email", "Title", "Phone", "Score",
                  ...customFields.map((f) => f.name),
                  "Actions"].map(
                  (header) => (
                    <th
                      key={header}
                      className="px-5 font-medium uppercase tracking-wider"
                      style={{
                        height: "var(--table-row-height)",
                        fontSize: "11px",
                        color: "var(--color-text-tertiary)",
                        borderBottom: "0.5px solid var(--color-border-default)",
                      }}
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => {
                const titleIdx = contact.title ? badgeColorIndex(contact.title) : -1;
                const titleColor = titleIdx >= 0 ? BADGE_COLORS[titleIdx] : null;

                return (
                  <tr
                    key={contact.id}
                    className="cursor-pointer transition-colors"
                    style={{
                      height: "var(--table-row-height)",
                      borderBottom: "0.5px solid var(--color-border-default)",
                    }}
                    onClick={() => (window.location.href = `/contacts/${contact.id}`)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--color-bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td className="px-5" onClick={(e) => e.stopPropagation()}>
                      {enrichmentIndicator(contact)}
                    </td>
                    <td
                      className="px-5 font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                        "\u2014"}
                    </td>
                    <td className="px-5" style={{ color: "var(--color-text-secondary)" }}>
                      {contact.email || "\u2014"}
                    </td>
                    <td className="px-5">
                      {contact.title ? (
                        <span
                          className="inline-block max-w-[180px] truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background: titleColor?.bg,
                            color: titleColor?.text,
                          }}
                        >
                          {contact.title}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-text-tertiary)" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-5" style={{ color: "var(--color-text-secondary)" }}>
                      {contact.phone || "\u2014"}
                    </td>
                    <td className="px-5">{scoreDisplay(contact)}</td>
                    {/* Custom fields from data model */}
                    {customFields.map((field) => {
                      const value = getCustomFieldValue(contact.properties, field.id);
                      return (
                        <td key={field.id} className="px-5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                          {value != null && value !== ""
                            ? formatFieldValue(value, field.type)
                            : "—"}
                        </td>
                      );
                    })}
                    <td className="px-5" onClick={(e) => e.stopPropagation()}>
                      {!isEnriched(contact) &&
                        enrichStatus[contact.id] !== "enriching" && (
                          <button
                            onClick={() => enrichSingle(contact.id)}
                            className="rounded px-2 py-1 text-[11px] font-medium transition-colors"
                            style={{
                              color: "var(--color-accent)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--color-accent-soft)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            Enrich
                          </button>
                        )}
                      {enrichStatus[contact.id] === "enriching" && (
                        <span className="text-[11px]" style={{ color: ENRICHMENT_COLORS.enriching }}>...</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
