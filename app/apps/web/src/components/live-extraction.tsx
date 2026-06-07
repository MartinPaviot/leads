"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Users, Banknote, Wrench, Swords } from "lucide-react";

interface LiveExtractionProps {
  meetingId: string;
  isRecording: boolean;
}

interface ExtractionData {
  budget: string | null;
  teamSize: string | null;
  currentTools: string[];
  competitors: string[];
  sentiment: "positive" | "neutral" | "negative";
}

export function LiveExtraction({ meetingId, isRecording }: LiveExtractionProps) {
  const [data, setData] = useState<ExtractionData | null>(null);
  const [isLive, setIsLive] = useState(isRecording);
  const [message, setMessage] = useState("Waiting for transcript data...");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!meetingId) return;

    async function poll() {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/live`);
        if (res.ok) {
          const json = await res.json();
          setIsLive(json.isLive);
          if (json.extraction) setData(json.extraction);
          if (json.message) setMessage(json.message);
        }
      } catch (e) {
        console.warn("live-extraction: poll failed", e);
      }
    }

    poll(); // Initial fetch
    if (isRecording) {
      intervalRef.current = setInterval(poll, 10000); // Poll every 10s
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [meetingId, isRecording]);

  // Stop polling when call ends
  useEffect(() => {
    if (!isLive && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isLive]);

  const fields = [
    { Icon: Users, label: "Team Size", value: data?.teamSize },
    { Icon: Banknote, label: "Budget", value: data?.budget },
    { Icon: Wrench, label: "Current Tools", value: data?.currentTools?.length ? data.currentTools.join(", ") : null },
    { Icon: Swords, label: "Competitors", value: data?.competitors?.length ? data.competitors.join(", ") : null },
  ];

  const hasAnyData = fields.some((f) => f.value);

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: isLive ? "var(--color-accent-soft)" : "var(--color-bg-page)",
        border: `1px solid ${isLive ? "color-mix(in srgb, var(--color-accent) 30%, transparent)" : "var(--color-border-default)"}`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {isLive && <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />}
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: isLive ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>
          {isLive ? "Live Extraction — Updating..." : "Meeting Intelligence"}
        </span>
        {data?.sentiment && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: data.sentiment === "positive" ? "var(--color-success-soft)" : data.sentiment === "negative" ? "var(--color-error-soft)" : "var(--color-bg-hover)",
              color: data.sentiment === "positive" ? "var(--color-success)" : data.sentiment === "negative" ? "var(--color-error)" : "var(--color-text-secondary)",
            }}
          >
            {data.sentiment}
          </span>
        )}
      </div>

      {hasAnyData ? (
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.label} className="flex items-start gap-2">
              <f.Icon size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
              <div>
                <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{f.label}</p>
                {f.value ? (
                  <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{f.value}</p>
                ) : (
                  <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                    {isLive ? "Listening..." : "—"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          {message}
        </p>
      )}
    </div>
  );
}
