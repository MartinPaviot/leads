"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Check, X, Pencil } from "lucide-react";
import { ScopedChat } from "@/components/scoped-chat";
import { EmailComposer } from "@/components/email-composer";
import { Card, CardBody } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useToast } from "@/components/ui/toast";

interface Company {
  id: string;
  name: string;
  domain: string | null;
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
  properties: Record<string, unknown>;
}

interface Activity {
  id: string;
  activityType: string;
  channel: string;
  direction: string;
  summary: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export default function ContactDetailPage() {
  const params = useParams();
  const contactId = params.id as string;
  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [companies, setCompanies] = useState<Map<string, Company>>(new Map());
  const [loading, setLoading] = useState(true);
  const [emailComposer, setEmailComposer] = useState<{ to: string; subject: string; body: string } | null>(null);
  const { toast } = useToast();

  // K8 — PATCH a single field on the contact. Optimistic update with
  // rollback on failure. Re-uses the existing PUT handler which only
  // applies the fields that are explicitly provided, so sending
  // `{ title: "CEO" }` never clobbers email/phone/etc. Email gets
  // lightweight format validation (same shape as HTML type="email")
  // — we pop a toast rather than hitting the server with garbage.
  async function updateField(
    field: "title" | "email" | "phone",
    next: string
  ): Promise<boolean> {
    if (!contact) return false;
    const trimmed = next.trim();
    const nullable = trimmed === "" ? null : trimmed;
    if ((contact[field] ?? "") === (nullable ?? "")) return true;
    if (field === "email" && nullable && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nullable)) {
      toast("That doesn't look like a valid email address.", "error");
      return false;
    }
    const prev = contact;
    setContact({ ...contact, [field]: nullable });
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: nullable }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { contact: Contact };
      setContact(data.contact);
      toast("Saved.", "success");
      return true;
    } catch (err) {
      setContact(prev);
      toast("Couldn't save that change. Please try again.", "error");
      console.warn("contact-detail: updateField failed", { field, err });
      return false;
    }
  }

  useEffect(() => {
    async function load() {
      try {
        // Fetch contact
        const contactRes = await fetch(`/api/contacts/${contactId}`);
        let contactData: Contact | null = null;
        if (contactRes.ok) {
          const data = await contactRes.json();
          contactData = data.contact;
          setContact(contactData);
        }

        // Fetch activities
        const actRes = await fetch(
          `/api/activities?entityType=contact&entityId=${contactId}`
        );
        if (actRes.ok) {
          const data = await actRes.json();
          setActivities(data.activities || []);
        }

        // Fetch company names for all associated companies
        if (contactData) {
          const allCompanyIds: string[] = [];
          if (contactData.companyId) allCompanyIds.push(contactData.companyId);
          const additionalIds = (contactData.properties?.additionalCompanyIds || []) as string[];
          allCompanyIds.push(...additionalIds.filter((id) => id && !allCompanyIds.includes(id)));

          if (allCompanyIds.length > 0) {
            const companyMap = new Map<string, Company>();
            await Promise.all(
              allCompanyIds.map(async (cId) => {
                try {
                  const res = await fetch(`/api/accounts/${cId}`);
                  if (res.ok) {
                    const data = await res.json();
                    const co = data.company || data.account;
                    if (co) companyMap.set(cId, co);
                  }
                } catch {
                  // skip
                }
              })
            );
            setCompanies(companyMap);
          }
        }
      } catch (err) {
        console.error("Failed to load contact:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [contactId]);

  if (loading) return <p className="p-6 text-sm text-[var(--color-text-tertiary)]">Loading...</p>;
  if (!contact) return <p className="p-6 text-sm text-red-400">Contact not found</p>;

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
  const initials = (contact.firstName?.charAt(0) || "?").toUpperCase() +
    (contact.lastName?.charAt(0) || "").toUpperCase();

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <Breadcrumbs
          items={[
            { label: "Contacts", href: "/contacts" },
            { label: name },
          ]}
        />

        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-lg font-bold text-white">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{name}</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {contact.title || "No title"} {contact.email ? `\u00b7 ${contact.email}` : ""}
              {(() => {
                const extras = (contact.properties?.additionalEmails || []) as string[];
                return extras.length > 0
                  ? ` (+${extras.length} more)`
                  : "";
              })()}
            </p>
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Activity
          </h2>
          {activities.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
              No activity recorded for this contact.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {activities.map((activity) => (
                <Card key={activity.id}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            activity.direction === "inbound"
                              ? "bg-green-500"
                              : "bg-blue-500"
                          }`}
                        />
                        <span className="text-xs font-medium uppercase text-[var(--color-text-secondary)]">
                          {activity.activityType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {new Date(activity.occurredAt).toLocaleDateString()}
                      </span>
                    </div>
                    {activity.summary && (
                      <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                        {activity.summary}
                      </p>
                    )}
                    {/* G12: Suggested Reply for inbound emails */}
                    {activity.direction === "inbound" && activity.activityType.includes("email") && (
                      <button
                        onClick={() => setEmailComposer({
                          to: contact?.email || "",
                          subject: `Re: ${activity.summary?.slice(0, 50) || "your email"}`,
                          body: `Hi ${contact?.firstName || "there"},\n\nThanks for your email. ${activity.summary ? `Regarding "${activity.summary.slice(0, 80)}..." — ` : ""}\n\nBest regards`,
                        })}
                        className="mt-2 text-[10px] text-[var(--color-accent)] hover:underline"
                      >
                        Suggest reply
                      </button>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Scoped chat */}
        <div className="mt-8">
          <ScopedChat
            contextType="contact"
            contextId={contactId}
            contextLabel={name}
          />
        </div>
      </div>

      {/* Right panel — details */}
      <div className="w-full shrink-0 border-t p-6 lg:w-[300px] lg:border-t-0 lg:border-l" style={{ borderColor: "var(--color-border-default)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Contact details
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Name</p>
            <p className="text-sm text-[var(--color-text-primary)]">{name}</p>
          </div>
          <InlineField
            label="Title"
            value={contact.title}
            placeholder="e.g. Head of Growth"
            onSave={(v) => updateField("title", v)}
          />
          <div>
            <InlineField
              label="Email"
              value={contact.email}
              type="email"
              placeholder="name@company.com"
              onSave={(v) => updateField("email", v)}
            />
            {(() => {
              const extras = (contact.properties?.additionalEmails || []) as string[];
              return extras.length > 0 ? (
                <div className="mt-1 space-y-0.5">
                  {extras.map((ae) => (
                    <p key={ae} className="text-xs text-[var(--color-text-secondary)]">{ae}</p>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
          <InlineField
            label="Phone"
            value={contact.phone}
            type="tel"
            placeholder="+1 555 0100"
            onSave={(v) => updateField("phone", v)}
          />
          {contact.linkedinUrl && (
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)]">LinkedIn</p>
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noopener"
                className="text-sm text-[var(--color-accent)] hover:underline"
              >
                {contact.linkedinUrl}
              </a>
            </div>
          )}
          {/* Associated companies */}
          {(() => {
            const allCompanyIds: string[] = [];
            if (contact.companyId) allCompanyIds.push(contact.companyId);
            const additionalIds = (contact.properties?.additionalCompanyIds || []) as string[];
            for (const cid of additionalIds) {
              if (cid && !allCompanyIds.includes(cid)) allCompanyIds.push(cid);
            }
            if (allCompanyIds.length === 0) return null;
            return (
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {allCompanyIds.length === 1 ? "Company" : "Companies"}
                </p>
                <div className="mt-0.5 space-y-1">
                  {allCompanyIds.map((cid, idx) => {
                    const co = companies.get(cid);
                    const isPrimary = idx === 0 && cid === contact.companyId;
                    return (
                      <div key={cid} className="flex items-center gap-1.5">
                        <Link
                          href={`/accounts/${cid}`}
                          className="text-sm text-[var(--color-accent)] hover:underline"
                        >
                          {co?.name || cid.slice(0, 8) + "..."}
                        </Link>
                        {isPrimary && allCompanyIds.length > 1 && (
                          <span className="rounded bg-[var(--color-bg-tertiary)] px-1 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                            primary
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {emailComposer && (
        <EmailComposer
          to={emailComposer.to}
          subject={emailComposer.subject}
          body={emailComposer.body}
          onClose={() => setEmailComposer(null)}
        />
      )}
    </div>
  );
}

/**
 * K8 — single inline-editable field for contact detail. Click the value
 * (or the hover pencil) to enter edit mode, Enter / blur saves, Escape
 * cancels. Empty input clears the field (nullable). The `onSave` callback
 * is expected to be optimistic-update + rollback-on-failure — we just
 * defer the edit-mode close until it resolves so the row doesn't flicker.
 */
function InlineField({
  label,
  value,
  placeholder,
  type = "text",
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  type?: "text" | "email" | "tel";
  onSave: (next: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    if (saving) return;
    if ((draft.trim() || null) === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setEditing(false);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  return (
    <div>
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
      {editing ? (
        <div className="mt-1 flex items-center gap-2">
          <input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            onBlur={() => {
              // Click on Save/Cancel should win the race with blur —
              // a tiny delay lets the onMouseDown on those buttons
              // fire first. Setting `tabIndex={-1}` on Save/Cancel
              // (below) would also work, but this keeps them keyboard
              // reachable via Tab.
              setTimeout(() => {
                if (editing) void commit();
              }, 120);
            }}
            placeholder={placeholder}
            disabled={saving}
            className="flex-1 rounded-md px-2 py-1 text-sm outline-none"
            style={{
              background: "var(--color-bg-page)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
            aria-label={`Edit ${label.toLowerCase()}`}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            disabled={saving}
            aria-label="Save"
            className="rounded p-1 hover:opacity-70 disabled:opacity-40"
            style={{ color: "var(--color-success, #059669)" }}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancel}
            disabled={saving}
            aria-label="Cancel"
            className="rounded p-1 hover:opacity-70 disabled:opacity-40"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(value ?? "");
            setEditing(true);
          }}
          className="mt-0.5 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-[var(--color-bg-hover)]"
          style={{ color: "var(--color-text-primary)" }}
          title={`Click to edit ${label.toLowerCase()}`}
        >
          <span className={value ? "" : "opacity-60"}>
            {value || placeholder || "\u2014"}
          </span>
          <Pencil size={11} className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
