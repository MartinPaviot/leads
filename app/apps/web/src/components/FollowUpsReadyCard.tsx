"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Send, Loader2, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * P2 (inbox deal-closer roadmap) — proactive follow-up nudges, the review
 * surface. Mirrors WarmLeadPrompt.tsx's shape: a /home-mounted card,
 * fetch-on-mount, self-hides when empty. The difference from WarmLeadPrompt
 * is these drafts already exist (written by the daily cron via
 * lib/inbox/followup-nudge-draft.ts) — this is a review queue, not a
 * draft-on-demand prompt. Every row is editable inline before sending; Send
 * routes through /api/inbox/followups/[id]/send (deliverInteractiveEmail,
 * so all existing send guardrails apply); Dismiss is terminal.
 */

interface ReadyNudge {
  id: string;
  conversationKey: string;
  contactId: string | null;
  toAddress: string;
  subject: string;
  bodyText: string;
  stage: number;
  generatedAt: string;
  version: number;
}

export function FollowUpsReadyCard() {
  const { toast } = useToast();
  const [nudges, setNudges] = useState<ReadyNudge[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/followups/ready")
      .then((r) => (r.ok ? r.json() : { nudges: [] }))
      .then((data) => {
        if (cancelled) return;
        // Defensive: an unexpected/malformed response (network hiccup, an
        // unmatched-route fallback in a test harness, a future API change)
        // must degrade to "no nudges", never crash the dashboard render.
        const rows = Array.isArray((data as { nudges?: ReadyNudge[] })?.nudges)
          ? (data as { nudges: ReadyNudge[] }).nudges
          : [];
        setNudges(rows);
        setEdits(Object.fromEntries(rows.map((n) => [n.id, { subject: n.subject, body: n.bodyText }])));
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

  const send = useCallback(
    async (n: ReadyNudge) => {
      setBusy(n.id);
      try {
        const e = edits[n.id] ?? { subject: n.subject, body: n.bodyText };
        const res = await fetch(`/api/inbox/followups/${n.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: e.subject, body: e.body, version: n.version }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        toast(`Follow-up sent to ${n.toAddress}`, "success");
        setNudges((prev) => prev.filter((x) => x.id !== n.id));
      } catch (err) {
        console.warn("followup-nudge: send failed", err);
        toast(err instanceof Error ? err.message : "Send failed", "error");
      } finally {
        setBusy(null);
      }
    },
    [edits, toast],
  );

  const dismiss = useCallback(
    async (n: ReadyNudge) => {
      setBusy(n.id);
      // Optimistic — the human's "no" is immediate; restore on failure.
      setNudges((prev) => prev.filter((x) => x.id !== n.id));
      try {
        const res = await fetch(`/api/inbox/followups/${n.id}/dismiss`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.warn("followup-nudge: dismiss failed", err);
        setNudges((prev) => [n, ...prev]);
        toast("Couldn't dismiss — retry?", "error");
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  if (loading) return null;
  if (nudges.length === 0) return null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2">
          <Clock3 size={16} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Follow-ups ready to review
          </h2>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          Threads where they haven&apos;t replied — a gentle nudge is drafted below. Edit if you want, then send or dismiss.
        </p>

        <div className="mt-3 space-y-3">
          {nudges.map((n) => {
            const e = edits[n.id] ?? { subject: n.subject, body: n.bodyText };
            const isBusy = busy === n.id;
            return (
              <div
                key={n.id}
                className="rounded-md p-3"
                style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {n.toAddress} · follow-up #{n.stage}
                  </div>
                </div>
                <input
                  type="text"
                  value={e.subject}
                  onChange={(ev) => setEdits((prev) => ({ ...prev, [n.id]: { ...e, subject: ev.target.value } }))}
                  className="mt-2 w-full rounded-md px-2 py-1 text-[13px] font-medium outline-none"
                  style={{
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border-default)",
                    color: "var(--color-text-primary)",
                  }}
                />
                <textarea
                  value={e.body}
                  onChange={(ev) => setEdits((prev) => ({ ...prev, [n.id]: { ...e, body: ev.target.value } }))}
                  rows={4}
                  className="mt-2 w-full resize-y rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={{
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border-default)",
                    color: "var(--color-text-secondary)",
                  }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={() => void send(n)} disabled={isBusy || !e.body.trim()}>
                    {isBusy ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Sending…
                      </>
                    ) : (
                      <>
                        <Send size={12} /> Send
                      </>
                    )}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void dismiss(n)} disabled={isBusy}>
                    <X size={12} /> Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
