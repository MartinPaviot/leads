"use client";

import { useState, useEffect, useRef } from "react";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  phone: string | null;
  companyId: string | null;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchContacts();
  }, []);

  async function fetchContacts() {
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
  }

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
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
          <p className="text-sm text-[#5a5a70]">Loading...</p>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[#8b8ba0]">No contacts</p>
            <p className="mt-1 text-sm text-[#5a5a70]">
              Import a CSV or create contacts to get started.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#1e1f2a] text-[11px] uppercase tracking-wider text-[#5a5a70]">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Title</th>
                <th className="pb-2 pr-4">Phone</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="cursor-pointer border-b border-[#1e1f2a] hover:bg-[#12131a]"
                  onClick={() => window.location.href = `/contacts/${contact.id}`}
                >
                  <td className="py-3 pr-4 text-[#e8e8ed]">
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
