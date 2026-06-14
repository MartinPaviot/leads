"use client";

/**
 * Call-intel presentation — renders what the post-call qualification pipeline
 * (lib/voice/post-call-crm.ts) captured from a transcript onto the three CRM
 * records it writes:
 *
 *   - deal.properties.meddic     -> MeddpiccScorecard (qualification spine + gaps + sources)
 *   - deal.properties.evidence   -> grounded quotes, folded into the scorecard
 *   - contact.properties.callProfile -> ContactCallProfile (role / disposition)
 *   - company.properties.callIntel   -> AccountCallIntel (replaceable stack / triggers)
 *
 * Human-in-the-loop: when the tenant is in captureApprovalMode='review', the
 * pipeline writes these facts to a `pending*` key instead of the live one. Each
 * card then shows the proposal with an Approve / Dismiss bar (POST
 * /api/call-intel/review) — review happens where the data lives. In 'auto'
 * (default) the live key is written directly and no bar shows.
 *
 * Every component self-extracts from the entity's `properties` bag and returns
 * null when there's nothing (live or pending) to show. Labels are English (app
 * chrome); captured values stay in the prospect's language. An empty MEDDPICC
 * cell is the agenda for the next call, so it reads "Not captured yet", muted.
 */

import { useState, type ReactNode } from "react";
import {
  CheckCircle2, CircleDashed, ShieldCheck, ShieldAlert, Phone,
  Quote, Layers, Swords, Users, Rocket, Sparkles,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { QUALIFICATION_EXTRAS_ENABLED } from "@/lib/settings/qualification-extras-visibility";

type Props = Record<string, unknown> | null | undefined;
type EntityType = "deal" | "company" | "contact";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}
function joinOrNull(v: unknown): string | null {
  const arr = asStringArray(v);
  return arr.length ? arr.join(", ") : null;
}
function shortDate(iso: unknown): string | null {
  const s = asString(iso);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Human-in-the-loop review (live vs pending) ──────────────────────────────

function usePendingReview<T>(args: {
  entityType: EntityType;
  entityId?: string;
  live: T | null;
  pending: T | null;
}): { data: T | null; usingPending: boolean; showBanner: boolean; busy: boolean; act: (a: "approve" | "dismiss") => void } {
  const { toast } = useToast();
  const [resolved, setResolved] = useState<null | "approved" | "dismissed">(null);
  const [busy, setBusy] = useState(false);

  const isDismissed = resolved === "dismissed";
  const isApproved = resolved === "approved";
  const usingPending = !!args.pending && !isDismissed;
  const data = usingPending ? args.pending : args.live;
  const showBanner = usingPending && !isApproved && !!args.entityId;

  async function act(action: "approve" | "dismiss") {
    if (!args.entityId || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/call-intel/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: args.entityType, entityId: args.entityId, action }),
      });
      if (!res.ok) {
        toast("Couldn't update the proposal.", "error");
        return;
      }
      setResolved(action === "approve" ? "approved" : "dismissed");
      toast(action === "approve" ? "Applied to the record." : "Proposal dismissed.", "success");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  return { data, usingPending, showBanner, busy, act };
}

function PendingBar({ busy, onAct }: { busy: boolean; onAct: (a: "approve" | "dismiss") => void }) {
  return (
    <div
      className="mb-3 flex items-center gap-2 rounded-md px-2.5 py-1.5"
      style={{ background: "var(--color-warning-soft)", border: "1px solid var(--color-warning)" }}
    >
      <Sparkles size={12} className="shrink-0" style={{ color: "var(--color-warning)" }} />
      <span className="flex-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
        Proposed from the last call — pending your approval
      </span>
      <button
        onClick={() => onAct("approve")}
        disabled={busy}
        className="rounded px-2 py-0.5 text-[11px] font-medium disabled:opacity-50"
        style={{ background: "var(--color-success)", color: "#fff" }}
      >
        Approve
      </button>
      <button
        onClick={() => onAct("dismiss")}
        disabled={busy}
        className="rounded px-2 py-0.5 text-[11px] disabled:opacity-50"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Dismiss
      </button>
    </div>
  );
}

