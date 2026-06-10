"use client";

/**
 * Up Next — the founder's morning briefing.
 *
 * One ranked "Needs you" queue (Hero = the single most important item), a
 * synthesised "Handled for you" ledger, and one honest engine-health line.
 * Sourced from /api/home/up-next (live data only). Inline actions reuse the
 * existing endpoints; acting on a card collapses it out (height/opacity only).
 *
 * See _specs/up-next-redesign/.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, AlertTriangle, Calendar, CheckSquare, CheckCircle2, Compass,
  ArrowRight, Loader2, Clock, ChevronDown, Sparkles, Check, X,
} from "lucide-react";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";
import { ledgerSentence, type LedgerGroup } from "@/lib/home/up-next";

type Kind = "approval" | "reply" | "deal_risk" | "meeting" | "task";
type Tone = "approval" | "reply" | "risk" | "meeting" | "task";

interface Item {
  id: string;
  kind: Kind;
  tone: Tone;
  title: string;
  subtitle: string | null;
  why: string;
  stakes: string | null;
  entityType: string | null;
  entityId: string | null;
  contactId: string | null;
  conversationKey: string | null;
  toAddress: string | null;
  actionId: string | null;
  confidence: number | null;
  href: string | null;
}

interface Payload {
  hero: Item | null;
  items: Item[];
  ledger: LedgerGroup[];
  engine: { text: string; cta: { label: string; href: string } | null };
  greeting: string;
  firstName: string | null;
}

const TONE: Record<Tone, string> = {
  approval: "var(--color-warning)",
  reply: "var(--color-accent)",
  risk: "var(--color-error)",
  meeting: "var(--color-badge-1)", // teal
  task: "var(--color-text-tertiary)",
};

const ICON: Record<Kind, typeof Mail> = {
  approval: CheckCircle2,
  reply: Mail,
  deal_risk: AlertTriangle,
  meeting: Calendar,
  task: CheckSquare,
};

const KIND_LABEL: Record<Kind, string> = {
  approval: "Approve",
  reply: "Reply",
  deal_risk: "Needs a nudge",
  meeting: "Meeting",
  task: "Task",
};

function tomorrow9amIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function UpNextView() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/home/up-next");
      if (res.ok) setData(await res.json());
    } catch {
      /* keep last good */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Drop an item with a collapse animation, then remove from state.
  const dropItem = useCallback((id: string) => {
    setRemoving((s) => new Set(s).add(id));
    setTimeout(() => {
      setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id), hero: d.hero?.id === id ? null : d.hero } : d));
      setRemoving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 200);
  }, []);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok;
  }

  async function onAction(item: Item, action: "approve" | "skip" | "snooze" | "done" | "reply" | "open") {
    if (action === "open") {
      if (item.href) router.push(item.href);
      return;
    }
    if (action === "reply") {
      setComposer({
        to: item.toAddress || "",
        subject: item.subtitle ? `Re: ${item.subtitle}` : "Re: your message",
        body: "",
        ...(item.contactId ? { contactId: item.contactId } : {}),
      });
      return;
    }
    // Optimistic collapse, fire endpoint.
    dropItem(item.id);
    let ok = false;
    if (action === "approve" && item.actionId) ok = await post(`/api/agent-actions/${item.actionId}/approve`);
    else if (action === "skip" && item.actionId) ok = await post(`/api/agent-actions/${item.actionId}/reverse`);
    else if ((action === "snooze" || action === "done") && item.conversationKey)
      ok = await post(`/api/inbox/triage`, {
        conversationKey: item.conversationKey,
        action: action === "snooze" ? "snooze" : "done",
        ...(action === "snooze" ? { snoozeUntil: tomorrow9amIso() } : {}),
      });
    if (!ok) void fetchData(); // resync on failure (re-adds the item)
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1080px] items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  const greeting = `${data?.greeting ?? "Welcome back"}${data?.firstName ? `, ${data.firstName}` : ""}`;
  const hero = data?.hero ?? null;
  const queue = (data?.items ?? []).filter((i) => i.id !== hero?.id);
  const ledger = (data?.ledger ?? []).filter((g) => g.count > 0);

  return (
    <div className="mx-auto max-w-[1080px] animate-content-in">
      {/* Greeting */}
      <h1 className="text-[26px] font-bold tracking-[-0.02em]" style={{ color: "var(--color-text-primary)" }}>
        {greeting}
      </h1>

      {hero ? (
        <>
          <HeroCard item={hero} onAction={onAction} removing={removing.has(hero.id)} />
          {queue.length > 0 && (
            <section className="mt-7">
              <SectionLabel>
                Needs you
                <span className="ml-1.5 font-normal" style={{ color: "var(--color-text-muted)" }}>
                  {queue.length}
                </span>
              </SectionLabel>
              <div className="mt-2.5 space-y-2">
                {queue.map((item, idx) => (
                  <Collapsing key={item.id} removing={removing.has(item.id)}>
                    <QueueCard item={item} onAction={onAction} delayMs={idx * 35} />
                  </Collapsing>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <ClearState />
      )}

      {/* Handled for you — synthesised, collapsed by default */}
      {ledger.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setLedgerOpen((v) => !v)}
            className="flex w-full items-center gap-2"
          >
            <SectionLabel as="span">
              <Sparkles size={11} className="mr-1 inline" style={{ color: "var(--color-badge-1)" }} />
              Handled for you
            </SectionLabel>
            <ChevronDown
              size={14}
              className="transition-transform"
              style={{ color: "var(--color-text-muted)", transform: ledgerOpen ? "rotate(180deg)" : "none" }}
            />
          </button>

          {/* Always show the one-line synthesis; expand for the per-type rows. */}
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {ledger.slice(0, 3).map((g) => ledgerSentence(g)).join(" · ")}
            {ledger.length > 3 ? ` · +${ledger.length - 3} more` : ""}
          </p>

          {ledgerOpen && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ledger.map((g) => (
                <div
                  key={g.trigger}
                  className="rounded-lg p-3"
                  style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {g.verb}
                    </span>
                    <span className="text-[12px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
                      {g.count}
                    </span>
                  </div>
                  {g.samples.length > 0 && (
                    <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {g.samples.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Engine-health line — one number, one lever */}
      {data?.engine && (
        <section className="mt-8">
          <div
            className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Compass size={15} className="shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
              <span className="truncate text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                {data.engine.text}
              </span>
            </div>
            {data.engine.cta && (
              <button
                type="button"
                onClick={() => router.push(data.engine!.cta!.href)}
                className="flex shrink-0 items-center gap-1 text-[12px] font-medium hover:underline"
                style={{ color: "var(--color-accent)" }}
              >
                {data.engine.cta.label}
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </section>
      )}

      {composer && <EmailComposerPanel draft={composer} onClose={() => setComposer(null)} />}
    </div>
  );
}

// ── Hero ────────────────────────────────────────────────────────────

function HeroCard({ item, onAction, removing }: { item: Item; onAction: ActionFn; removing: boolean }) {
  const Icon = ICON[item.kind];
  const tint = TONE[item.tone];
  return (
    <Collapsing removing={removing}>
      <div
        className="mt-4 overflow-hidden rounded-2xl"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-panel)" }}
      >
        <div style={{ height: "3px", background: "var(--gradient-brand)" }} />
        <div className="p-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)` }}>
              <Icon size={13} style={{ color: tint }} />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tint }}>
              {KIND_LABEL[item.kind]}
            </span>
            <span className="ml-auto text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Start here
            </span>
          </div>

          <p className="mt-2.5 text-[20px] font-semibold leading-snug tracking-[-0.01em]" style={{ color: "var(--color-text-primary)" }}>
            {item.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            <span>{item.why}</span>
            {item.subtitle && <Dot />}
            {item.subtitle && <span style={{ color: "var(--color-text-tertiary)" }}>{item.subtitle}</span>}
            {item.stakes && <Dot />}
            {item.stakes && <span className="font-medium" style={{ color: "var(--color-success)" }}>{item.stakes}</span>}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Actions item={item} onAction={onAction} primarySize="lg" />
          </div>
        </div>
      </div>
    </Collapsing>
  );
}

// ── Queue card ──────────────────────────────────────────────────────

function QueueCard({ item, onAction, delayMs }: { item: Item; onAction: ActionFn; delayMs: number }) {
  const Icon = ICON[item.kind];
  const tint = TONE[item.tone];
  return (
    <div
      className="group flex items-center gap-3 rounded-xl p-3.5 animate-content-in"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
        borderLeft: `3px solid ${tint}`,
        boxShadow: "var(--shadow-card)",
        animationDelay: `${delayMs}ms`,
      }}
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tint} 12%, transparent)` }}>
        <Icon size={14} style={{ color: tint }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {item.title}
          </span>
          {item.stakes && (
            <span className="shrink-0 text-[12px] font-medium" style={{ color: "var(--color-success)" }}>{item.stakes}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-x-2 truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          <span className="truncate">{item.why}</span>
          {item.subtitle && <Dot />}
          {item.subtitle && <span className="truncate">{item.subtitle}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Actions item={item} onAction={onAction} primarySize="sm" />
      </div>
    </div>
  );
}

// ── Action buttons (shared by hero + queue) ─────────────────────────

type ActionFn = (item: Item, action: "approve" | "skip" | "snooze" | "done" | "reply" | "open") => void;

function Actions({ item, onAction, primarySize }: { item: Item; onAction: ActionFn; primarySize: "lg" | "sm" }) {
  const lg = primarySize === "lg";
  const primaryCls = lg
    ? "rounded-lg px-4 py-2 text-[13px] font-semibold"
    : "rounded-lg px-3 py-1.5 text-[12px] font-semibold";
  const ghostCls = lg
    ? "rounded-lg px-3 py-2 text-[13px] font-medium"
    : "rounded-lg px-2.5 py-1.5 text-[12px] font-medium";
  const ghostStyle = { background: "var(--color-bg-muted)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" } as const;

  if (item.kind === "approval") {
    return (
      <>
        <button onClick={() => onAction(item, "approve")} className={`gradient-brand text-white ${primaryCls}`} style={{ boxShadow: "var(--shadow-button)" }}>
          <span className="inline-flex items-center gap-1"><Check size={lg ? 15 : 13} /> Approve</span>
        </button>
        <button onClick={() => onAction(item, "skip")} className={ghostCls} style={ghostStyle} title="Skip — don't send">
          {lg ? "Skip" : <X size={13} />}
        </button>
      </>
    );
  }
  if (item.kind === "reply") {
    return (
      <>
        <button onClick={() => onAction(item, "reply")} className={`gradient-brand text-white ${primaryCls}`} style={{ boxShadow: "var(--shadow-button)" }}>
          Reply
        </button>
        <button onClick={() => onAction(item, "snooze")} className={ghostCls} style={ghostStyle} title="Snooze to tomorrow">
          {lg ? "Snooze" : <Clock size={13} />}
        </button>
        <button onClick={() => onAction(item, "done")} className={ghostCls} style={ghostStyle} title="Mark done">
          {lg ? "Done" : <Check size={13} />}
        </button>
      </>
    );
  }
  // deal_risk / meeting / task — open the entity
  return (
    <button onClick={() => onAction(item, "open")} className={`${lg ? primaryCls : ghostCls}`} style={lg ? { background: "var(--color-accent)", color: "#fff" } : ghostStyle}>
      <span className="inline-flex items-center gap-1">
        {item.kind === "deal_risk" ? "Open deal" : "Open"} <ArrowRight size={lg ? 15 : 13} />
      </span>
    </button>
  );
}

// ── small pieces ────────────────────────────────────────────────────

function SectionLabel({ children, as: As = "h2" }: { children: React.ReactNode; as?: "h2" | "span" }) {
  return (
    <As className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
      {children}
    </As>
  );
}

function Dot() {
  return <span style={{ color: "var(--color-text-placeholder)" }}>·</span>;
}

/** Height+opacity collapse on removal — layout/opacity only, no GPU compositing. */
function Collapsing({ removing, children }: { removing: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-all duration-200 ease-out"
      style={{ gridTemplateRows: removing ? "0fr" : "1fr", opacity: removing ? 0 : 1 }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function ClearState() {
  return (
    <div
      className="mt-4 flex items-center gap-3 rounded-2xl p-5"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-card)" }}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--gradient-brand)" }}>
        <CheckCircle2 size={18} style={{ color: "#fff" }} />
      </span>
      <div>
        <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          You&apos;re clear for the morning
        </p>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          The agent is watching your accounts and will surface anything that needs you here.
        </p>
      </div>
    </div>
  );
}
