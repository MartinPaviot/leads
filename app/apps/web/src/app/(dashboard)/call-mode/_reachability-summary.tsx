"use client";

/**
 * Aggregate reachability glance for the whole call list — a thin strip under
 * the list header: how many rows are ready to dial, how many want a look, how
 * many have no mobile, plus a one-click bulk "find the missing mobiles" that
 * fans the numberless contacts into the enrich engine. No emoji (status dots);
 * provenance/vendor never named.
 */

import { useState } from "react";
import {
  summarizeReachability,
  lacksMobile,
  type ReachabilityInput,
} from "@/lib/calllist/reachability";
import { requestFindMobile } from "./_find-mobile";

type Item = ReachabilityInput & { contactId: string };

function Dot({ color }: { color: string }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

export function ReachabilitySummary({ items }: { items: Item[] }) {
  const [find, setFind] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [requested, setRequested] = useState(0);

  const s = summarizeReachability(items);
  if (s.total === 0) return null;
  const missing = items.filter(lacksMobile).map((i) => i.contactId);

  async function bulk() {
    if (find === "pending" || find === "done" || missing.length === 0) return;
    setFind("pending");
    const r = await requestFindMobile(missing);
    setRequested(r.requested ?? missing.length);
    setFind(r.ok ? "done" : "error");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-default)] px-3 py-1.5 dark:border-zinc-800/60">
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1">
          <Dot color="var(--color-success)" />
          {s.joignable} prêt{s.joignable === 1 ? "" : "s"}
        </span>
        {s.aVerifier > 0 && (
          <span className="flex items-center gap-1">
            <Dot color="var(--color-warning)" />
            {s.aVerifier} à vérifier
          </span>
        )}
        {s.sansMobile > 0 && (
          <span className="flex items-center gap-1">
            <Dot color="var(--color-text-muted)" />
            {s.sansMobile} sans mobile
          </span>
        )}
      </span>
      {missing.length > 0 && (
        <button
          type="button"
          onClick={bulk}
          disabled={find === "pending" || find === "done"}
          className={`min-w-0 max-w-[60%] shrink-0 truncate rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
            find === "idle"
              ? "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              : "border-transparent text-zinc-400"
          }`}
        >
          {find === "idle"
            ? `Trouver ${missing.length} mobile${missing.length > 1 ? "s" : ""}`
            : find === "pending"
              ? "Recherche…"
              : find === "done"
                ? `${requested} demandé${requested > 1 ? "s" : ""} · résultat sous peu`
                : "Échec — réessayer"}
        </button>
      )}
    </div>
  );
}
