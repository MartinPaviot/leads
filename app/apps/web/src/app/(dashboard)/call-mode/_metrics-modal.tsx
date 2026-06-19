"use client";

/**
 * Cold-call performance dashboard — the metrics the experts track, surfaced on
 * demand from the funnel bar so the always-on strip stays a one-line glance.
 * Reads /api/calls/metrics (30-day window, rep-local timezone). Every rate is
 * gated by a sample floor server-side, so below the floor we show "—" with the
 * raw count, never a noisy percentage. No emoji, no provider names.
 */

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  fmtPct,
  fmtRatio,
  DOW_FR,
  fmtHour,
  BENCHMARKS,
  type Rate,
  type OutcomeCounts,
  type TimeBucket,
} from "@/lib/voice/call-metrics";

interface RankedBucket extends TimeBucket {
  connectRate: number;
}

interface MetricsResponse {
  scope: "me" | "team";
  tz: string;
  windowDays: number;
  counts: OutcomeCounts;
  metrics: {
    dials: number;
    connects: number;
    meetings: number;
    connectRate: Rate;
    nrpRate: Rate;
    voicemailRate: Rate;
    busyRate: Rate;
    badNumberRate: Rate;
    gatekeeperRate: Rate;
    notInterestedRate: Rate;
    meetingRate: Rate;
    meetingConversion: Rate;
    dialsPerMeeting: number | null;
    dialsPerConnect: number | null;
  };
  quality: {
    avgConnectedSec: number | null;
    totalTalkMin: number;
    avgTalkMinPerActiveDay: number | null;
    avgTalkRatioPct: number | null;
    activeDays: number;
  };
  timing: {
    bestHours: RankedBucket[];
    bestDows: RankedBucket[];
    hours: TimeBucket[];
    dows: TimeBucket[];
    bestHoursProspect?: RankedBucket[];
    crossTimezone?: boolean;
  };
  conversation?: {
    sample: number;
    avgAgentTalkPct: number | null;
    avgQuestionsAsked: number | null;
    avgLongestMonologueSec: number | null;
    avgInteractivityPerMin: number | null;
  };
}

const OUTCOME_STYLE: Record<keyof Omit<OutcomeCounts, "dials">, { label: string; color: string }> = {
  meeting_booked: { label: "RDV pris", color: "var(--color-success)" },
  connected: { label: "Connecté", color: "#22c55e" },
  callback_requested: { label: "Rappel demandé", color: "#0ea5e9" },
  not_interested: { label: "Pas intéressé", color: "var(--color-text-tertiary)" },
  voicemail_left: { label: "Répondeur", color: "var(--color-warning)" },
  no_answer: { label: "NRP · répond pas", color: "var(--color-error)" },
  busy: { label: "Occupé", color: "#eab308" },
  gatekeeper: { label: "Barrage", color: "#a855f7" },
  wrong_number: { label: "Mauvais numéro", color: "var(--color-text-tertiary)" },
  do_not_call: { label: "Ne pas appeler", color: "var(--color-text-tertiary)" },
  failed: { label: "Échec technique", color: "var(--color-text-tertiary)" },
};
const OUTCOME_ORDER = Object.keys(OUTCOME_STYLE) as (keyof typeof OUTCOME_STYLE)[];

