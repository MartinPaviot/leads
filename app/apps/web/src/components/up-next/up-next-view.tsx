"use client";

/**
 * Up Next — the founder's dashboard.
 *
 * KPIs (the metrics that matter) + Actualités (a cross-page feed of REAL events:
 * replies, email opens, inbound forms, calls with outcomes, deal lifecycle
 * events, meetings, adds with provenance) + À faire (genuine human work only —
 * replies to answer, calls to prep, live deals at risk). No reflexive agent
 * actions. Reads /api/home/up-next. DNA: dense data, 0.5px borders, lucide
 * icons, one accent, no emoji (design-language.md).
 */

import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, MailOpen, AlertTriangle, Calendar, CheckSquare, CheckCircle2, CalendarPlus,
  Building2, UserPlus, TrendingUp, ArrowRight, ArrowUpRight, Loader2, Send,
  Inbox, Phone, BadgeCheck, XCircle,
} from "lucide-react";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";

interface Kpi { key: string; label: string; value: string; sub: string | null; delta: number | null; }
type ActualiteKind =
  | "deal" | "deal_won" | "deal_lost" | "reply" | "open" | "form" | "call"
  | "meeting_booked" | "meeting_done" | "account" | "contact" | "campaign";
interface Actualite { id: string; kind: ActualiteKind; title: string; detail: string | null; at: string | null; href: string | null; }
type TodoKind = "reply" | "deal_risk" | "meeting" | "task";
interface Todo {
  id: string; kind: TodoKind; tone: string; title: string; subtitle: string | null; why: string;
  stakes: string | null; entityId: string | null; contactId: string | null; conversationKey: string | null;
  toAddress: string | null; href: string | null;
}
interface Payload { greeting: string; firstName: string | null; kpis: Kpi[]; actualites: Actualite[]; todos: Todo[]; }

