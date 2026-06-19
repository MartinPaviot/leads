"use client";

/**
 * Inline meeting scheduler card — posts to /api/meetings/book (connected
 * calendar + invite). Extracted from Call Mode's _call-actions so the
 * Inbox reading pane books meetings with the exact same widget.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

function defaultWhen(): string {
  // Tomorrow 10:00 local, formatted for <input type="datetime-local">.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const [when, setWhen] = useState(() => initialWhen || defaultWhen());
  const [duration, setDuration] = useState(45);
  const [title, setTitle] = useState(initialTitle || "");
  const [booking, setBooking] = useState(false);
  // Sovereign Jitsi by default; Google Meet / Teams / Zoom when the prospect
  // needs it (the backend honours it per the connected calendar / config).
  const [conferencing, setConferencing] = useState<
    "sovereign" | "google_meet" | "teams" | "zoom"
  >("sovereign");
  // Once booked, surface the join link (the API returned it but the cockpit
  // never showed it before).
  const [booked, setBooked] = useState<{ joinUrl: string | null; conferencing: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
      toast("Pick a date and time.", "warning");
      return;
    }
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) {
      toast("That date and time doesn't look valid.", "error");
      return;
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
      toast(r.error ?? "Couldn't book the meeting.", "error");
      return;
    }
    toast(`Visio planifiée avec ${firstName || "le prospect"}.`, "success");
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
          {booked ? "Visio planifiée" : "Schedule a discovery meeting"}
        </span>
        <button onClick={onClose} aria-label="Close" style={{ color: "var(--color-text-tertiary)" }}>
          <X size={13} />
        </button>
      </div>

      {booked ? (
        <div className="space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Invitation envoyée à {firstName || "le prospect"} avec le lien de visio
            {booked.conferencing === "sovereign" ? " souveraine." : "."}
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
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>Terminé</Button>
          </div>
        </div>
      ) : (
      <>
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

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>Visio</span>
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
            className="rounded-md px-2 py-0.5 text-[12px] transition-colors"
            style={
              conferencing === opt.key
                ? { background: "var(--color-accent)", color: "#fff" }
                : { background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }
            }
          >
            {opt.label}
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
        {conferencing === "sovereign"
          ? "Ajoute l'événement à votre agenda connecté avec un lien de visio souveraine, et invite le contact."
          : "Crée la réunion (Google Meet / Teams / Zoom) selon votre choix et votre agenda connecté, et invite le contact."}
      </p>
      </>
      )}
    </div>
  );
}