// ── Deal: MEDDPICC scorecard ────────────────────────────────────────────────

interface Meddic {
  metrics: string | null;
  economicBuyer: string | null;
  decisionCriteria: unknown;
  decisionProcess: string | null;
  identifiedPain: string | null;
  champion: string | null;
  competition: unknown;
  updatedAt?: unknown;
}

interface Evidence {
  claim: string;
  quote: string;
}

/**
 * The deal IS a MEDDPICC state machine. We render each dimension as filled or
 * a gap, count coverage, and turn the first gaps into the next call's agenda —
 * the missing letters are the plan. Evidence quotes ground the capture so the
 * rep trusts it (a fact with no source is not shown).
 */
export function MeddpiccScorecard({ properties, entityId }: { properties: Props; entityId?: string }) {
  const { data: meddic, usingPending, showBanner, busy, act } = usePendingReview<Meddic>({
    entityType: "deal",
    entityId,
    live: (properties?.meddic ?? null) as Meddic | null,
    pending: (properties?.pendingMeddic ?? null) as Meddic | null,
  });
  const [view, setView] = useState<"meddpicc" | "bant" | "spin">("meddpicc");
  if (!meddic) return null;

  const evidenceSrc = usingPending ? properties?.pendingEvidence : properties?.evidence;
  const evidence = (Array.isArray(evidenceSrc) ? evidenceSrc : []) as Evidence[];

  const dims: { label: string; value: string | null; action: string }[] = [
    { label: "Metrics", value: asString(meddic.metrics), action: "quantify the pain or ROI in their own terms" },
    { label: "Economic buyer", value: asString(meddic.economicBuyer), action: "identify who controls the budget or signs" },
    { label: "Decision criteria", value: joinOrNull(meddic.decisionCriteria), action: "learn what they will evaluate the solution on" },
    { label: "Decision process", value: asString(meddic.decisionProcess), action: "map the steps and approvals to a signature" },
    { label: "Identified pain", value: asString(meddic.identifiedPain), action: "pin down the core pain driving the change" },
    { label: "Champion", value: asString(meddic.champion), action: "find who will sell this internally for us" },
    { label: "Competition", value: joinOrNull(meddic.competition), action: "surface the alternatives, including the status quo" },
  ];

  // BANT is a re-projection of the SAME captured data (no separate extraction):
  // Budget/Timeline from the deal's buying signals, Authority/Need from MEDDPICC.
  const bs = (properties?.buyingSignals ?? properties?.extractedIntel ?? {}) as Record<string, unknown>;
  const bantDims: { label: string; value: string | null; action: string }[] = [
    { label: "Budget", value: asString(bs.budget), action: "confirm the budget and who owns it" },
    { label: "Authority", value: asString(meddic.economicBuyer), action: "reach the person who signs" },
    { label: "Need", value: asString(meddic.identifiedPain) ?? joinOrNull(bs.painPoints), action: "pin the core need driving the change" },
    { label: "Timeline", value: asString(bs.timeline), action: "establish a decision date" },
  ];
  // SPIN — another lens on the same discovery: Situation from the current state,
  // Problem from the pain, Implication from the quantified metric, Need-payoff from
  // the agreed next value. A re-projection, no separate extraction.
  const spinDims: { label: string; value: string | null; action: string }[] = [
    { label: "Situation", value: joinOrNull(bs.currentStack), action: "map their current setup and process" },
    { label: "Problem", value: asString(meddic.identifiedPain) ?? joinOrNull(bs.painPoints), action: "surface the core difficulty they feel" },
    { label: "Implication", value: asString(meddic.metrics), action: "quantify the cost of leaving it unsolved" },
    { label: "Need-payoff", value: joinOrNull(bs.nextSteps), action: "get them to articulate the value of solving it" },
  ];
  const activeDims = view === "bant" ? bantDims : view === "spin" ? spinDims : dims;

  const filled = activeDims.filter((d) => d.value).length;
  const gaps = activeDims.filter((d) => !d.value);
  const nextSteps = gaps.slice(0, 2).map((d) => d.action);
  const capturedOn = shortDate(meddic.updatedAt);

  const ratio = activeDims.length ? filled / activeDims.length : 0;
  const coverageColor =
    ratio >= 0.7 ? "var(--color-success)" : ratio >= 0.4 ? "var(--color-warning)" : "var(--color-error)";

  const validEvidence = evidence
    .filter((e) => e && typeof e.claim === "string" && typeof e.quote === "string" && e.quote.trim())
    .slice(0, 6);

  return (
    <Card className="mt-4">
      <CardBody>
        {showBanner && <PendingBar busy={busy} onAct={act} />}
        <div className="mb-3 flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Qualification · {view === "bant" ? "BANT" : view === "spin" ? "SPIN" : "MEDDPICC"}
          </p>
          {/* BANT/SPIN lens picker — prod-hidden (founder-led doesn't need the
              framework toggle; MEDDPICC stays the single view). Logic kept. */}
          {QUALIFICATION_EXTRAS_ENABLED && (
            <div
              className="inline-flex rounded-md p-0.5"
              style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
            >
              {(["meddpicc", "bant", "spin"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{
                    background: view === v ? "var(--color-accent)" : "transparent",
                    color: view === v ? "#fff" : "var(--color-text-tertiary)",
                  }}
                >
                  {v === "bant" ? "BANT" : v === "spin" ? "SPIN" : "MEDDPICC"}
                </button>
              ))}
            </div>
          )}
          <span
            className="ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--color-bg-page)", color: coverageColor, border: `1px solid ${coverageColor}` }}
          >
            {filled}/{activeDims.length} qualified
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {activeDims.map((d) => (
            <div key={d.label} className="flex items-start gap-2">
              {d.value ? (
                <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-success)" }} />
              ) : (
                <CircleDashed size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
              )}
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">{d.label}</p>
                <p
                  className="text-[12px] leading-snug"
                  style={{ color: d.value ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}
                >
                  {d.value || "Not captured yet"}
                </p>
              </div>
            </div>
          ))}
        </div>

        {nextSteps.length > 0 && (
          <div
            className="mt-3 rounded-md p-2.5"
            style={{ background: "var(--color-accent-soft, rgba(37,99,235,0.08))", border: "1px solid var(--color-border-default)" }}
          >
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Next step on this deal</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {nextSteps.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(". ")}.
            </p>
          </div>
        )}

        {validEvidence.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
              <Quote size={11} /> Sources from the call{capturedOn ? ` · ${capturedOn}` : ""}
            </p>
            <div className="space-y-1.5">
              {validEvidence.map((e, i) => (
                <div key={i} className="rounded-md p-2" style={{ background: "var(--color-bg-page)" }}>
                  <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{e.claim}</p>
                  <p className="mt-0.5 border-l-2 pl-2 text-[11px] italic" style={{ color: "var(--color-text-tertiary)", borderColor: "var(--color-border-default)" }}>
                    &ldquo;{e.quote}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Contact: last-call profile ──────────────────────────────────────────────

interface CallProfile {
  role: string | null;
  isDecisionMaker: boolean | null;
  disposition: "champion" | "supporter" | "neutral" | "detractor" | null;
  updatedAt?: unknown;
}
interface LastCall {
  outcome?: unknown;
  sentiment?: unknown;
  at?: unknown;
}

const DISPOSITION_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  champion: { label: "Champion", bg: "var(--color-success-soft)", color: "var(--color-success)" },
  supporter: { label: "Supporter", bg: "var(--color-accent-soft, rgba(37,99,235,0.08))", color: "var(--color-accent)" },
  neutral: { label: "Neutral", bg: "var(--color-bg-hover)", color: "var(--color-text-secondary)" },
  detractor: { label: "Detractor", bg: "var(--color-error-soft)", color: "var(--color-error)" },
};

/**
 * What the last call revealed about THIS person in the buying group — their
 * role, whether they decide, and their stance toward us. Sidebar-sized.
 */
export function ContactCallProfile({ properties, className, entityId }: { properties: Props; className?: string; entityId?: string }) {
  const { data: profile, showBanner, busy, act } = usePendingReview<CallProfile>({
    entityType: "contact",
    entityId,
    live: (properties?.callProfile ?? null) as CallProfile | null,
    pending: (properties?.pendingCallProfile ?? null) as CallProfile | null,
  });
  const lastCall = (properties?.lastCall ?? null) as LastCall | null;
  if (!profile && !lastCall) return null;

  const role = asString(profile?.role);
  const disposition = profile?.disposition ? DISPOSITION_STYLE[profile.disposition] : null;
  const isDM = profile?.isDecisionMaker;
  const when = shortDate(profile?.updatedAt) ?? shortDate(lastCall?.at);
  const outcome = asString(lastCall?.outcome);

  // Nothing meaningful beyond an outcome stamp — skip to avoid an empty card.
  if (!role && !disposition && isDM == null && !outcome) return null;

  return (
    <div className={className}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        <Phone size={13} /> From the call
      </h3>
      <div className="mt-3 rounded-lg p-3" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
        {showBanner && <PendingBar busy={busy} onAct={act} />}
        <div className="flex flex-wrap items-center gap-1.5">
          {disposition && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: disposition.bg, color: disposition.color }}>
              {profile?.disposition === "detractor" ? <ShieldAlert size={9} /> : <ShieldCheck size={9} />}
              {disposition.label}
            </span>
          )}
          {isDM != null && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: isDM ? "var(--color-success-soft)" : "var(--color-bg-hover)",
                color: isDM ? "var(--color-success)" : "var(--color-text-tertiary)",
              }}
            >
              {isDM ? "Decision maker" : "Not the decision maker"}
            </span>
          )}
        </div>
        {role && (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">Role on the call</p>
            <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>{role}</p>
          </div>
        )}
        {when && (
          <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">Captured {when}</p>
        )}
      </div>
    </div>
  );
}

