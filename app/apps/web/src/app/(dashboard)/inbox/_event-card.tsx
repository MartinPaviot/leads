"use client";

/**
 * Inline meeting-invite card for the reading pane (INBOX-R12 / CAL). Renders the
 * parsed .ics as a compact event card — summary, when, location, status. RSVP
 * (Yes/Maybe/No) sends an iTIP REPLY to the organizer via /api/inbox/rsvp
 * (INBOX-CAL04); the live send rides the composer's guarded chokepoint. Buttons
 * are inert when the invite carries no organizer/UID to answer, or it's
 * cancelled. Deterministic; no provider name.
 */
import { useState } from "react";
import { CalendarClock, MapPin, Check, HelpCircle, X, Loader2 } from "lucide-react";
import { parseIcs, eventStatusLabel, isEventCancelled, type IcsEvent } from "@/lib/inbox/parse-ics";
import type { RsvpChoice } from "@/lib/inbox/rsvp";

function formatWhen(ev: IcsEvent): string {
  if (!ev.start) return "";
  const dateOpts: Intl.DateTimeFormatOptions = ev.allDay
    ? { weekday: "short", month: "short", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  const start = ev.start.toLocaleString(undefined, dateOpts);
  if (ev.allDay) return `${start} · all day`;
  if (ev.end) {
    const sameDay = ev.start.toDateString() === ev.end.toDateString();
    const end = ev.end.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : dateOpts);
    return `${start} – ${end}`;
  }
  return start;
}

const RSVP: { label: string; choice: RsvpChoice; Icon: typeof Check }[] = [
  { label: "Yes", choice: "yes", Icon: Check },
  { label: "Maybe", choice: "maybe", Icon: HelpCircle },
  { label: "No", choice: "no", Icon: X },
];
const DONE: Record<RsvpChoice, string> = {
  yes: "You accepted",
  maybe: "You replied Maybe",
  no: "You declined",
};

export function EventCard({ ics, conversationKey }: { ics: string | null; conversationKey: string }) {
  const [responded, setResponded] = useState<RsvpChoice | null>(null);
  const [pending, setPending] = useState<RsvpChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ev = ics ? parseIcs(ics) : null;
  if (!ics || !ev) return null;
  const cancelled = isEventCancelled(ev);
  const when = formatWhen(ev);
  const repliable = Boolean(ev.organizer && ev.uid);

  async function rsvp(choice: RsvpChoice) {
    if (pending || responded) return;
    setPending(choice);
    setError(null);
    try {
      const r = await fetch("/api/inbox/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey, choice }),
      });
      if (r.ok) {
        setResponded(choice);
      } else {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setError(d.error || "Couldn't send your reply.");
      }
    } catch {
      setError("Couldn't send your reply.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className="mb-2 rounded-md border p-2.5 text-[12px]"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div className="flex items-center gap-1.5">
        <CalendarClock size={13} className="shrink-0" style={{ color: "var(--color-accent)" }} />
        <span className="font-medium" style={{ color: "var(--color-text-tertiary)" }}>
          {eventStatusLabel(ev)}
        </span>
      </div>

      {ev.summary && (
        <div
          className="mt-1 font-medium"
          style={{ color: "var(--color-text-primary)", textDecoration: cancelled ? "line-through" : undefined }}
        >
          {ev.summary}
        </div>
      )}
      {when && (
        <div className="mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          {when}
        </div>
      )}
      {ev.location && (
        <div className="mt-0.5 flex items-center gap-1" style={{ color: "var(--color-text-secondary)" }}>
          <MapPin size={11} className="shrink-0" />
          <span className="truncate">{ev.location}</span>
        </div>
      )}

      {!cancelled &&
        (responded ? (
          <div className="mt-2 flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--color-success)" }}>
            <Check size={11} className="shrink-0" /> {DONE[responded]}
          </div>
        ) : (
          <div className="mt-2 flex gap-1.5">
            {RSVP.map(({ label, choice, Icon }) => (
              <button
                key={choice}
                type="button"
                disabled={!repliable || pending !== null}
                onClick={() => void rsvp(choice)}
                title={repliable ? `RSVP ${label}` : "This invitation can't be answered"}
                className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50 disabled:hover:bg-transparent"
                style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
              >
                {pending === choice ? (
                  <Loader2 size={11} className="shrink-0 animate-spin" />
                ) : (
                  <Icon size={11} className="shrink-0" />
                )}
                {label}
              </button>
            ))}
          </div>
        ))}
      {error && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--color-warning)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
