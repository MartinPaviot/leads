"use client";

/**
 * Inline meeting scheduler card — posts to /api/meetings/book (connected
 * calendar + invite). Extracted from Call Mode's _call-actions so the
 * Inbox reading pane books meetings with the exact same widget. Fully
 * bilingual via useT() — follows the global locale (default FR).
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useT, useLocale } from "@/lib/i18n/locale";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** A Date → the local "YYYY-MM-DDTHH:mm" string an <input type="datetime-local"> wants. */
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Local "YYYY-MM-DD" key for grouping slots into day columns. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Commit a free-duration draft to a bookable value: round, then clamp to the
 * server's [5,480] window (api/meetings/book caps there). A blank/NaN draft
 * falls back to 30. Used on the field's blur so a half-typed "1" can never book
 * a 1-minute meeting (which the server would 400 on).
 */
export function clampDurationMinutes(raw: string): number {
  return Math.min(480, Math.max(5, Math.round(Number(raw) || 30)));
}

/** Reminder lead-time chips (null = the calendar's default, i.e. none set by us). */
const REMINDER_OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: "meeting.reminderNone", minutes: null },
  { label: "meeting.reminder10m", minutes: 10 },
  { label: "meeting.reminder30m", minutes: 30 },
  { label: "meeting.reminder1h", minutes: 60 },
  { label: "meeting.reminder1d", minutes: 1440 },
];
/** Recurrence frequency chips (null = a single, non-recurring meeting). */
const RECUR_OPTIONS: Array<{ label: string; freq: "daily" | "weekly" | "monthly" | null }> = [
  { label: "meeting.recurNone", freq: null },
  { label: "meeting.recurDaily", freq: "daily" },
  { label: "meeting.recurWeekly", freq: "weekly" },
  { label: "meeting.recurMonthly", freq: "monthly" },
];

/** The next `n` business days (skipping weekends), local midnight. */
function nextBusinessDays(n: number): Date[] {
  const days: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let offset = 0; days.length < n && offset < 21; offset++) {
    const day = new Date(base);
    day.setDate(base.getDate() + offset);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    days.push(day);
  }
  return days;
}

const VIDEO_LABEL: Record<string, string> = {
  sovereign: "Video call",
  google_meet: "Google Meet",
  teams: "Teams",
  zoom: "Zoom",
};

/** Slot the booking POST needs — the shared shape both the card and the
 *  CLE-09 page action build. `startTime` is an ISO string (the card converts
 *  its datetime-local input first). */
export interface BookMeetingSlot {
  /** The CRM contact to book against. Optional: a thread from a sender who isn't
   *  yet a contact passes `contactEmail`/`contactName` instead, and the server
   *  resolves-or-creates the contact at book time (explicit-intent capture). */
  contactId?: string;
  /** Sender email when there is no linked contact yet (resolve-or-create server-side). */
  contactEmail?: string;
  /** Sender display name, used to name a freshly-created contact. */
  contactName?: string;
  startTime: string;
  durationMinutes?: number;
  conferencing?: "sovereign" | "google_meet" | "teams" | "zoom";
  title?: string;
  /** Extra invitees beyond the prospect (founder, colleagues). */
  attendees?: string[];
  /** Free agenda / notes added to the invite. */
  agenda?: string;
  /** Physical location / room (else the join link fills LOCATION). */
  location?: string;
  /** Reminder lead-time in minutes before start (popup / VALARM / Graph). */
  reminderMinutes?: number;
  /** Recurrence (structured subset): freq + optional occurrence count. */
  recurrence?: { freq: "daily" | "weekly" | "monthly"; count?: number };
  /** Organizer IANA zone (the booking machine's browser zone) — a recurring
   *  series holds its local wall-clock across DST. Singles ignore it. */
  organizerTimeZone?: string;
}

export interface BookMeetingResult {
  ok: boolean;
  joinUrl?: string | null;
  conferencing?: string;
  /** A server-provided error message (already localized by the API, e.g. the FR
   *  "Aucune boîte connectée…"). Undefined when the failure has no server message. */
  error?: string;
  /** The request itself failed (network/exception) — the caller shows a localized
   *  network-error message instead of a server `error`. */
  networkError?: boolean;
}