// ── Account: call intel (the replaceable stack is the Pilae lever) ──────────

interface CallIntel {
  stack: unknown;
  competitors: unknown;
  teamSize: string | null;
  initiatives: unknown;
  updatedAt?: unknown;
}

function ChipRow({ icon, label, items }: { icon: ReactNode; label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {icon} {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--color-bg-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * What the call revealed about the ORG: the stack it could replace, the
 * alternatives in play, the triggers driving change. This is the account-level
 * lever for the Pilae pitch (a replaceable, costly SaaS).
 */
export function AccountCallIntel({ properties, entityId }: { properties: Props; entityId?: string }) {
  const { data: intel, showBanner, busy, act } = usePendingReview<CallIntel>({
    entityType: "company",
    entityId,
    live: (properties?.callIntel ?? null) as CallIntel | null,
    pending: (properties?.pendingCallIntel ?? null) as CallIntel | null,
  });
  if (!intel) return null;

  const stack = asStringArray(intel.stack);
  const competitors = asStringArray(intel.competitors);
  const initiatives = asStringArray(intel.initiatives);
  const teamSize = asString(intel.teamSize);
  const when = shortDate(intel.updatedAt);

  if (!stack.length && !competitors.length && !initiatives.length && !teamSize) return null;

  return (
    <Card className="mt-4">
      <CardBody>
        {showBanner && <PendingBar busy={busy} onAct={act} />}
        <div className="mb-3 flex items-center gap-2">
          <Phone size={13} style={{ color: "var(--color-text-tertiary)" }} />
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Captured on the call</p>
          {when && <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">{when}</span>}
        </div>
        <div className="space-y-3">
          <ChipRow icon={<Layers size={11} />} label="Stack in place" items={stack} />
          <ChipRow icon={<Swords size={11} />} label="Alternatives considered" items={competitors} />
          <ChipRow icon={<Rocket size={11} />} label="Initiatives / triggers" items={initiatives} />
          {teamSize && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <Users size={11} /> Team size
              </p>
              <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>{teamSize}</p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
