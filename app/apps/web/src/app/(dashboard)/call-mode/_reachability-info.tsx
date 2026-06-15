"use client";

/**
 * Discreet reachability affordance for a call-list row: a small Info icon
 * that reveals, on hover, the honest facts about this prospect's number,
 * role and coordinate freshness (see lib/calllist/reachability). Read-only
 * by design — it lives INSIDE the row <button>, so the trigger is a <span>
 * (never a nested button) and pointer events are stopped so glancing at the
 * info never selects the call. Actions (find a mobile, verify the role) stay
 * in the pre-call brief, which has room for buttons.
 *
 * No emoji — the Lucide Info icon + colored status dots carry the meaning.
 */

import { useRef, useState } from "react";
import { Info } from "lucide-react";
import {
  computeReachability,
  reachStateLabel,
  type ReachabilityInput,
  type ReachTone,
} from "@/lib/calllist/reachability";
import { requestFindMobile } from "./_find-mobile";

const DOT: Record<ReachTone, string> = {
  good: "var(--color-success, #10b981)",
  warn: "#f59e0b",
  muted: "#a1a1aa",
};

export function ReachabilityInfo(props: ReachabilityInput & { contactId?: string; delay?: number }) {
  const { delay = 120, contactId, ...input } = props;
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState<"idle" | "pending" | "done" | "error">("idle");
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { state, facts } = computeReachability(input);

  async function trouver(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!contactId || find === "pending" || find === "done") return;
    setFind("pending");
    const r = await requestFindMobile([contactId]);
    setFind(r.ok ? "done" : "error");
  }

  // Icon tint hints at the state without shouting: amber when something wants
  // a look, neutral otherwise.
  const tint = state === "a_verifier" ? "#f59e0b" : state === "sans_mobile" ? "#a1a1aa" : "#a1a1aa";

  function show() {
    t.current = setTimeout(() => setOpen(true), delay);
  }
  function hide() {
    if (t.current) clearTimeout(t.current);
    setOpen(false);
  }

  return (
    // span, not button: this sits inside the row's <button>. stopPropagation
    // so hovering/clicking the info never triggers the row's onClick (select).
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <Info className="h-3.5 w-3.5 shrink-0" style={{ color: tint }} aria-label={`Joignabilité : ${reachStateLabel(state)}`} />
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border p-2 text-left"
          style={{
            background: "var(--color-bg-page, #fff)",
            borderColor: "var(--color-border, rgba(0,0,0,.1))",
            boxShadow: "0 6px 20px rgba(0,0,0,.14)",
          }}
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Joignabilité · {reachStateLabel(state)}
          </div>
          <ul className="space-y-1">
            {facts.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: DOT[f.tone] }}
                />
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
          {/* Action only when there's no number to call. A span (role=button),
              not a <button>, because this lives inside the row's <button>. */}
          {contactId && state === "sans_mobile" && (
            <span
              role="button"
              tabIndex={0}
              onClick={trouver}
              className={`mt-2 block w-full rounded border px-2 py-1 text-center text-[11px] font-medium transition ${
                find === "idle"
                  ? "cursor-pointer border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  : "border-transparent text-zinc-400"
              }`}
            >
              {find === "idle"
                ? "Trouver le mobile"
                : find === "pending"
                  ? "Recherche…"
                  : find === "done"
                    ? "Demandé · résultat sous peu"
                    : "Échec — réessayer"}
            </span>
          )}
        </div>
      )}
    </span>
  );
}
