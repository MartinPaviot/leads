"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
      <span className="inline-flex items-center gap-1 text-[10px] text-[#5a5a70]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#5a5a70]" />
        Pending
      </span>
    );
  }

  function scoreDisplay(contact: Contact) {
    if (contact.score == null) return "—";
    const s = Math.round(contact.score);
    let color = "text-[#5a5a70]";
    if (s >= 80) color = "text-emerald-400";
    else if (s >= 60) color = "text-amber-400";
    else if (s >= 40) color = "text-orange-400";
    else color = "text-red-400";

    return (
      <span className={`font-medium ${color}`} title={contact.scoreReasons?.join("; ") || ""}>
        {s}
      </span>
    );
  }

  const unenrichedCount = contacts.filter((c) => !isEnriched(c)).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
            {unenrichedCount > 0 && ` · ${unenrichedCount} unenriched`}
          </p>
        </div>
        <div className="flex gap-2">
          {unenrichedCount > 0 && (
            <button
              onClick={enrichAll}
              disabled={enrichAllRunning}
              className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm font-medium text-[#e8e8ed] hover:bg-[#1e1f2a] disabled:opacity-50"
            >
              {enrichAllRunning ? "Enriching..." : `Enrich All (${unenrichedCount})`}
            </button>
          )}
          <label className="cursor-pointer rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm text-[#8b8ba0] hover:border-[#6366f1] hover:text-[#e8e8ed]">
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
          <button className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]">
            + Create contact
          </button>
        </div>
      </div>

      {importResult && (
        <div
          className={`mt-4 rounded-lg px-4 py-2 text-sm ${
            importResult.startsWith("Error")
              ? "bg-red-500/10 text-red-400"
              : "bg-green-500/10 text-green-400"
          }`}
        >
          {importResult}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[#1e1f2a]" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[#8b8ba0]">No contacts</p>
            <p className="mt-1 text-sm text-[#5a5a70]">
              Import a CSV or create contacts to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#1e1f2a] text-[11px] uppercase tracking-wider text-[#5a5a70]">
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Title</th>
                  <th className="pb-2 pr-4">Phone</th>
                  <th className="pb-2 pr-4">Score</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="cursor-pointer border-b border-[#1e1f2a] hover:bg-[#12131a]"
                    onClick={() => window.location.href = `/contacts/${contact.id}`}
                  >
                    <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                      {enrichmentIndicator(contact)}
                    </td>
                    <td className="py-3 pr-4 font-medium text-[#e8e8ed]">
                      {[contact.firstName, contact.lastName]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#8b8ba0]">
                      {contact.email || "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#8b8ba0]">
                      {contact.title || "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#8b8ba0]">
                      {contact.phone || "—"}
                    </td>
                    <td className="py-3 pr-4">
                      {scoreDisplay(contact)}
                    </td>
                    <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                      {!isEnriched(contact) && enrichStatus[contact.id] !== "enriching" && (
                        <button
                          onClick={() => enrichSingle(contact.id)}
                          className="rounded px-2 py-1 text-xs text-[#6366f1] hover:bg-[#6366f1]/10"
                        >
                          Enrich
                        </button>
                      )}
                      {enrichStatus[contact.id] === "enriching" && (
                        <span className="text-xs text-amber-400">...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