function fmtDuration(sec: number | null): string {
  if (sec === null || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, "0")}` : `${s} s`;
}

const muted = { color: "var(--color-text-tertiary)" } as React.CSSProperties;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={muted}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A big headline stat with an optional benchmark "repère" line underneath. */
function Tile({
  label,
  value,
  hint,
  sub,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)" }}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide" style={muted}>
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-semibold leading-tight" style={{ color: accent ?? "var(--color-text-primary)" }}>
        {value}
      </div>
      {sub && <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{sub}</div>}
      {hint && <div className="mt-0.5 text-xs" style={muted}>{hint}</div>}
    </div>
  );
}

/** "60 / 100" context for a rate, so a "—" still tells the rep how close to the floor they are. */
function ctx(r: Rate): string {
  return `${r.num} / ${r.den}`;
}

interface ShowStatsData {
  held: number;
  noShow: number;
  qualified: number;
  unknown: number;
  scheduled: number;
  showRate: { value: number | null; num: number; den: number };
}

export function CallMetricsModal({
  open,
  scope,
  onClose,
}: {
  open: boolean;
  scope: "me" | "team";
  onClose: () => void;
}) {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [showStats, setShowStats] = useState<ShowStatsData | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("loading");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    fetch(`/api/calls/metrics?scope=${scope}&tz=${encodeURIComponent(tz)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: MetricsResponse) => {
        if (!cancelled) {
          setData(d);
          setState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, scope]);

  // Meeting show rate — a separate, cheap tally (no live calendar call) so a
  // failure here never blanks the call metrics.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/meetings/show-stats?scope=${scope}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats?: ShowStatsData } | null) => {
        if (!cancelled && d?.stats) setShowStats(d.stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, scope]);

  const m = data?.metrics;
  const dials = m?.dials ?? 0;

  return (
    <Modal open={open} onClose={onClose} title={`Performance d'appel · ${scope === "team" ? "équipe" : "moi"} · 30 j`} size="lg">
      {state === "loading" && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
          ))}
        </div>
      )}

      {state === "error" && (
        <p className="py-8 text-center text-[13px]" style={muted}>
          Impossible de charger les métriques. Réessayez dans un instant.
        </p>
      )}

      {state === "idle" && data && dials === 0 && (
        <p className="py-8 text-center text-[13px]" style={muted}>
          Pas encore d'appels sur les 30 derniers jours. Les métriques se rempliront au fil des appels.
        </p>
      )}

      {state === "idle" && data && m && dials > 0 && (
        <div>
          {/* ── Vue d'ensemble ── */}
          <Section title="Vue d'ensemble">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Appels" value={String(m.dials)} sub={`${data.quality.activeDays} jour${data.quality.activeDays > 1 ? "s" : ""} actif${data.quality.activeDays > 1 ? "s" : ""}`} />
              <Tile
                label="Taux de connexion"
                value={fmtPct(m.connectRate)}
                sub={m.connectRate.value === null ? `${ctx(m.connectRate)} · échantillon insuffisant` : `${m.connects} connexions`}
                hint="repère 5-12 % · top 25 %+"
                accent={connectColor(m.connectRate.value)}
              />
              <Tile
                label="RDV pris"
                value={String(m.meetings)}
                sub={m.meetingRate.value === null ? "taux à venir" : `${fmtPct(m.meetingRate)} des appels`}
              />
              <Tile
                label="Appels par RDV"
                value={fmtRatio(m.dialsPerMeeting)}
                hint="repère 40-45 · top 20"
                accent={dialsPerMeetingColor(m.dialsPerMeeting)}
              />
            </div>
          </Section>

          {/* ── Présence aux RDV (show rate) ── */}
          <Section title="Présence aux RDV — taux de présence (90 j)">
            {showStats && showStats.qualified > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile
                  label="Taux de présence"
                  value={fmtPct(showStats.showRate.value)}
                  sub={
                    showStats.showRate.value === null
                      ? `${showStats.held}/${showStats.qualified} · échantillon insuffisant`
                      : `${showStats.held} tenus / ${showStats.qualified} qualifiés`
                  }
                  hint="repère 75-80 %"
                  accent={showRateColor(showStats.showRate.value)}
                />
                <Tile label="No-show" value={String(showStats.noShow)} sub="RDV manqués" accent={showStats.noShow > 0 ? "var(--color-warning)" : undefined} />
                <Tile label="À qualifier" value={String(showStats.unknown)} sub="RDV passés non marqués" />
              </div>
            ) : (
              <p className="text-[13px]" style={muted}>
                Pas encore de RDV qualifiés. Marquez vos RDV passés « tenu / pas venu » dans Meetings pour suivre la présence.
              </p>
            )}
          </Section>

          {/* ── Joignabilité (distribution) ── */}
          <Section title="Joignabilité — pourquoi ça décroche ou non">
            <OutcomeBar counts={data.counts} />
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {OUTCOME_ORDER.filter((k) => (data.counts[k] ?? 0) > 0 || k === "no_answer").map((k) => {
                const n = data.counts[k] ?? 0;
                const pct = dials > 0 ? n / dials : 0;
                const st = OUTCOME_STYLE[k];
                const isNrp = k === "no_answer";
                return (
                  <div key={k} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: st.color }} />
                    <span style={{ color: isNrp ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: isNrp ? 600 : 400 }}>
                      {st.label}
                    </span>
                    <span className="ml-auto tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                      {n}
                    </span>
                    <span className="w-9 text-right tabular-nums" style={muted}>
                      {(pct * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── Efficacité & conversion ── */}
          <Section title="Efficacité & conversion">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Appels par connexion" value={fmtRatio(m.dialsPerConnect)} hint="repère ~18" />
              <Tile label="Connexion → RDV" value={fmtPct(m.meetingConversion)} sub={m.meetingConversion.value === null ? `${ctx(m.meetingConversion)} · à venir` : undefined} />
              <Tile label="NRP" value={fmtPct(m.nrpRate)} sub={m.nrpRate.value === null ? ctx(m.nrpRate) : undefined} accent={m.nrpRate.value !== null ? "var(--color-error)" : undefined} />
              <Tile label="Mauvais numéro" value={fmtPct(m.badNumberRate)} sub="qualité de la data" accent={badNumberColor(m.badNumberRate.value)} />
            </div>
          </Section>

          {/* ── Qualité de conversation ── */}
          <Section title="Qualité de conversation">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Tile label="Durée moy. connecté" value={fmtDuration(data.quality.avgConnectedSec)} />
              <Tile
                label="Temps de parole"
                value={data.quality.totalTalkMin > 0 ? `${data.quality.totalTalkMin} min` : "—"}
                sub={data.quality.avgTalkMinPerActiveDay != null ? `${data.quality.avgTalkMinPerActiveDay} min / jour actif` : undefined}
                hint="repère 90-120 min / jour"
              />
              <Tile
                label="Ratio de parole (vous)"
                value={data.quality.avgTalkRatioPct != null ? `${data.quality.avgTalkRatioPct} %` : "—"}
                hint={`cible ${BENCHMARKS.talkRatioBand[0]}-${BENCHMARKS.talkRatioBand[1]} %`}
                accent={talkRatioColor(data.quality.avgTalkRatioPct)}
              />
            </div>
            {/* Transcript-derived dialogue shape — only once enough connected
                calls carry a usable transcript (recorded conversations). */}
            {data.conversation && data.conversation.sample >= 5 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile
                  label="Questions / appel"
                  value={data.conversation.avgQuestionsAsked != null ? String(data.conversation.avgQuestionsAsked) : "—"}
                  sub={`sur ${data.conversation.sample} conversation${data.conversation.sample > 1 ? "s" : ""}`}
                  hint="poser au moins quelques questions"
                />
                <Tile
                  label="Monologue le plus long"
                  value={fmtDuration(data.conversation.avgLongestMonologueSec)}
                  hint="garder sous ~1 min"
                  accent={
                    data.conversation.avgLongestMonologueSec != null && data.conversation.avgLongestMonologueSec > 60
                      ? "var(--color-warning)"
                      : undefined
                  }
                />
                <Tile
                  label="Interactivité"
                  value={data.conversation.avgInteractivityPerMin != null ? `${data.conversation.avgInteractivityPerMin}/min` : "—"}
                  sub="échanges par minute"
                />
              </div>
            )}
          </Section>

          {/* ── Quand appeler ── */}
          <Section title="Quand appeler — d'après votre historique">
            {data.timing.bestHours.length === 0 && data.timing.bestDows.length === 0 ? (
              <p className="text-[13px]" style={muted}>
                Pas encore assez d'appels par tranche horaire pour dégager un créneau fiable.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BestList title={data.timing.crossTimezone ? "Meilleures heures (votre heure)" : "Meilleures heures"} items={data.timing.bestHours} render={(b) => fmtHour(b.key)} />
                <BestList title="Meilleurs jours" items={data.timing.bestDows} render={(b) => DOW_FR[b.key] ?? String(b.key)} />
                {data.timing.crossTimezone && (data.timing.bestHoursProspect?.length ?? 0) > 0 && (
                  <BestList
                    title="Meilleures heures (heure du prospect)"
                    items={data.timing.bestHoursProspect!}
                    render={(b) => fmtHour(b.key)}
                  />
                )}
              </div>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}

/** Full-width stacked bar of the outcome distribution (segments with count>0). */
function OutcomeBar({ counts }: { counts: OutcomeCounts }) {
  const total = counts.dials || 1;
  const segs = OUTCOME_ORDER.map((k) => ({ k, n: counts[k] ?? 0, color: OUTCOME_STYLE[k].color })).filter((s) => s.n > 0);
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-border-default)" }}>
      {segs.map((s) => (
        <div key={s.k} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} title={`${OUTCOME_STYLE[s.k].label}: ${s.n}`} />
      ))}
    </div>
  );
}

function BestList({
  title,
  items,
  render,
}: {
  title: string;
  items: RankedBucket[];
  render: (b: RankedBucket) => string;
}) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)" }}>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide" style={muted}>
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs" style={muted}>—</div>
      ) : (
        <ul className="space-y-1">
          {items.map((b, i) => (
            <li key={b.key} className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--color-text-primary)", fontWeight: i === 0 ? 600 : 400 }}>{render(b)}</span>
              <span className="tabular-nums" style={muted}>
                {fmtPct(b.connectRate)} · {b.dials} app.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Benchmark-aware accent colors (green = on/above target, amber = watch) ──
function connectColor(v: number | null): string | undefined {
  if (v === null) return undefined;
  if (v >= BENCHMARKS.connectRate.typical[0]) return "var(--color-success)";
  return "var(--color-warning)";
}
function showRateColor(v: number | null): string | undefined {
  if (v === null) return undefined;
  return v >= 0.75 ? "var(--color-success)" : "var(--color-warning)";
}
function dialsPerMeetingColor(v: number | null): string | undefined {
  if (v === null) return undefined;
  if (v <= BENCHMARKS.dialsPerMeeting.typical[1]) return "var(--color-success)";
  return "var(--color-warning)";
}
function badNumberColor(v: number | null): string | undefined {
  if (v === null) return undefined;
  return v > 0.1 ? "var(--color-warning)" : undefined;
}
function talkRatioColor(v: number | null): string | undefined {
  if (v === null) return undefined;
  return v >= BENCHMARKS.talkRatioBand[0] && v <= BENCHMARKS.talkRatioBand[1] ? "var(--color-success)" : "var(--color-warning)";
}
