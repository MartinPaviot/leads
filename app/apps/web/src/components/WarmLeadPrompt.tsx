"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Send, Loader2, Check, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * WS-3 warm-lead prompt — top-3 warm leads surfaced on the dashboard
 * right after onboarding. Gated by the `onboarding.v2.warm-lead-prompt`
 * flag so v1 tenants don't see it.
 *
 * Each card: contact name + company + last interaction summary + CTA
 * "Draft follow-up". Click drafts via /api/warm-leads/draft, shows the
 * draft inline, user approves + sends (routes through /api/emails
 * which enforces WS-1 guardrails).
 *
 * Lightweight — no fancy drag/drop, no inline editor. The draft is
 * shown read-only with a "Send" and "Cancel" pair. Edits happen via
 * the email composer later.
 */

interface WarmLead {
  contactId: string;
  name: string;
  email: string;
  companyName: string | null;
  lastSummary: string | null;
  daysSinceLast: number;
}

interface Draft {
  subject: string;
  body: string;
}

export function WarmLeadPrompt() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<WarmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft | "loading" | null>>(
    {},
  );
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/warm-leads/scan?limit=3")
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((data) => {
        if (cancelled) return;
        setLeads((data as { leads: WarmLead[] }).leads);
      })
      .catch(() => {
        /* empty state */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const draft = useCallback(async (lead: WarmLead) => {
    setDrafts((prev) => ({ ...prev, [lead.contactId]: "loading" }));
    try {
      const res = await fetch("/api/warm-leads/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: lead.contactId }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = (await res.json()) as Draft;
      setDrafts((prev) => ({ ...prev, [lead.contactId]: payload }));
    } catch (err) {
      console.warn("warm-lead: draft failed", err);
      setDrafts((prev) => ({ ...prev, [lead.contactId]: null }));
      toast("Couldn't draft — retry?", "error");
    }
  }, [toast]);

  const send = useCallback(
    async (lead: WarmLead, d: Draft) => {
      setSending(lead.contactId);
      try {
        const res = await fetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: lead.email,
            subject: d.subject,
            body: d.body,
            contactId: lead.contactId,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        toast(`Sent to ${lead.name}`, "success");
        setLeads((prev) => prev.filter((l) => l.contactId !== lead.contactId));
      } catch (err) {
        console.warn("warm-lead: send failed", err);
        toast(
          err instanceof Error ? err.message : "Send failed",
          "error",
        );
      } finally {
        setSending(null);
      }
    },
    [toast],
  );

  const markNotALead = useCallback(
    async (lead: WarmLead) => {
      // Optimistic: drop the card immediately. The human's verdict overrides
      // every upstream stage (see lib/inbound/lead-status.ts).
      setLeads((prev) => prev.filter((l) => l.contactId !== lead.contactId));
      try {
        const res = await fetch(`/api/contacts/${lead.contactId}/lead-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isLead: false }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast(`Removed ${lead.name} — not a lead`, "success");
      } catch (err) {
        console.warn("warm-lead: mark not-a-lead failed", err);
        setLeads((prev) => [lead, ...prev]); // restore on failure
        toast("Couldn't update — retry?", "error");
      }
    },
    [toast],
  );

  // Render nothing until we KNOW there are warm leads to show. This prompt sits
  // above the dashboard greeting and self-hides when empty (the common case), so
  // a visible "Scanning…" card would just flash a placeholder above "Good
  // morning <name>" on every load and then collapse to nothing — the same
  // empty-state flash we removed from the hot-* widgets. The real card pops in
  // when the scan returns leads. (brief §4.4 Severity 1 — empty state is silent.)
  if (loading) return null;

  if (leads.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Warm leads waiting for a reply
          </h2>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          People you&apos;ve been in conversation with but haven&apos;t followed up recently. One click drafts a reply grounded in your actual past exchange.
        </p>

        <div className="mt-3 space-y-2">
          {leads.map((lead) => {
            const d = drafts[lead.contactId];
            const isLoading = d === "loading";
            const isDraft = d && d !== "loading";

            return (
              <div
                key={lead.contactId}
                className="rounded-md p-3"
                style={{
                  background: "var(--color-bg-page)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {lead.name}
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {lead.companyName ? `${lead.companyName} · ` : ""}
                      Last talked {lead.daysSinceLast}d ago
                    </div>
                    {lead.lastSummary && (
                      <div className="mt-1 text-[12px] italic truncate" style={{ color: "var(--color-text-secondary)" }}>
                        &ldquo;{lead.lastSummary}&rdquo;
                      </div>
                    )}
                  </div>
                  {!isDraft && !isLoading && (
                    <div className="flex flex-col items-end gap-1">
                      <Button size="sm" onClick={() => void draft(lead)}>
                        Draft follow-up
                      </Button>
                      <button
                        type="button"
                        onClick={() => void markNotALead(lead)}
                        className="text-[10px] hover:underline"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        Not a lead
                      </button>
                    </div>
                  )}
                  {isLoading && (
                    <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                      <Loader2 size={12} className="animate-spin" />
                      Drafting…
                    </span>
                  )}
                </div>

                {isDraft && d && typeof d !== "string" && (
                  <div className="mt-3">
                    <div className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {d.subject}
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {d.body}
                    </pre>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void send(lead, d)}
                        disabled={sending === lead.contactId}
                      >
                        {sending === lead.contactId ? (
                          <>
                            <Loader2 size={12} className="animate-spin" /> Sending…
                          </>
                        ) : (
                          <>
                            <Send size={12} /> Send
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDrafts((prev) => ({ ...prev, [lead.contactId]: null }))
                        }
                      >
                        <X size={12} /> Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
