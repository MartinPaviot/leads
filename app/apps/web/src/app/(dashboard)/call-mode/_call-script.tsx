"use client";

/**
 * In-call script panel — permission-based, driven by {sector × geography}.
 * Renders the resolved CallScript (opener naming 1-3 sector/geo problems →
 * validation → 45-min booking ask), with the problems checkable as the
 * prospect validates. Sector/geo are editable (pre-filled from the
 * prospect when known) so the rep can retarget per call.
 *
 * No emoji per the brand rule — Lucide icons only.
 */

import { useMemo, useState } from "react";
import { Check, CalendarClock, Phone } from "lucide-react";
import { resolveCallScript } from "@/lib/call-mode/call-scripts";

export function CallScriptPanel({
  contactName,
  defaultSector,
  defaultGeo,
}: {
  contactName?: string | null;
  defaultSector?: string | null;
  defaultGeo?: string | null;
}) {
  const [sector, setSector] = useState(defaultSector ?? "");
  const [geo, setGeo] = useState(defaultGeo ?? "");
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const script = useMemo(
    () => resolveCallScript({ sector, geo, contactName }),
    [sector, geo, contactName],
  );
  const anyChecked = checked.size > 0;

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const inputStyle = {
    background: "var(--color-bg-base)",
    border: "1px solid var(--color-border-default)",
    color: "var(--color-text-primary)",
  } as const;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-3.5"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div className="flex items-center gap-2">
        <Phone size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Script d'appel
        </span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          Permission-based · 7-8 min · décideur d'abord
        </span>
      </div>

      <div className="flex gap-2">
        <input
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="Secteur (ex. Santé, Fondation)"
          className="flex-1 rounded-md px-2 py-1 text-[12px]"
          style={inputStyle}
        />
        <input
          value={geo}
          onChange={(e) => setGeo(e.target.value)}
          placeholder="Géographie (ex. Genève)"
          className="flex-1 rounded-md px-2 py-1 text-[12px]"
          style={inputStyle}
        />
      </div>

      {/* Opener — read aloud */}
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
        {script.opener}
      </p>

      {/* Problems — check what resonates */}
      <div className="flex flex-col gap-1.5">
        {script.problems.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
              style={{
                borderColor: checked.has(i) ? "var(--color-accent)" : "var(--color-border-default)",
                background: checked.has(i) ? "var(--color-accent)" : "transparent",
              }}
            >
              {checked.has(i) && <Check size={11} color="#fff" />}
            </span>
            <span>{p}</span>
          </button>
        ))}
      </div>

      <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
        {script.permissionCheck}
      </p>

      {/* Booking ask — lights up once a problem resonates */}
      <div
        className="flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]"
        style={{
          background: anyChecked ? "var(--color-accent-soft)" : "var(--color-bg-hover)",
          color: anyChecked ? "var(--color-accent)" : "var(--color-text-tertiary)",
        }}
      >
        <CalendarClock size={14} className="mt-0.5 shrink-0" />
        <span>{script.bookingAsk}</span>
      </div>

      <ul className="flex flex-col gap-0.5">
        {script.guidance.map((g, i) => (
          <li key={i} className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {g}
          </li>
        ))}
      </ul>
    </div>
  );
}
