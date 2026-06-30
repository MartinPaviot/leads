"use client";

/**
 * Contact fiche — past-calls panel with the durable transcript viewer.
 *
 * The live bridge persists each call's transcript to `calls.transcript`; this
 * surfaces it long after the call: outcome + sentiment + summary up top, the
 * speaker-labelled transcript and buying signals on expand, plus the recording.
 */

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, Phone } from "lucide-react";

interface Chunk {
  speaker?: string;
  text?: string;
  tsMs?: number;
}
interface BuyingSignals {
  budget?: string | null;
  timeline?: string | null;
  currentStack?: string[];
  painPoints?: string[];
  objections?: string[];
  nextSteps?: string[];
  competitors?: string[];
  teamSize?: string | null;
}
interface CallRow {
  id: string;
  createdAt: string;
  durationSec: number | null;
  outcome: string | null;
  sentiment: string | null;
  summary: string | null;
  fromNumber: string | null;
  buyingSignals: BuyingSignals | null;
  transcriptChunkCount: number;
  transcript: Chunk[];
  recordingUrl: string | null;
}

const OUTCOME_LABEL: Record<string, string> = {
  connected: "Connected",
  meeting_booked: "Meeting booked",
  callback_requested: "Callback",
  no_answer: "No answer",
  busy: "Busy",
  voicemail_left: "Voicemail",
  not_interested: "Not interested",
  gatekeeper: "Gatekeeper",
  wrong_number: "Wrong number",
  do_not_call: "Do not call",
  failed: "Failed",
};

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sentimentColor(s: string | null): string {
  if (s === "positive") return "var(--color-success)";
  if (s === "negative") return "var(--color-error)";
  return "var(--color-text-tertiary)";
}

export function ContactCalls({ contactId }: { contactId: string }) {
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/contacts/${contactId}/calls`);
        const data = res.ok ? await res.json() : { calls: [] };
        if (!cancelled) setCalls(data.calls ?? []);
      } catch {
        if (!cancelled) setCalls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Nothing to show until we know there's at least one call — and stay silent
  // while the fetch is in flight, so a never-called contact (the common case on
  // a LinkedIn-primary tenant) doesn't see a "Calls — Loading…" header flash in
  // and then collapse. Mirrors the home hot-widget `if (loading) return null`.
  if (calls === null || calls.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        <Phone size={13} /> Calls ({calls.length})
      </h3>
      <div className="mt-3 space-y-2">
          {calls.map((c) => {
            const open = expanded.has(c.id);
            const hasTranscript = c.transcript.length > 0;
            return (
              <div
                key={c.id}
                className="rounded-lg border"
                style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                        {c.outcome ? OUTCOME_LABEL[c.outcome] ?? c.outcome : "Call"}
                      </span>
                      {c.sentiment && (
                        <span className="text-[11px] font-medium capitalize" style={{ color: sentimentColor(c.sentiment) }}>
                          {c.sentiment}
                        </span>
                      )}
                      <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {new Date(c.createdAt).toLocaleString()}
                        {fmtDuration(c.durationSec) ? ` · ${fmtDuration(c.durationSec)}` : ""}
                      </span>
                    </div>
                    {c.summary && (
                      <p className="mt-1 line-clamp-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                        {c.summary}
                      </p>
                    )}
                    {!c.summary && (
                      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {hasTranscript ? `${c.transcript.length} transcript lines` : "No transcript captured"}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    size={16}
                    className="mt-0.5 shrink-0 transition-transform"
                    style={{ color: "var(--color-text-tertiary)", transform: open ? "rotate(180deg)" : "none" }}
                  />
                </button>

                {open && (
                  <div className="border-t px-3.5 py-3" style={{ borderColor: "var(--color-border-default)" }}>
                    <BuyingSignalsChips signals={c.buyingSignals} />
                    {hasTranscript ? (
                      <div className="space-y-1.5">
                        {c.transcript.map((ch, i) => {
                          const isProspect = ch.speaker === "prospect";
                          return (
                            <div key={i} className="flex gap-2 text-[13px] leading-snug">
                              <span
                                className="shrink-0 select-none text-[10px] font-semibold uppercase tracking-wide"
                                style={{ width: 60, color: isProspect ? "var(--color-accent)" : "var(--color-text-tertiary)" }}
                              >
                                {isProspect ? "Prospect" : ch.speaker === "agent" ? "You" : ch.speaker ?? ""}
                              </span>
                              <span style={{ color: "var(--color-text-primary)" }}>{ch.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                        No speech was captured on this call.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function BuyingSignalsChips({ signals }: { signals: BuyingSignals | null }) {
  if (!signals) return null;
  const chips: { label: string; value: string }[] = [];
  if (signals.budget) chips.push({ label: "Budget", value: signals.budget });
  if (signals.timeline) chips.push({ label: "Timeline", value: signals.timeline });
  if (signals.teamSize) chips.push({ label: "Team", value: signals.teamSize });
  for (const p of signals.painPoints ?? []) chips.push({ label: "Pain", value: p });
  for (const o of signals.objections ?? []) chips.push({ label: "Objection", value: o });
  for (const s of signals.currentStack ?? []) chips.push({ label: "Stack", value: s });
  for (const c of signals.competitors ?? []) chips.push({ label: "Competitor", value: c });
  for (const n of signals.nextSteps ?? []) chips.push({ label: "Next", value: n });
  if (chips.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {chips.map((ch, i) => (
        <span
          key={i}
          className="rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
        >
          <span className="font-semibold" style={{ color: "var(--color-text-tertiary)" }}>
            {ch.label}:
          </span>{" "}
          {ch.value}
        </span>
      ))}
    </div>
  );
}
