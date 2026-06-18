/**
 * Inline meeting-invite card for the reading pane (INBOX-R12 / CAL). Renders the
 * parsed .ics (captured on the IMAP path into metadata.calendar) as a compact
 * event card — summary, when, location, status — instead of a raw .ics dump or a
 * silent drop. RSVP (accept/tentative/decline) is shown but disabled: the live
 * calendar write is CAL04, deferred until there is a calendar-write path to call
 * (no live calendar mutation this session). All deterministic; no provider name.
 */
import { CalendarClock, MapPin, Check, HelpCircle, X } from "lucide-react";
import { parseIcs, eventStatusLabel, isEventCancelled, type IcsEvent } from "@/lib/inbox/parse-ics";

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

const RSVP = [
  { label: "Yes", Icon: Check },
  { label: "Maybe", Icon: HelpCircle },
  { label: "No", Icon: X },
];

export function EventCard({ ics }: { ics: string | null }) {
  if (!ics) return null;
  const ev = parseIcs(ics);
  if (!ev) return null;
  const cancelled = isEventCancelled(ev);
  const when = formatWhen(ev);

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

      {!cancelled && (
        <div className="mt-2 flex gap-1.5">
          {RSVP.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              disabled
              title="Respond from your calendar (coming soon)"
              className="flex items-center gap-1 rounded px-2 py-0.5 opacity-60"
              style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
            >
              <Icon size={11} className="shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
