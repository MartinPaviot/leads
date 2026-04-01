"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ScopedChat } from "@/components/scoped-chat";
import { EmailComposer } from "@/components/email-composer";

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
  const [loading, setLoading] = useState(true);
  const [emailComposer, setEmailComposer] = useState<{ to: string; subject: string; body: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Fetch contact
        const contactRes = await fetch(`/api/contacts/${contactId}`);
        if (contactRes.ok) {
          const data = await contactRes.json();
          setContact(data.contact);
        }

        // Fetch activities
        const actRes = await fetch(
          `/api/activities?entityType=contact&entityId=${contactId}`
        );
        if (actRes.ok) {
          const data = await actRes.json();
          setActivities(data.activities || []);
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
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-lg font-bold text-white">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{name}</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {contact.title || "No title"} {contact.email ? `· ${contact.email}` : ""}
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
                <div
                  key={activity.id}
                  className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-3"
                >
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
                      ✉️ Suggest reply
                    </button>
                  )}
                </div>
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
      <div className="w-[300px] border-l border-[rgba(255,255,255,0.08)] p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Contact details
        </h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Name</p>
            <p className="text-sm text-[var(--color-text-primary)]">{name}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Title</p>
            <p className="text-sm text-[var(--color-text-primary)]">{contact.title || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Email</p>
            <p className="text-sm text-[var(--color-text-primary)]">{contact.email || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Phone</p>
            <p className="text-sm text-[var(--color-text-primary)]">{contact.phone || "—"}</p>
          </div>
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