/**
 * CLE-09 §4 lift: the single copy of the POST /api/meetings/book request.
 * Both the human card (MeetingSchedulerCard.bookMeeting) and the agent path
 * (callMode.bookMeeting via CallActions) call this so there is exactly one
 * request shape — calendar event + invite, byte-identical for both callers.
 * It does NOT send anything else; the human/agent confirm gate is upstream.
 */
export async function bookMeetingRequest(slot: BookMeetingSlot): Promise<BookMeetingResult> {
  try {
    const res = await fetch("/api/meetings/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: slot.contactId,
        contactEmail: slot.contactEmail,
        contactName: slot.contactName,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes ?? 45,
        meetingType: "qualification",
        title: slot.title?.trim() || undefined,
        conferencing: slot.conferencing ?? "sovereign",
        attendees: slot.attendees && slot.attendees.length > 0 ? slot.attendees : undefined,
        agenda: slot.agenda?.trim() || undefined,
        location: slot.location?.trim() || undefined,
        reminderMinutes: typeof slot.reminderMinutes === "number" ? slot.reminderMinutes : undefined,
        recurrence: slot.recurrence,
        organizerTimeZone: slot.organizerTimeZone,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      booked?: boolean;
      joinUrl?: string;
      meetLink?: string;
      conferencing?: string;
      // apiError(...) returns { error: { code, message } } (an OBJECT) for the
      // NOT_FOUND / VALIDATION_ERROR paths — incl. "Aucune boîte connectée…", the
      // most likely first failure. The 409/500 paths return a bare string. Accept
      // both and ALWAYS surface a string, else the toast renders an object child
      // and React throws.
      error?: string | { code?: string; message?: string };
    };
    if (!res.ok || !data.booked) {
      const error = typeof data.error === "string" ? data.error : data.error?.message;
      return { ok: false, error };
    }
    return {
      ok: true,
      joinUrl: data.joinUrl ?? data.meetLink ?? null,
      conferencing: data.conferencing ?? slot.conferencing ?? "sovereign",
    };
  } catch {
    return { ok: false, networkError: true };
  }
}

