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

type Lang = "en" | "fr";

const COPY: Record<
  Lang,
  {
    verb: Record<LastTouch["channel"], string>;
    when: (d: number) => string;
    others: (n: number) => string;
    mid: (verb: string, when: string, others: string) => string;
    tail: string;
  }
> = {
  en: {
    verb: { call: "called", email: "emailed", other: "contacted" },
    when: (d) => (d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`),
    others: (n) => (n > 0 ? ` (+${n} other${n > 1 ? "s" : ""})` : ""),
    mid: (verb, when, others) => ` already ${verb} this prospect ${when}${others}`,
    tail: ". Check the history first.",
  },
  fr: {
    verb: { call: "appelé", email: "écrit à", other: "contacté" },
    when: (d) => (d <= 0 ? "aujourd'hui" : d === 1 ? "hier" : `il y a ${d} j`),
    others: (n) => (n > 0 ? ` (+${n} autre${n > 1 ? "s" : ""})` : ""),
    mid: (verb, when, others) => ` a déjà ${verb} ce prospect ${when}${others}`,
    tail: ". Vérifie l'historique.",
  },
};

/**
 * Collision awareness — a soft, NON-BLOCKING heads-up that a teammate already
 * worked this prospect recently, so the rep doesn't double-call or double-email
 * someone a colleague just contacted. Driven by real activity attribution (who
 * actually called/emailed), not the owner field.
 *
 * Self-contained: fetches /api/collision/contact itself. Fail-closed — any error
 * or "no collision" renders nothing, and it NEVER disables the surrounding
 * action (Call / Send). `lang` matches the host surface (Call Mode = fr,
 * the composer + entity pages = en).
 */
export function ContactCollisionNotice({
  contactId,
  lang = "en",
}: {
  contactId: string | null | undefined;
  lang?: Lang;
}) {
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

  const c = COPY[lang];
  const verb = c.verb[touch.channel] ?? c.verb.other;
  const extra = touch.otherUserCount - 1;

  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]"
      style={{ background: "rgba(217,119,6,.08)" }}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 leading-snug text-zinc-800 dark:text-zinc-100">
        <span className="font-medium">{touch.userName}</span>
        {c.mid(verb, c.when(touch.daysAgo), c.others(extra))}
        {c.tail}
      </span>
    </div>
  );
}
