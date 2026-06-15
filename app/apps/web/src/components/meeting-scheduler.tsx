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

export function MeetingSchedulerCard({
  contactId,
  firstName,
  onClose,
  onBooked,
}: {
  contactId: string;
  firstName: string;
  onClose: () => void;
  onBooked?: () => void;
}) {
  const { toast } = useToast();
  const [when, setWhen] = useState(defaultWhen);
  const [duration, setDuration] = useState(45);
  const [title, setTitle] = useState("");
  const [booking, setBooking] = useState(false);
  // Sovereign Jitsi by default; "native" = Google Meet / Teams when the
  // prospect needs it (the backend picks per the connected calendar).
  const [conferencing, setConferencing] = useState<"sovereign" | "native">("sovereign");
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
          conferencing,
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
        toast(data.error ?? "Couldn't book the meeting.", "error");
        return;
      }
      toast(`Visio planifiée avec ${firstName || "le prospect"}.`, "success");
      setTitle("");
      onBooked?.();
      // Stay open and reveal the join link instead of closing immediately.
      setBooked({
        joinUrl: data.joinUrl ?? data.meetLink ?? null,
        conferencing: data.conferencing ?? conferencing,
      });
    } catch {
      toast("Network error while booking.", "error");
    } finally {
      setBooking(false);
    }
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
            {booked.conferencing === "native" ? "." : " souveraine."}
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

      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>Visio</span>
        {([
          { key: "sovereign", label: "Souveraine" },
          { key: "native", label: "Teams / Meet" },
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
        {conferencing === "native"
          ? "Crée une réunion Teams (Outlook) ou Google Meet (Gmail) selon votre agenda connecté, et invite le contact."
          : "Ajoute l'événement à votre agenda connecté avec un lien de visio souveraine, et invite le contact."}
      </p>
      </>
      )}
    </div>
  );
}
