"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { Check, X, Pencil, TrendingUp, TrendingDown, Minus, Gauge, Mail, Send, Phone } from "lucide-react";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions, useRegisterEntityLocator, cssEscape } from "@/lib/chat/page-actions/registry";
import type { EntityLocator } from "@/lib/chat/page-actions/registry";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ContactCalls } from "./_calls";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { OwnerSelect } from "@/components/owner-select";
import { useToast } from "@/components/ui/toast";
import { ContactCallProfile } from "@/components/call-intel";

interface BuyerIntentSignal {
  type: string;
  value: number;
  weight: number;
  evidence: string;
}

interface BuyerIntentScore {
  contactId: string;
  score: number;
  signals: BuyerIntentSignal[];
  trend: "heating" | "stable" | "cooling";
  lastUpdated: string;
}

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
  ownerId: string | null;
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
  /** Member who performed the action (user activities only); null otherwise. */
  actorName?: string | null;
}

/* ── CLE-08: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/** Pure predicate: is a post-call qualification proposal pending on this contact?
 *  Mirrors the `pending` signal ContactCallProfile/usePendingReview reads
 *  (`properties.pendingCallProfile`, call-intel.tsx). Lets the call-intel actions
 *  fail cleanly (E-11) instead of POSTing a no-op review. */
function hasPendingCallProfile(contact: { properties: Record<string, unknown> } | null): boolean {
  const pending = contact?.properties?.pendingCallProfile;
  return pending != null && typeof pending === "object";
}

