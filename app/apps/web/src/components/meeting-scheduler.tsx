"use client";

/**
 * Inline meeting scheduler card — posts to /api/meetings/book (connected
 * calendar + invite). Extracted from Call Mode's _call-actions so the
 * Inbox reading pane books meetings with the exact same widget. Fully
 * bilingual via useT() — follows the global locale (default FR).
 */

import { useState, useEffect, useMemo } from "react";
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
  sovereign: "Visio",
  google_meet: "Google Meet",
  teams: "Teams",
  zoom: "Zoom",
};

/** Slot the booking POST needs — the shared shape both the card and the
 *  CLE-09 page action build. `startTime` is an ISO string (the card converts
 *  its datetime-local input first). */
export interface BookMeetingSlot {
  contactId: string;
  startTime: string;
  durationMinutes?: number;
  conferencing?: "sovereign" | "google_meet" | "teams" | "zoom";
  title?: string;
}

export interface BookMeetingResult {
  ok: boolean;
  joinUrl?: string | null;
  conferencing?: string;
  error?: string;
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
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes ?? 45,
        meetingType: "qualification",
        title: slot.title?.trim() || undefined,
        conferencing: slot.conferencing ?? "sovereign",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      booked?: boolean;
      joinUrl?: string;
      meetLink?: string;
      conferencing?: string;
      error?: string;
    };
    if (!res.ok || !data.booked) {
      return { ok: false, error: data.error ?? "Couldn't book the meeting." };
    }
    return {
      ok: true,
      joinUrl: data.joinUrl ?? data.meetLink ?? null,
      conferencing: data.conferencing ?? slot.conferencing ?? "sovereign",
    };
  } catch {
    return { ok: false, error: "Network error while booking." };
  }
}

export function MeetingSchedulerCard({
  contactId,
  firstName,
  onClose,
  onBooked,
  initialWhen,
  initialTitle,
}: {
  contactId: string;
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
  const [title, setTitle] = useState(initialTitle || "");
  const [booking, setBooking] = useState(false);
  // Title/duration/video live behind a quiet "Détails" disclosure (Visio is the
  // right default ~always); the manual datetime picker behind a fallback link.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(!!initialWhen);
  // Armed when a manually-typed time collides with the calendar — a second
  // Confirm ("Confirmer quand même") then books over it.
  const [manualConfirm, setManualConfirm] = useState(false);
  // Sovereign Jitsi by default; Google Meet / Teams / Zoom when the prospect
  // needs it (the backend honours it per the connected calendar / config).
  const [conferencing, setConferencing] = useState<
    "sovereign" | "google_meet" | "teams" | "zoom"
  >("sovereign");
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

  const videoLabel = VIDEO_LABEL[conferencing] ?? "Visio";
  const slotEcho = useMemo(() => {
    if (!when) return "";
    const s = new Date(when);
    if (Number.isNaN(s.getTime())) return "";
    const e = new Date(s.getTime() + duration * 60_000);
    const day = s.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
    const hm = (d: Date) => d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${hm(s)}–${hm(e)} · ${videoLabel}`;
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
      startTime: start.toISOString(),
      durationMinutes: duration,
      title,
      conferencing,
    });
    setBooking(false);
    if (!r.ok) {
      toast(r.error ?? t("meeting.bookFailed"), "error");
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
                onClick={() => setDuration(d)}
                aria-pressed={duration === d}
                className="rounded-md px-2 py-0.5 text-[12px] transition-colors"
                style={duration === d
                  ? { background: "var(--color-accent)", color: "#fff" }
                  : { background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
              >
                {d} min
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{t("meeting.video")}</span>
            {([
              { key: "sovereign", label: "Visio" },
              { key: "google_meet", label: "Google Meet" },
              { key: "teams", label: "Teams" },
              { key: "zoom", label: "Zoom" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setConferencing(opt.key)}
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
