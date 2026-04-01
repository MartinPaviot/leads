"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Search, Plus, Zap, X } from "lucide-react";

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

function badgeColorIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash) % 10;
}

const badgeColors = [
  { bg: "rgba(59,130,246,0.10)", text: "#3b82f6" },
  { bg: "rgba(34,197,94,0.10)", text: "#22c55e" },
  { bg: "rgba(168,85,247,0.10)", text: "#a855f7" },
  { bg: "rgba(249,115,22,0.10)", text: "#f97316" },
  { bg: "rgba(6,182,212,0.10)", text: "#06b6d4" },
  { bg: "rgba(239,68,68,0.10)", text: "#ef4444" },
  { bg: "rgba(132,204,22,0.10)", text: "#84cc16" },
  { bg: "rgba(99,102,241,0.10)", text: "#6366f1" },
  { bg: "rgba(236,72,153,0.10)", text: "#ec4899" },
  { bg: "rgba(245,158,11,0.10)", text: "#f59e0b" },
];

function letterGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function heatColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({});
  const [enrichAllRunning, setEnrichAllRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Enriching...
        </span>
      );
    }
    if (status === "failed") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
          Failed
        </span>
      );
    }
    if (isEnriched(contact)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Enriched
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-text-tertiary)" }}
        />
        Pending
      </span>
    );
  }

  function scoreDisplay(contact: Contact) {
    if (contact.score == null) return <span style={{ color: "var(--color-text-tertiary)" }}>--</span>;
    const s = Math.round(contact.score);
    const color = heatColor(s);
    const grade = letterGrade(s);

    return (
      <span
        className="inline-flex items-center gap-1.5 font-medium"
        title={contact.scoreReasons?.join("; ") || ""}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color }}
        />
        <span style={{ color }}>{grade}</span>
        <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
          {s}
        </span>
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
                {["Status", "Name", "Email", "Title", "Phone", "Score", "Actions"].map(
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
                const titleColor = titleIdx >= 0 ? badgeColors[titleIdx] : null;

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
                        <span className="text-[11px] text-amber-400">...</span>
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
