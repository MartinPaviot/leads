"use client";

/**
 * Call Mode actions on the focal prospect: draft an email (AI) and book the
 * discovery meeting — both without leaving the cockpit. The email reuses the
 * email-drafting skill via /api/calls/draft-email then opens the shared
 * composer; the meeting posts to /api/meetings/book. Self-contained: it owns
 * the composer + scheduler state so the page doesn't have to thread it.
 */

import { useState } from "react";
import { Mail, CalendarPlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmailComposerPanel, type EmailComposerDraft } from "@/components/email-composer-panel";

function defaultWhen(): string {
  // Tomorrow 10:00 local, formatted for <input type="datetime-local">.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CallActions({
  contactId,
  contactName,
  email,
}: {
  contactId: string;
  contactName: string;
  email: string | null;
}) {
  const { toast } = useToast();
  const [drafting, setDrafting] = useState(false);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);

  const [schedOpen, setSchedOpen] = useState(false);
  const [when, setWhen] = useState(defaultWhen);
  const [duration, setDuration] = useState(45);
  const [title, setTitle] = useState("");
  const [booking, setBooking] = useState(false);

  const firstName = contactName.split(" ")[0] || "";

  async function writeEmail() {
    setDrafting(true);
    try {
      const res = await fetch("/api/calls/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, purpose: "meeting_request" }),
      });
      const data = (await res.json().catch(() => ({}))) as { subject?: string; body?: string; error?: string };
      if (!res.ok) {
        // The AI draft failed — still open the composer so the user can write
        // by hand rather than hitting a dead end.
        toast(data.error ?? "Couldn't draft the email — opening a blank one.", "warning");
        setComposer({ to: email ?? "", subject: "", body: `Bonjour ${firstName},\n\n`, contactId });
      } else {
        setComposer({ to: email ?? "", subject: data.subject ?? "", body: data.body ?? "", contactId });
        if (!email) toast("Drafted — add a recipient email to send.", "info");
      }
    } catch {
      toast("Network error while drafting.", "error");
    } finally {
      setDrafting(false);
    }
  }

  async function bookMeeting() {
    if (!when) {
      toast("Pick a date and time.", "warning");
      return;
    }
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) {
      toast("That date and time doesn't look valid.", "error");
      return;
    }
    setBooking(true);
    try {
      const res = await fetch("/api/meetings/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          startTime: start.toISOString(),
          durationMinutes: duration,
          meetingType: "qualification",
          title: title.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { booked?: boolean; meetLink?: string; error?: string };
      if (!res.ok || !data.booked) {
        toast(data.error ?? "Couldn't book the meeting.", "error");
        return;
      }
      toast(`Meeting booked with ${firstName || "the prospect"}.`, "success");
      setSchedOpen(false);
      setTitle("");
    } catch {
      toast("Network error while booking.", "error");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={writeEmail} disabled={drafting} className="gap-1.5">
          {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          {drafting ? "Drafting…" : "Write email"}
        </Button>
        <Button
          variant={schedOpen ? "solid" : "outline"}
          size="sm"
          onClick={() => setSchedOpen((v) => !v)}
          className="gap-1.5"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Book meeting
        </Button>
      </div>

      {schedOpen && (
        <div
          className="mt-2 rounded-lg border p-3"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
              Schedule a discovery meeting
            </span>
            <button onClick={() => setSchedOpen(false)} aria-label="Close" style={{ color: "var(--color-text-tertiary)" }}>
              <X size={13} />
            </button>
          </div>

          <label className="block text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            When
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1 w-full rounded-md px-2 py-1 text-[13px] outline-none"
              style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
            />
          </label>

          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>Duration</span>
            {[30, 45, 60].map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className="rounded-md px-2 py-0.5 text-[12px] transition-colors"
                style={
                  duration === d
                    ? { background: "var(--color-accent)", color: "#fff" }
                    : { background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }
                }
              >
                {d} min
              </button>
            ))}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Title (optional) — e.g. Échange ${firstName}`}
            className="mt-2 w-full rounded-md px-2 py-1 text-[13px] outline-none"
            style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
          />

          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={bookMeeting} disabled={booking} loading={booking}>
              {booking ? "Booking…" : "Confirm"}
            </Button>
          </div>
          <p className="mt-1.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
            Adds the event to your connected calendar and invites the contact.
          </p>
        </div>
      )}

      {composer && <EmailComposerPanel draft={composer} onClose={() => setComposer(null)} />}
    </div>
  );
}
