"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/** Mirror of lib/collision LastTouchByOthers (the fields this surface renders). */
interface LastTouch {
  userName: string;
  channel: "call" | "email" | "other";
  outcome: string | null;
  daysAgo: number;
  otherUserCount: number;
}

const CHANNEL_VERB: Record<LastTouch["channel"], string> = {
  call: "appelé",
  email: "écrit à",
  other: "contacté",
};

function whenLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "aujourd'hui";
  if (daysAgo === 1) return "hier";
  return `il y a ${daysAgo} j`;
}

/**
 * Collision awareness — a soft, NON-BLOCKING heads-up at the top of the Call
 * Mode brief: a teammate has already worked this prospect recently, so the rep
 * doesn't double-dial someone a colleague just called. Driven by real activity
 * attribution (who actually called/emailed), not the owner field.
 *
 * Self-contained: it fetches /api/collision/contact itself, decoupled from the
 * brain load. Fail-closed — any error or "no collision" renders nothing, and it
 * NEVER disables the Call action (visibility/ownership unchanged; this only
 * informs).
 */
export function CollisionWarning({ contactId }: { contactId: string | null | undefined }) {
  const [touch, setTouch] = useState<LastTouch | null>(null);

  useEffect(() => {
    if (!contactId) {
      setTouch(null);
      return;
    }
    let alive = true;
    setTouch(null);
    fetch(`/api/collision/contact?contactId=${encodeURIComponent(contactId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setTouch((d?.collision as LastTouch | null) ?? null);
      })
      .catch(() => {
        if (alive) setTouch(null);
      });
    return () => {
      alive = false;
    };
  }, [contactId]);

  if (!touch) return null;

  const verb = CHANNEL_VERB[touch.channel] ?? "contacté";
  const extra = touch.otherUserCount - 1;
  const others = extra > 0 ? ` (+${extra} autre${extra > 1 ? "s" : ""})` : "";

  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]"
      style={{ background: "rgba(217,119,6,.08)" }}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 leading-snug text-zinc-800 dark:text-zinc-100">
        <span className="font-medium">{touch.userName}</span> a déjà {verb} ce prospect{" "}
        {whenLabel(touch.daysAgo)}
        {others}. Vérifie l&apos;historique avant d&apos;appeler.
      </span>
    </div>
  );
}