export function MeetingSchedulerCard({
  contactId,
  contactEmail,
  contactName,
  firstName,
  onClose,
  onBooked,
  initialWhen,
  initialTitle,
}: {
  /** Linked CRM contact. Omit (and pass contactEmail/contactName) to book against
   *  a thread sender who isn't a contact yet — the server creates them on book. */
  contactId?: string;
  /** Sender email when there's no linked contact (resolve-or-create server-side). */
  contactEmail?: string;
  /** Sender display name, to name a freshly-created contact. */
  contactName?: string;
  firstName: string;
  onClose: () => void;
  /** Fired on a successful booking with the meeting's join link (INBOX-G10), so a
   *  caller can drop it into an open reply draft. null when the provider returned none. */
  onBooked?: (joinUrl: string | null) => void;
  /** Pre-fill the date/time (datetime-local string) — e.g. a slot the prospect proposed (INBOX-CAL02). */
  initialWhen?: string;
  /** Pre-fill the meeting title. */
  initialTitle?: string;
}) {
  const { toast } = useToast();
  const t = useT();
  const { locale } = useLocale();
  const loc = locale === "fr" ? "fr-FR" : "en-US";
  // `when` is the chosen start (datetime-local string); empty until the user
  // picks a slot (or types one) — so Confirm stays disabled with nothing chosen.
  const [when, setWhen] = useState(initialWhen || "");
  // ISO of the selected free-slot pill (drives the highlight); null when the
  // time came from the manual picker instead.
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [duration, setDuration] = useState(45);
  // What the free-duration field shows while typing. Kept as a raw string so a
  // user can pass through intermediate states (clear the field, type "1" then
  // "20") without each keystroke being clamped/reverted; `duration` (the booked
  // value) follows when the draft parses in-range, and the draft is clamped to
  // [5,480] on blur. Presets write both.
  const [durationDraft, setDurationDraft] = useState("45");
  const [title, setTitle] = useState(initialTitle || "");
  // Extra invitees (emails) beyond the prospect + a free agenda for the invite.
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [agenda, setAgenda] = useState("");
  // Location / reminder / recurrence (the "vrai meeting" params). reminderMinutes
  // null = the calendar default; recurFreq null = a single (non-recurring) meeting.
  const [meetLocation, setMeetLocation] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [recurFreq, setRecurFreq] = useState<"daily" | "weekly" | "monthly" | null>(null);
  const [recurCount, setRecurCount] = useState("");
  const [booking, setBooking] = useState(false);
  // Title/duration/video live behind a quiet "Détails" disclosure (Visio is the
  // right default ~always); the manual datetime picker behind a fallback link.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(!!initialWhen);
  // Armed when a manually-typed time collides with the calendar — a second
  // Confirm ("Confirmer quand même") then books over it.
  const [manualConfirm, setManualConfirm] = useState(false);
  // Conferencing tool. Defaults to the connected calendar's NATIVE tool (Google →
  // Meet, Microsoft → Teams), and a sovereign Jitsi "Visio" for an IMAP/SMTP box
  // (no native conferencing). The user can still override. `pickedConferencing`
  // guards the auto-default so we never stomp a manual choice.
  const [conferencing, setConferencing] = useState<
    "sovereign" | "google_meet" | "teams" | "zoom"
  >("sovereign");
  const pickedConferencing = useRef(false);
  // Once booked, surface the join link (the API returned it but the cockpit
  // never showed it before).
  const [booked, setBooked] = useState<{ joinUrl: string | null; conferencing: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Free slots from the user's connected calendar (Infomaniak CalDAV / Microsoft /
  // Google), grouped into a week strip. `source: "none"` = no calendar → fall back
  // to the manual picker.
  const [slots, setSlots] = useState<string[]>([]);
  const [source, setSource] = useState<string>(""); // "" = loading, before the first response
  const [loadingSlots, setLoadingSlots] = useState(true);
  useEffect(() => {
    if (booked) return;
    let cancelled = false;
    setLoadingSlots(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    fetch(`/api/meetings/availability?duration=${duration}&days=7&perDay=6&tz=${encodeURIComponent(tz)}`)
      .then((r) => (r.ok ? r.json() : { slots: [], source: "none" }))
      .then((d: { slots?: Array<{ start: string }>; source?: string }) => {
        if (cancelled) return;
        setSlots((d.slots ?? []).map((s) => s.start));
        setSource(d.source ?? "none");
        setLoadingSlots(false);
      })
      .catch(() => {
        // Network reject → fall back to the clean manual-only view, not a
        // misleading all-"Complet" week grid.
        if (!cancelled) {
          setSource("none");
          setLoadingSlots(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [duration, booked]);

  // Provider-aware default: once we know which calendar is connected, pick its
  // native conferencing (Google → Meet, Microsoft → Teams), else the sovereign
  // Visio for an IMAP/SMTP box. Never overrides a manual choice.
  useEffect(() => {
    if (pickedConferencing.current || !source || source === "") return;
    setConferencing(source === "google" ? "google_meet" : source === "microsoft" ? "teams" : "sovereign");
  }, [source]);

  // The conferencing options to offer, scoped to what the connected calendar can
  // actually do: a sovereign Visio is always available; the native tool only on
  // its own provider (offering Teams on a Google box just silently falls back).
  const videoOptions = useMemo<Array<{ key: "sovereign" | "google_meet" | "teams" | "zoom"; label: string }>>(() => {
    const visio = { key: "sovereign" as const, label: "Video call" };
    if (source === "google") return [visio, { key: "google_meet", label: "Google Meet" }];
    if (source === "microsoft") return [visio, { key: "teams", label: "Teams" }];
    return [visio]; // caldav / smtp / none → only the sovereign Visio is real
  }, [source]);

  // Drop a pill selection that a duration refetch no longer offers, so Confirm
  // can't book a time that just became busy. Manual entries (selectedIso === null)
  // persist — they're a deliberate user choice.
  useEffect(() => {
    if (selectedIso && !slots.includes(selectedIso)) {
      setSelectedIso(null);
      setWhen("");
    }
  }, [slots, selectedIso]);

  // Group free slots into local day-columns; render against the next 5 business
  // days so full days still show (as "Complet"), reading as a continuous week.
  const slotsByDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const iso of slots) {
      const k = dayKey(new Date(iso));
      const arr = m.get(k);
      if (arr) arr.push(iso);
      else m.set(k, [iso]);
    }
    return m;
  }, [slots]);
  const weekDays = useMemo(() => nextBusinessDays(5), []);

  const videoLabel = VIDEO_LABEL[conferencing] ?? "Video call";
  const slotEcho = useMemo(() => {
    if (!when) return "";
    const s = new Date(when);
    if (Number.isNaN(s.getTime())) return "";
    const e = new Date(s.getTime() + duration * 60_000);
    const day = s.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
    const hm = (d: Date) => d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    // Show the user's timezone so the time is never ambiguous (UTC+2 / EDT / …).
    const tz = new Intl.DateTimeFormat(loc, { timeZoneName: "short" }).formatToParts(s).find((p) => p.type === "timeZoneName")?.value || "";
    return `${day} · ${hm(s)}–${hm(e)}${tz ? ` (${tz})` : ""} · ${videoLabel}`;
  }, [when, duration, videoLabel, loc]);

  function pickSlot(iso: string) {
    setSelectedIso(iso);
    setWhen(toLocalInput(new Date(iso)));
    setManualOpen(false);
    setManualConfirm(false);
  }

  function setManualWhen(value: string) {
    setWhen(value);
    setSelectedIso(null);
    setManualConfirm(false);
  }

  async function copyLink() {
    if (!booked?.joinUrl) return;
    try {
      await navigator.clipboard.writeText(booked.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is still selectable in the field */
    }
  }

  async function bookMeeting() {
    if (!when) {
      toast(t("meeting.pickDateTime"), "warning");
      return;
    }
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) {
      toast(t("meeting.invalidDateTime"), "error");
      return;
    }
    // A manually-typed time can collide with the calendar (pills are free by
    // construction). Check it; on a conflict, warn and require a second Confirm.
    if (selectedIso === null && !manualConfirm) {
      try {
        const res = await fetch(
          `/api/meetings/availability/check?start=${encodeURIComponent(start.toISOString())}&duration=${duration}`,
        );
        const data = (await res.json().catch(() => ({ free: true }))) as { free?: boolean };
        if (data.free === false) {
          setManualConfirm(true);
          toast(t("meeting.slotBusy"), "warning");
          return;
        }
      } catch {
        /* the check is a backstop — book on its failure rather than block */
      }
    }
    setBooking(true);
    // CLE-09 §4: the POST now lives in the shared bookMeetingRequest so the
    // card and the agent path issue one identical request.
    const r = await bookMeetingRequest({
      contactId,
      contactEmail,
      contactName,
      startTime: start.toISOString(),
      durationMinutes: duration,
      title,
      conferencing,
      attendees,
      agenda,
      location: meetLocation,
      reminderMinutes: reminderMinutes ?? undefined,
      recurrence: recurFreq
        ? {
            freq: recurFreq,
            // Clamp to the route's [2,52] window — an HTML max= doesn't block
            // typing, so without this an over-large entry 400s the booking.
            count: recurCount && Number(recurCount) >= 2 ? Math.min(52, Math.floor(Number(recurCount))) : undefined,
          }
        : undefined,
      // The booking machine's IANA zone — a recurring series anchors to the local
      // wall-clock the user SAW (same value used for the availability query).
      organizerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    });
    setBooking(false);
    if (!r.ok) {
      toast(r.networkError ? t("meeting.networkError") : (r.error ?? t("meeting.bookFailed")), "error");
      return;
    }
    toast(t("meeting.bookedToast", { name: firstName || t("common.theProspect") }), "success");
    setTitle("");
    onBooked?.(r.joinUrl ?? null);
    // Stay open and reveal the join link instead of closing immediately.
    setBooked({
      joinUrl: r.joinUrl ?? null,
      conferencing: r.conferencing ?? conferencing,
    });
  }

  return (
    <div
      className="mt-2 rounded-lg border p-3"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          {booked ? t("meeting.bookedTitle") : t("meeting.proposeTime")}
        </span>
        <button onClick={onClose} aria-label={t("common.close")} style={{ color: "var(--color-text-tertiary)" }}>
          <X size={13} />
        </button>
      </div>

      {booked ? (
        <div className="space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            {t("meeting.inviteSent", { name: firstName || t("common.theProspect") })}
          </p>
          {booked.joinUrl && (
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={booked.joinUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md px-2 py-1 text-[12px] outline-none"
                style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
              />
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>{t("common.done")}</Button>
          </div>
        </div>
      ) : (
      <>
      {!loadingSlots && source === "none" ? (
        /* No calendar connected → straight to the manual picker. */
        <div>
          <label className="block text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {t("meeting.when")}
            <input
              type="datetime-local"
              value={when}
              min={toLocalInput(new Date())}
              onChange={(e) => setManualWhen(e.target.value)}
              className="mt-1 w-full rounded-md px-2 py-1 text-[13px] outline-none"
              style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
            />
          </label>
          <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{t("meeting.noCalendar")}</p>
        </div>
      ) : (
        /* Week strip — pick a free slot from your connected calendar. */
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{
            // Soft right-edge fade signals the strip scrolls horizontally (the
            // founder's narrow viewport shows ~4-5 of the day columns at once).
            maskImage: "linear-gradient(to right, black calc(100% - 14px), transparent)",
            WebkitMaskImage: "linear-gradient(to right, black calc(100% - 14px), transparent)",
          }}
        >
          {weekDays.map((day) => {
            const isos = (slotsByDay.get(dayKey(day)) ?? []).slice(0, 6);
            return (
              <div key={dayKey(day)} className="min-w-[96px] shrink-0">
                <div className="border-b pb-1 text-[11px] capitalize" style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}>
                  {day.toLocaleDateString(loc, { weekday: "short" })}{" "}
                  <span style={{ color: "var(--color-text-tertiary)" }}>{day.toLocaleDateString(loc, { day: "numeric", month: "short" })}</span>
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {isos.length === 0 ? (
                    <span className="px-1 py-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {loadingSlots ? "…" : t("meeting.complet")}
                    </span>
                  ) : (
                    isos.map((iso) => {
                      const sel = iso === selectedIso;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => pickSlot(iso)}
                          aria-pressed={sel}
                          aria-label={new Date(iso).toLocaleString(loc, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                          className="rounded-md px-2 py-1 text-[12px] transition-colors"
                          style={sel
                            ? { background: "var(--color-accent)", color: "#fff" }
                            : { background: "var(--color-bg-card)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
                        >
                          {new Date(iso).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual fallback — odd or prospect-proposed times (progressive disclosure). */}
      {source !== "none" && (
        <>
          <button
            type="button"
            onClick={() => setManualOpen((o) => !o)}
            aria-expanded={manualOpen}
            className="mt-2 text-[11px] underline"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {t("meeting.pickManually")}
          </button>
          {manualOpen && (
            <input
              type="datetime-local"
              value={when}
              min={toLocalInput(new Date())}
              onChange={(e) => setManualWhen(e.target.value)}
              aria-label={t("meeting.when")}
              className="mt-1 w-full rounded-md px-2 py-1 text-[13px] outline-none"
              style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
            />
          )}
        </>
      )}

      {/* Détails — duration / video / title behind a quiet disclosure (smart defaults). */}
      <button
        type="button"
        onClick={() => setDetailsOpen((o) => !o)}
        aria-expanded={detailsOpen}
        className="mt-2 flex w-full items-center justify-between rounded-md py-1 text-[12px]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <span className="flex items-center gap-1">
          {detailsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {t("meeting.details")}
        </span>
        <span style={{ color: "var(--color-text-tertiary)" }}>{duration} min · {videoLabel}</span>
      </button>
      {detailsOpen && (
        <div className="mt-1 space-y-2 border-t pt-2" style={{ borderColor: "var(--color-border-default)" }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{t("meeting.duration")}</span>
            {[30, 45, 60].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDuration(d); setDurationDraft(String(d)); }}
                aria-pressed={duration === d}
                className="rounded-md px-2 py-0.5 text-[12px] transition-colors"
                style={duration === d
                  ? { background: "var(--color-accent)", color: "#fff" }
                  : { background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
              >
                {d} min
              </button>
            ))}
            {/* Free duration — any value 5–480 min, not just the presets. */}
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={durationDraft}
              onChange={(e) => {
                const raw = e.target.value;
                setDurationDraft(raw);
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 5 && n <= 480) setDuration(n);
              }}
              onBlur={() => {
                const n = clampDurationMinutes(durationDraft);
                setDuration(n);
                setDurationDraft(String(n));
              }}
              aria-label={t("meeting.duration")}
              className="w-14 rounded-md px-1.5 py-0.5 text-[12px] outline-none"
              style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
            />
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>min</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{t("meeting.video")}</span>
            {videoOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => { pickedConferencing.current = true; setConferencing(opt.key); }}
                aria-pressed={conferencing === opt.key}
                className="rounded-md px-2 py-0.5 text-[12px] transition-colors"
                style={conferencing === opt.key
                  ? { background: "var(--color-accent)", color: "#fff" }
                  : { background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("meeting.titlePlaceholder", { name: firstName })}
            className="w-full rounded-md px-2 py-1 text-[13px] outline-none"
            style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
          />
          {/* Invités en plus du prospect (founder, collègue). Email + Entrée/virgule. */}
          <div
            className="flex flex-wrap items-center gap-1 rounded-md px-2 py-1"
            style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
          >
            {attendees.map((a, i) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                style={{ background: "var(--color-bg-card)", color: "var(--color-text-primary)", border: "0.5px solid var(--color-border-default)" }}
              >
                {a}
                <button type="button" onClick={() => setAttendees((xs) => xs.filter((_, idx) => idx !== i))} aria-label={t("common.close")} style={{ color: "var(--color-text-muted)" }}>
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              value={attendeeInput}
              onChange={(e) => setAttendeeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                  const v = attendeeInput.trim().replace(/,$/, "");
                  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { e.preventDefault(); if (!attendees.includes(v)) setAttendees((xs) => [...xs, v]); setAttendeeInput(""); }
                } else if (e.key === "Backspace" && !attendeeInput && attendees.length) {
                  setAttendees((xs) => xs.slice(0, -1));
                }
              }}
              onBlur={() => { const v = attendeeInput.trim(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !attendees.includes(v)) { setAttendees((xs) => [...xs, v]); setAttendeeInput(""); } }}
              placeholder={attendees.length === 0 ? t("meeting.attendeesPlaceholder") : ""}
              className="min-w-[120px] flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: "var(--color-text-primary)" }}
            />
          </div>
          <textarea
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            rows={2}
            placeholder={t("meeting.agendaPlaceholder")}
            className="w-full resize-none rounded-md px-2 py-1 text-[13px] outline-none"
            style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
          />
          {/* Lieu — a physical place / room; if empty, the visio link fills LOCATION. */}
          <input
            value={meetLocation}
            onChange={(e) => setMeetLocation(e.target.value)}
            placeholder={t("meeting.locationPlaceholder")}
            className="w-full rounded-md px-2 py-1 text-[13px] outline-none"
            style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
          />
          {/* Rappel — a popup/VALARM N minutes before start. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{t("meeting.reminder")}</span>
            {REMINDER_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setReminderMinutes(opt.minutes)}
                aria-pressed={reminderMinutes === opt.minutes}
                className="rounded-md px-2 py-0.5 text-[12px] transition-colors"
                style={reminderMinutes === opt.minutes
                  ? { background: "var(--color-accent)", color: "#fff" }
                  : { background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
              >
                {t(opt.label)}
              </button>
            ))}
          </div>
          {/* Récurrence — frequency chips + an optional occurrence count. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{t("meeting.recurrence")}</span>
            {RECUR_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setRecurFreq(opt.freq)}
                aria-pressed={recurFreq === opt.freq}
                className="rounded-md px-2 py-0.5 text-[12px] transition-colors"
                style={recurFreq === opt.freq
                  ? { background: "var(--color-accent)", color: "#fff" }
                  : { background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
              >
                {t(opt.label)}
              </button>
            ))}
            {recurFreq && (
              <input
                type="number"
                min={2}
                max={52}
                value={recurCount}
                onChange={(e) => setRecurCount(e.target.value)}
                placeholder={t("meeting.recurrenceCount")}
                aria-label={t("meeting.recurrenceCount")}
                className="w-32 rounded-md px-1.5 py-0.5 text-[12px] outline-none"
                style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
              />
            )}
          </div>
        </div>
      )}

      {/* Footer — selected-slot echo + Confirm (disabled until a slot is chosen). */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className="min-w-0 flex-1 truncate text-[12px]"
          style={{ color: when ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}
        >
          {slotEcho || t("meeting.selectSlot")}
        </span>
        <Button size="sm" onClick={bookMeeting} disabled={booking || !when} loading={booking}>
          {booking ? t("meeting.booking") : manualConfirm ? t("meeting.bookAnyway") : t("common.confirm")}
        </Button>
      </div>
      <p className="mt-1.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
        {conferencing === "sovereign" ? t("meeting.descSovereign") : t("meeting.descProvider")}
      </p>
      </>
      )}
    </div>
  );
}