const ACT_ICON: Record<ActualiteKind, typeof Mail> = {
  deal: TrendingUp, deal_won: BadgeCheck, deal_lost: XCircle, reply: Mail, open: MailOpen,
  form: Inbox, call: Phone, meeting_booked: CalendarPlus, meeting_done: CheckCircle2,
  account: Building2, contact: UserPlus, campaign: Send,
};
// Every activity chip carries a variant of the brand gradient (teal→blue→orange,
// like the gradient-brand buttons) with a white glyph. Hue families keep the
// semantics readable: email events in blues, inbound heat in oranges, calls in
// indigo→purple, deals in teal→green (lost = red family), people & companies on
// the full 3-stop brand run. Linear only (no radial/blur — GPU-safe).
const ACT_GRADIENT: Record<ActualiteKind, string> = {
  reply: "linear-gradient(135deg, #2C6BED 0%, #17C3B2 100%)",
  open: "linear-gradient(135deg, #0EA5E9 0%, #2C6BED 100%)",
  form: "linear-gradient(135deg, #FF7A3D 0%, #F59E0B 100%)",
  call: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
  deal: "linear-gradient(135deg, #17C3B2 0%, #10B981 100%)",
  deal_won: "linear-gradient(135deg, #10B981 0%, #2C6BED 100%)",
  deal_lost: "linear-gradient(135deg, #EF4444 0%, #E8653A 100%)",
  meeting_booked: "linear-gradient(135deg, #17C3B2 0%, #2C6BED 100%)",
  meeting_done: "linear-gradient(135deg, #94A3B8 0%, #64748B 100%)",
  account: "linear-gradient(135deg, #17C3B2 0%, #2C6BED 52%, #FF7A3D 100%)",
  contact: "linear-gradient(135deg, #2C6BED 0%, #8B5CF6 50%, #FF7A3D 100%)",
  campaign: "linear-gradient(135deg, #F59E0B 0%, #FF7A3D 100%)",
};
const TODO_ICON: Record<TodoKind, typeof Mail> = { reply: Mail, deal_risk: AlertTriangle, meeting: Calendar, task: CheckSquare };
const TODO_TINT: Record<string, string> = {
  reply: "var(--color-accent)", risk: "var(--color-error)", meeting: "var(--color-badge-1)", task: "var(--color-text-tertiary)",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/**
 * CLE-14: imperative handle the /home page lifts so the chat live-executor can
 * drive the SAME handlers the user's buttons drive (one code path, parity by
 * construction). `replyTo` opens the reply composer for a `reply` todo;
 * `openItem` runs the row's navigation. The page reads this via `apiRef`.
 */
export interface UpNextApi {
  replyTo: (todoId: string) => { ok: boolean; subject?: string };
  openItem: (id: string, kind: "todo" | "actualite") => { ok: boolean };
}

export function UpNextView({ apiRef }: { apiRef?: Ref<UpNextApi | null> } = {}) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/home/up-next");
      if (res.ok) setData(await res.json());
    } catch { /* keep last good */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  function onTodo(item: Todo) {
    if (item.kind === "reply") {
      setComposer({
        to: item.toAddress || "",
        subject: item.subtitle ? `Re: ${item.subtitle}` : "Re: your message",
        body: "",
        ...(item.contactId ? { contactId: item.contactId } : {}),
      });
      return;
    }
    if (item.href) router.push(item.href);
  }

  // CLE-14: expose reply/open to the page so the chat can drive them. `data` is
  // read live inside the closures; re-expose when it changes. Mirrors the
  // ScriptPanelApi lift in /call-mode (CLE-09).
  useImperativeHandle(
    apiRef,
    (): UpNextApi => ({
      replyTo: (todoId: string) => {
        const t = data?.todos.find((x) => x.id === todoId);
        if (!t || t.kind !== "reply") return { ok: false };
        onTodo(t); // reuses the page handler verbatim — opens the composer
        return { ok: true, subject: t.subtitle ?? undefined };
      },
      openItem: (id: string, kind: "todo" | "actualite") => {
        const item =
          kind === "todo"
            ? data?.todos.find((x) => x.id === id)
            : data?.actualites.find((x) => x.id === id);
        if (!item?.href) return { ok: false };
        router.push(item.href);
        return { ok: true };
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1120px] items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  const greeting = `${data?.greeting ?? "Welcome"}${data?.firstName ? `, ${data.firstName}` : ""}`;
  const kpis = data?.kpis ?? [];
  const actualites = data?.actualites ?? [];
  const todos = data?.todos ?? [];

  return (
    <div className="mx-auto max-w-[1120px] animate-content-in">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--color-text-primary)" }}>
        {greeting}
      </h1>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.key}
            className="rounded-xl p-3.5"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
              {k.label}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[21px] font-bold tabular-nums leading-none tracking-[-0.01em]" style={{ color: "var(--color-text-primary)" }}>
                {k.value}
              </span>
              {k.delta != null && k.delta !== 0 && (
                <span
                  className="text-[11px] font-medium tabular-nums"
                  style={{ color: k.delta > 0 ? "var(--color-success)" : "var(--color-error)" }}
                >
                  {k.delta > 0 ? `+${k.delta}` : k.delta}
                </span>
              )}
            </div>
            {k.sub && <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Two columns: Actualités (wide) + À faire */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Actualités */}
        <section className="lg:col-span-3">
          <SectionHeader icon={TrendingUp} title="Activity" />
          {actualites.length > 0 ? (
            <div className="mt-2.5 overflow-hidden rounded-xl" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
              {actualites.map((a, i) => {
                const Icon = ACT_ICON[a.kind] ?? TrendingUp;
                const grad = ACT_GRADIENT[a.kind] ?? "var(--gradient-brand)";
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => a.href && router.push(a.href)}
                    className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-border-default)", cursor: a.href ? "pointer" : "default" }}
                  >
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: grad, boxShadow: "var(--shadow-button)" }}
                    >
                      <Icon size={13} style={{ color: "#FFFFFF" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{a.title}</p>
                      {a.detail && <p className="truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{a.detail}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>{timeAgo(a.at)}</span>
                    <ArrowUpRight size={13} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--color-accent)" }} />
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyLine>Nothing new yet — activity from across Elevay shows up here.</EmptyLine>
          )}
        </section>

        {/* À faire */}
        <section className="lg:col-span-2">
          <SectionHeader icon={CheckSquare} title="Needs you" count={todos.length || undefined} />
          {todos.length > 0 ? (
            <div className="mt-2.5 space-y-2">
              {todos.map((t) => {
                const Icon = TODO_ICON[t.kind] ?? CheckSquare;
                const tint = TODO_TINT[t.tone] ?? "var(--color-text-tertiary)";
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5 rounded-xl p-3"
                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", borderLeft: `3px solid ${tint}` }}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tint} 12%, transparent)` }}>
                      <Icon size={13} style={{ color: tint }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{t.title}</span>
                        {t.stakes && <span className="shrink-0 text-[12px] font-medium" style={{ color: "var(--color-success)" }}>{t.stakes}</span>}
                      </div>
                      <p className="truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{t.why}{t.subtitle ? ` · ${t.subtitle}` : ""}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTodo(t)}
                      className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                      style={t.kind === "reply"
                        ? { background: "var(--color-accent)", color: "#fff" }
                        : { background: "var(--color-bg-muted)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
                    >
                      {t.kind === "reply" ? "Reply" : <span className="inline-flex items-center gap-1">Open <ArrowRight size={12} /></span>}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyLine>You're all caught up — nothing needs you right now.</EmptyLine>
          )}
        </section>
      </div>

      {composer && <EmailComposerPanel draft={composer} onClose={() => setComposer(null)} />}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: typeof Mail; title: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
      <Icon size={12} />
      <span>{title}</span>
      {typeof count === "number" && <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>{count}</span>}
    </h2>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2.5 rounded-xl px-4 py-6 text-[13px]" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-tertiary)" }}>
      {children}
    </div>
  );
}