export default function ContactDetailPage() {
  const params = useParams();
  const contactId = params.id as string;
  const router = useRouter();
  const [dialing, setDialing] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [companies, setCompanies] = useState<Map<string, Company>>(new Map());
  const [loading, setLoading] = useState(true);
  const [emailComposer, setEmailComposer] = useState<EmailComposerDraft | null>(null);
  const [buyerIntent, setBuyerIntent] = useState<BuyerIntentScore | null>(null);
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

  // CLE-08 §4: the POST /api/calls/start + server error-code mapping of startCall,
  // extracted so both the human "Call" button and contacts.call issue the SAME
  // request and surface the SAME messages. Returns { ok, error } (the agent path)
  // and, on success, navigates to the live softphone — exactly as the button did.
  // One copy of the request + code branches.
  const startCallResult = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        const msg =
          data.code === "voice_not_configured" ? "Voice not configured — add Twilio creds in Settings."
            : data.code === "no_phone" ? "Contact has no phone number."
            : data.code === "dnc" ? "Contact is on the Do Not Call list."
            : data.code === "quiet_hours" ? "Outside quiet-hours for this contact's timezone."
            : data.error ?? `Call failed (${res.status})`;
        return { ok: false, error: msg };
      }
      router.push("/call-mode");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }, [contactId, router]);

  // S7 — start a call to this contact, mirroring the hot-to-call flow:
  // POST /api/calls/start, then land on the live softphone. Voice-config
  // and DNC/quiet-hours errors surface as toasts; navigation only on success.
  async function startCall() {
    if (!contact) return;
    setDialing(true);
    const r = await startCallResult();
    if (r.ok) toast("Call initiated — ringing…", "success");
    else toast(r.error ?? "Call failed", "error");
    setDialing(false);
  }

  // Reassign the owner — optimistic PUT. Hoisted ABOVE the early returns (it used
  // to sit between them) as a useCallback so a registered action's run() can call
  // it unconditionally. Same endpoint/body/optimistic update as before; the
  // OwnerSelect below still calls it directly — behaviour-preserving.
  const reassignContactOwner = useCallback(
    async (ownerId: string | null) => {
      setContact((prev) => (prev ? { ...prev, ownerId } : prev)); // optimistic
      try {
        await fetch(`/api/contacts/${contactId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId }),
        });
      } catch {
        /* optimistic; the select already reflects the choice */
      }
    },
    [contactId],
  );

  // CLE-08 §4: a second caller of the call-intel review REST contract — the SAME
  // request ContactCallProfile/usePendingReview.act issues (call-intel.tsx). The
  // server owns the live-vs-pending merge; this adds no business logic.
  const reviewCallIntel = useCallback(
    async (action: "approve" | "dismiss"): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/call-intel/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "contact", entityId: contactId, action }),
        });
        if (!res.ok) return { ok: false, error: "Couldn't update the proposal." };
        return { ok: true };
      } catch {
        return { ok: false, error: "Couldn't update the proposal." };
      }
    },
    [contactId],
  );

  // ── CLE-08: live refs + the contacts detail registration. The actions are
  //    captured once at mount; their run()s read live state via these refs and
  //    call the stable useCallbacks above. Registered unconditionally (before the
  //    early returns), so the manifest reflects /contacts/[id] the moment it
  //    mounts; each run() guards on the id matching the open contact (E-1). ──
  const contactIdConst = contactId;
  const contactRef = useRef(contact); contactRef.current = contact;
  const activitiesRef = useRef(activities); activitiesRef.current = activities;
  const updateFieldRef = useRef(updateField); updateFieldRef.current = updateField;
  const startCallResultRef = useRef(startCallResult); startCallResultRef.current = startCallResult;

  const contactDetailActions: PageAction[] = useMemo(
    () => [
      // ── updateField (inline edit: title / email / phone) ────────────────
      definePageAction({
        id: "contacts.updateField",
        title: "Edit a field on this contact",
        description:
          "Inline-edit the open contact's title, email, or phone. Use when the user wants to fix or set one of these.",
        params: z.object({
          id: z.string().min(1),
          field: z.enum(["title", "email", "phone"]),
          value: z.string(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ id, field, value }): Promise<PageActionResult> => {
          if (id !== contactIdConst) return errResult("That contact is not the one open here.");
          const okSaved = await updateFieldRef.current(field, value);
          return okSaved
            ? okResult('Updated ' + field + ' to "' + value.trim() + '".', { highlight: { entityId: id, scope: "contacts", field } })
            : errResult(field === "email" ? "That doesn't look like a valid email address." : "Couldn't save that change.");
        },
      }),
      // ── reassignOwner ───────────────────────────────────────────────────
      definePageAction({
        id: "contacts.reassignOwner",
        title: "Reassign this contact's owner",
        description: "Set or clear the member responsible for the open contact. Pass ownerId (or null to un-assign).",
        params: z.object({ id: z.string().min(1), ownerId: z.string().nullable() }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ id, ownerId }): Promise<PageActionResult> => {
          if (id !== contactIdConst) return errResult("That contact is not the one open here.");
          await reassignContactOwner(ownerId);
          return okResult(ownerId ? "Reassigned the contact." : "Un-assigned the contact.");
        },
      }),
      // ── call (outbound START; always confirm) ───────────────────────────
      definePageAction({
        id: "contacts.call",
        title: "Call this contact",
        description:
          "Start a phone call to the open contact and take the user to the live softphone. This PLACES an outbound " +
          "call (always confirmed). It only STARTS the call — answering, hanging up, voicemail and in-call notes are " +
          "done by the user on the softphone, not by you.",
        params: z.object({ id: z.string().min(1) }),
        mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
        run: async ({ id }): Promise<PageActionResult> => {
          if (id !== contactIdConst) return errResult("That contact is not the one open here.");
          const c = contactRef.current;
          const name = [c?.firstName, c?.lastName].filter(Boolean).join(" ") || "the contact";
          const r = await startCallResultRef.current();
          return r.ok ? okResult("Calling " + name + " — taking you to the softphone.")
                      : errResult(r.error ?? "Couldn't start the call.");
        },
      }),
      // ── sendEmail (opens the composer; not a send) ──────────────────────
      definePageAction({
        id: "contacts.sendEmail",
        title: "Draft an email to this contact",
        description:
          "Open the email composer pre-filled for the open contact. This OPENS the composer (does not send) — the " +
          "user reviews and sends. Optionally pass a draft {subject, body, to}.",
        params: z.object({
          id: z.string().min(1),
          draft: z.object({ subject: z.string().optional(), body: z.string().optional(), to: z.string().optional() }).optional(),
        }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ id, draft }): Promise<PageActionResult> => {
          if (id !== contactIdConst) return errResult("That contact is not the one open here.");
          const c = contactRef.current;
          const to = draft?.to ?? c?.email ?? "";
          if (!to) return errResult("This contact has no email address.");
          setEmailComposer({
            to,
            subject: draft?.subject ?? "",
            body: draft?.body ?? ("Hi " + (c?.firstName || "there") + ",\n\n"),
            contactId: contactIdConst,
          });
          return okResult("Opened the email composer — review and send.");
        },
      }),
      // ── suggestReply (opens the composer from an inbound activity) ───────
      definePageAction({
        id: "contacts.suggestReply",
        title: "Suggest a reply to an inbound email",
        description:
          "Open the composer pre-filled as a reply to one of this contact's inbound emails (by activityId). " +
          "Opens the composer; the user edits and sends.",
        params: z.object({ id: z.string().min(1), activityId: z.string().min(1) }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ id, activityId }): Promise<PageActionResult> => {
          if (id !== contactIdConst) return errResult("That contact is not the one open here.");
          const c = contactRef.current;
          const act = activitiesRef.current.find((a) => a.id === activityId);
          if (!act) return errResult("That activity isn't on this contact.");
          setEmailComposer({
            to: c?.email || "",
            subject: "Re: " + (act.summary?.slice(0, 50) || "your email"),
            body: "Hi " + (c?.firstName || "there") + ",\n\nThanks for your email. " +
              (act.summary ? 'Regarding "' + act.summary.slice(0, 80) + '..." — ' : "") + "\n\nBest regards",
            contactId: contactIdConst,
          });
          return okResult("Opened a suggested reply — edit and send.");
        },
      }),
      // ── approveCallIntel / dismissCallIntel ─────────────────────────────
      definePageAction({
        id: "contacts.approveCallIntel",
        title: "Approve the call-intel proposal",
        description:
          "Apply the post-call qualification proposal pending on this contact (role/disposition captured from the last call). " +
          "Only works when a proposal is pending.",
        params: z.object({ id: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ id }): Promise<PageActionResult> => {
          if (id !== contactIdConst) return errResult("That contact is not the one open here.");
          if (!hasPendingCallProfile(contactRef.current)) return errResult("There's no pending call-intel proposal on this contact.");
          const r = await reviewCallIntel("approve");
          return r.ok ? okResult("Applied the call-intel proposal to the contact.") : errResult(r.error ?? "Couldn't update the proposal.");
        },
      }),
      definePageAction({
        id: "contacts.dismissCallIntel",
        title: "Dismiss the call-intel proposal",
        description: "Dismiss the post-call qualification proposal pending on this contact. Only works when one is pending.",
        params: z.object({ id: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ id }): Promise<PageActionResult> => {
          if (id !== contactIdConst) return errResult("That contact is not the one open here.");
          if (!hasPendingCallProfile(contactRef.current)) return errResult("There's no pending call-intel proposal on this contact.");
          const r = await reviewCallIntel("dismiss");
          return r.ok ? okResult("Dismissed the call-intel proposal.") : errResult(r.error ?? "Couldn't update the proposal.");
        },
      }),
    ],
    // Stable id set; contact/activities read via refs, handlers via stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactIdConst],
  );
  useRegisterPageActions(contactDetailActions);

  // CLE-15 — pulse this record's header when the chat navigates here, or after a
  // field edit (contacts.updateField returns data.highlight for this id). The
  // header carries data-cle-entity. Null-safe before the contact loads.
  const detailContainerRef = useRef<HTMLDivElement>(null);
  const contactDetailLocate = useCallback<EntityLocator>(
    (a) =>
      a.entityId === contactIdConst
        ? detailContainerRef.current?.querySelector<HTMLElement>(`[data-cle-entity="${cssEscape(a.entityId)}"]`) ?? null
        : null,
    [contactIdConst],
  );
  useRegisterEntityLocator("contacts", contactDetailLocate);

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

        // Fetch buyer intent score
        try {
          const intentRes = await fetch(`/api/contacts/${contactId}/buyer-intent`);
          if (intentRes.ok) {
            const intentData = await intentRes.json();
            setBuyerIntent(intentData.score || null);
          }
        } catch {
          // Non-critical
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

  if (loading) return <DetailPageSkeleton avatar="circle" />;

  if (!contact) return <p className="p-6 text-sm text-red-400">Contact not found</p>;

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
  const initials = (contact.firstName?.charAt(0) || "?").toUpperCase() +
    (contact.lastName?.charAt(0) || "").toUpperCase();

  return (
    <div ref={detailContainerRef} className="flex h-full flex-col lg:flex-row">
      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <Breadcrumbs
          items={[
            { label: "Contacts", href: "/contacts" },
            { label: name },
          ]}
        />

        <div className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          <span>Owner</span>
          <OwnerSelect value={contact.ownerId} onChange={reassignContactOwner} className="h-7" ariaLabel="Contact owner" />
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-lg font-bold text-white">
            {initials}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold" data-cle-entity={contactIdConst}>{name}</h1>
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
          {contact.phone && (
            <Button
              variant="outline"
              size="sm"
              icon={<Phone size={13} />}
              onClick={startCall}
              loading={dialing}
              disabled={dialing}
            >
              {dialing ? "Dialing…" : "Call"}
            </Button>
          )}
          {contact.email && (
            <Button
              variant="outline"
              size="sm"
              icon={<Send size={13} />}
              onClick={() =>
                setEmailComposer({
                  to: contact.email!,
                  subject: "",
                  body: `Hi ${contact.firstName || "there"},\n\n`,
                  contactId,
                })
              }
            >
              Send email
            </Button>
          )}
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
                        {activity.actorName && (
                          <span className="text-xs text-[var(--color-text-tertiary)]">
                            · {activity.actorName}
                          </span>
                        )}
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
                          contactId,
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

        {/* Past calls + durable transcript viewer */}
        <ContactCalls contactId={contactId} />

      </div>

      {/* Right panel — details */}
      <div className="w-full shrink-0 border-t p-6 lg:w-[300px] lg:border-t-0 lg:border-l overflow-auto" style={{ borderColor: "var(--color-border-default)" }}>
        {/* Buyer Intent Score */}
        {buyerIntent && <BuyerIntentCard data={buyerIntent} />}

        {/* What the last call revealed about this person (role / disposition) */}
        <ContactCallProfile properties={contact.properties} className={buyerIntent ? "mt-6" : undefined} entityId={contactId} />

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
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
        <EmailComposerPanel
          draft={emailComposer}
          onClose={() => setEmailComposer(null)}
        />
      )}
    </div>
  );
}

/**
 * Buyer Intent Card — shows intent score as a gauge, trend arrow, and top signals.
 */
function BuyerIntentCard({ data }: { data: BuyerIntentScore }) {
  const score = data.score;
  const color =
    score >= 70
      ? "var(--color-success)"
      : score >= 40
        ? "var(--color-warning)"
        : "var(--color-error)";

  const trendIcon =
    data.trend === "heating" ? (
      <TrendingUp size={12} style={{ color: "var(--color-success)" }} />
    ) : data.trend === "cooling" ? (
      <TrendingDown size={12} style={{ color: "var(--color-error)" }} />
    ) : (
      <Minus size={12} style={{ color: "var(--color-text-tertiary)" }} />
    );

  const trendLabel =
    data.trend === "heating"
      ? "Heating up"
      : data.trend === "cooling"
        ? "Cooling down"
        : "Stable";

  // Top contributing signals (non-zero, sorted by weighted contribution)
  const topSignals = [...data.signals]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .slice(0, 4);

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        <Gauge size={13} /> Buyer Intent
      </h3>
      <div
        className="mt-3 rounded-lg p-3"
        style={{ background: "var(--color-bg-card)", border: `1px solid ${color}` }}
      >
        {/* Score gauge */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[16px] font-bold text-white"
            style={{ background: color }}
          >
            {score}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color }}>
              {score >= 70 ? "High intent" : score >= 40 ? "Moderate" : "Low intent"}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              {trendIcon}
              <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {trendLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Signal gauge bar */}
        <div className="h-2 w-full rounded-full mb-3" style={{ background: "var(--color-bg-page)" }}>
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{ width: `${score}%`, background: color }}
          />
        </div>

        {/* Top signals as pills */}
        {topSignals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topSignals.map((signal) => {
              const signalColor =
                signal.value >= 0.7
                  ? "var(--color-success)"
                  : signal.value >= 0.4
                    ? "var(--color-warning)"
                    : "var(--color-text-secondary)";
              return (
                <span
                  key={signal.type}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: signal.value >= 0.7 ? "var(--color-success-soft)" : signal.value >= 0.4 ? "var(--color-warning-soft)" : "var(--color-bg-hover)",
                    color: signalColor,
                  }}
                  title={signal.evidence}
                >
                  {signal.type.replace(/_/g, " ")}
                </span>
              );
            })}
          </div>
        )}
      </div>
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
