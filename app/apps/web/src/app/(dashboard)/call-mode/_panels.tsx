"use client";

/**
 * Rich panels for /call-mode.
 *
 * The pre-call surfaces every fact we already hold on a prospect — the
 * "remise en contexte" the rep needs in the 5 seconds before dialling —
 * plus the gaps still worth enriching. Data comes from the live
 * /api/brain/contact/[contactId] endpoint (focal contact + direct
 * activities + owned deals + surrounding company brain).
 *
 * During the call the centre column swaps to a live, auto-scrolling
 * transcript fed by the SSE channel on /api/calls/[id]/events (which
 * relays Deepgram chunks the voice-stream bridge writes to
 * calls.transcript).
 *
 * No emoji per the brand rule — Lucide icons only.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Sparkles,
  Phone,
  Mail,
  Clock,
  Crown,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  FileText,
  MessageSquare,
  Activity,
  Building2,
  Users,
  Briefcase,
  AlertTriangle,
  Brain,
  Search,
  Radio,
  Globe,
  Zap,
  Banknote,
  Cpu,
  UserPlus,
  Swords,
  Target,
  ChevronDown,
  ChevronRight,
  BadgeCheck,
} from "lucide-react";
import { industryIcon } from "@/lib/ui/industry-style";
import { Avatar } from "@/components/ui/avatar";
import {
  careerEntryLabel,
  profileUrl,
  recentActivityUrl,
  type ProspectBriefPayload,
} from "@/lib/call-mode/prospect-brief-core";
import { isVoiceableSignal, mergeTechStacks } from "@/lib/call-mode/live-script";
import { countryFromTimezone } from "@/lib/call-mode/geo";
import { relativeFr, type RoleVerification } from "@/lib/contacts/role-status";
import { pickReplaceableTools } from "@/lib/tech-detect/replaceable";
import { scoreTranscriptLevers, DRILL_COPY } from "@/lib/voice/lever-scoring";
import { CompanyLogo } from "@/components/ui/company-logo";
import { ContactCollisionNotice } from "@/components/collision/contact-collision-notice";

// lucide dropped brand glyphs — inline the LinkedIn mark (same path the
// Accounts page uses) so the Direction section stays on-brand.
function LinkedInGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

// ── Client-side brain shape (dates arrive as ISO strings over JSON) ──

export interface BrainContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  isChampion: boolean;
  intentScore: number | null;
  intentTrend: "heating" | "stable" | "cooling" | null;
  lastTouchAt: string | null;
}
export interface BrainDeal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  expectedCloseDate: string | null;
  riskLevel: "low" | "medium" | "high" | "none" | null;
  riskReasons: string[];
  stallProbability: number | null;
  stallIndicators: Array<{ type: string; severity: string; detail: string }>;
}
export interface BrainActivity {
  id: string;
  type: string;
  direction: string | null;
  occurredAt: string;
  summary: string | null;
  actorName?: string | null;
}
interface BrainCompany {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  sizeBand: string | null;
  score: number | null;
  location?: string | null;
}
interface BrainMemory { id: string; scope: string; content: string; createdAt: string }
interface BrainEdge {
  sourceId: string;
  targetId: string;
  relationType: string;
  fact: string;
  confidence: number | null;
}
interface BrainKnowledge { id: string; title: string; body: string; scope: string }
interface CompanyBrainJSON {
  company: BrainCompany;
  contacts: BrainContact[];
  deals: BrainDeal[];
  activities: BrainActivity[];
  knowledgeEntries: BrainKnowledge[];
  contextGraphEdges: BrainEdge[];
  memories: BrainMemory[];
}
export interface DossierJSON {
  leadership?: Array<{ name: string; title: string; linkedin?: string; relevance?: string }>;
  funding?: {
    totalRaised: string;
    lastRound: string;
    investors: string[];
    date: string;
  } | null;
  techStack?: string[];
  hiringSignals?: Array<{ role: string; department: string; signal: string }>;
  competitiveLandscape?: string;
  recommendedApproach?: {
    bestContact?: string;
    messagingAngle?: string;
    timing?: string;
    openingLine?: string;
  };
}
export interface ContactBrainJSON {
  focalContact: BrainContact;
  directActivities: BrainActivity[];
  ownedDeals: BrainDeal[];
  companyBrain: CompanyBrainJSON;
  cachedDossier?: DossierJSON | null;
  /** Enrichment-detected technologies (companies.properties.technologies,
   *  via tech-detect) — merged with the dossier's techStack client-side. */
  enrichedTechnologies?: string[] | null;
}

// What the centre brief needs from the queue row alongside the brain.
export interface BriefContext {
  contactId: string;
  contactName: string;
  title: string | null;
  companyName: string | null;
  phone: string;
  score: number;
  intentScore: number;
  accessibilityScore: number;
  dealValueWeight: number;
  localTime: string;
  localTimezone: string;
  lastEnrichedAt?: string | null;
  /** Live LinkedIn verification of the role (null until the auto-check runs):
   *  confirmed → show the verified role; left → handled upstream (dropped). */
  roleVerification?: RoleVerification | null;
  latestSignal: { type: string; label: string } | null;
}

// ── Formatting helpers ──────────────────────────────────────────

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  notation: "compact",
});
function formatValue(n: number | null): string {
  if (n == null) return "—";
  return eur.format(n);
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  return `il y a ${Math.round(mo / 12)} an${mo >= 24 ? "s" : ""}`;
}

function activityIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("email") || t.includes("mail")) return Mail;
  if (t.includes("call") || t.includes("phone")) return Phone;
  if (t.includes("meeting") || t.includes("calendar")) return Calendar;
  if (t.includes("note")) return FileText;
  if (t.includes("message") || t.includes("chat") || t.includes("linkedin"))
    return MessageSquare;
  return Activity;
}

function riskTone(level: BrainDeal["riskLevel"]): { bg: string; fg: string; label: string } {
  switch (level) {
    case "high":
      return { bg: "rgba(220,38,38,.10)", fg: "rgb(185,28,28)", label: "Risque élevé" };
    case "medium":
      return { bg: "rgba(234,179,8,.12)", fg: "rgb(133,77,14)", label: "Risque moyen" };
    case "low":
      return { bg: "rgba(34,197,94,.10)", fg: "rgb(21,128,61)", label: "Risque faible" };
    default:
      return { bg: "var(--color-bg-hover)", fg: "var(--color-text-tertiary)", label: "—" };
  }
}

function IntentTrend({ trend }: { trend: BrainContact["intentTrend"] }) {
  if (!trend) return null;
  const map = {
    heating: { Icon: TrendingUp, color: "rgb(21,128,61)", label: "En chauffe" },
    cooling: { Icon: TrendingDown, color: "rgb(185,28,28)", label: "Refroidit" },
    stable: { Icon: Minus, color: "var(--color-text-tertiary)", label: "Stable" },
  } as const;
  const { Icon, color, label } = map[trend];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${color}14`, color }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {title}
        {count != null && count > 0 && (
          <span className="text-zinc-400">· {count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function ContextChip({ icon: Icon, children }: { icon: typeof Globe; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
      style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
    >
      <Icon className="h-3 w-3 text-zinc-400" />
      {children}
    </span>
  );
}

// ── Prospect brief card (career + company from its own site) ────
//
// Auto-built on first open (Apollo career match + real homepage text +
// one grounded LLM pass), then served from the jsonb caches — see
// lib/call-mode/prospect-brief.ts. Renders each half independently with
// honest fallbacks; LinkedIn "Posts récents" is a deep link into the
// rep's logged-in browser (we have no LinkedIn data source — no scraping).

const briefCache = new Map<string, ProspectBriefPayload>();
const briefInflight = new Map<string, Promise<ProspectBriefPayload | null>>();

function useProspectBrief(contactId: string): {
  loading: boolean;
  data: ProspectBriefPayload | null;
} {
  const [state, setState] = useState<{
    loading: boolean;
    data: ProspectBriefPayload | null;
  }>(() => ({
    loading: !briefCache.has(contactId),
    data: briefCache.get(contactId) ?? null,
  }));

  useEffect(() => {
    let cancelled = false;
    const cached = briefCache.get(contactId);
    if (cached) {
      setState({ loading: false, data: cached });
      return;
    }
    setState({ loading: true, data: null });
    let p = briefInflight.get(contactId);
    if (!p) {
      p = fetch(
        `/api/call-mode/prospect-brief?contactId=${encodeURIComponent(contactId)}`,
      )
        .then((r) =>
          r.ok ? (r.json() as Promise<ProspectBriefPayload>) : null,
        )
        .catch(() => null)
        .finally(() => briefInflight.delete(contactId));
      briefInflight.set(contactId, p);
    }
    p.then((data) => {
      if (data) briefCache.set(contactId, data);
      if (!cancelled) setState({ loading: false, data });
    });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return state;
}

function BriefLinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950"
    >
      <LinkedInGlyph className="h-3 w-3" />
      {label}
    </a>
  );
}

function ProspectBriefCard({ contactId }: { contactId: string }) {
  const { loading, data } = useProspectBrief(contactId);
  const person = data?.person ?? null;
  const company = data?.company ?? null;

  const careerLines = (person?.career ?? []).slice(0, 3).map(careerEntryLabel);
  const liProfile = profileUrl(person?.linkedinUrl);
  const liPosts = recentActivityUrl(person?.linkedinUrl);
  // Grounded summary first; the site's own meta description as the
  // deterministic fallback, labelled as such.
  const companyText = company?.summary ?? company?.metaDescription ?? null;
  const companyIsMetaOnly = !company?.summary && Boolean(company?.metaDescription);
  let companyHost: string | null = null;
  if (company?.url) {
    try {
      companyHost = new URL(company.url).host.replace(/^www\./, "");
    } catch {
      companyHost = null;
    }
  }
  const hasPersonContent =
    Boolean(person?.background) || careerLines.length > 0 || Boolean(person?.headline);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      {/* Le prospect */}
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            <Users className="h-3.5 w-3.5" />
            Le prospect
          </div>
          {(liProfile || liPosts) && (
            <div className="flex items-center gap-1">
              {liProfile && <BriefLinkChip href={liProfile} label="Profil" />}
              {liPosts && <BriefLinkChip href={liPosts} label="Posts récents" />}
            </div>
          )}
        </div>
        {loading ? (
          <div className="mt-1.5">
            <BriefSkeleton rows={2} />
          </div>
        ) : hasPersonContent ? (
          <div className="mt-1 space-y-1">
            {person?.background ? (
              <p className="text-[13px] leading-snug text-zinc-800 dark:text-zinc-100">
                {person.background}
              </p>
            ) : person?.headline ? (
              <p className="text-[13px] italic leading-snug text-zinc-700 dark:text-zinc-300">
                {person.headline}
              </p>
            ) : null}
            {careerLines.length > 0 && (
              <ul className="space-y-0.5">
                {careerLines.map((l, i) => (
                  <li key={i} className="text-[12px] leading-snug text-zinc-500">
                    {l}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-zinc-400">
            Parcours non retrouvé — pas de correspondance LinkedIn.
          </p>
        )}
      </div>

      {/* L'entreprise, d'après son propre site */}
      <div
        className="px-4 py-2.5"
        style={{ borderTop: "1px solid var(--color-border-default)" }}
      >
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          <Globe className="h-3.5 w-3.5" />
          L&apos;entreprise — d&apos;après son site
        </div>
        {loading ? (
          <div className="mt-1.5">
            <BriefSkeleton rows={2} />
          </div>
        ) : companyText ? (
          <div className="mt-1">
            <p className="text-[13px] leading-snug text-zinc-800 dark:text-zinc-100">
              {companyText}
            </p>
            <p className="mt-1 text-[11px] text-zinc-400">
              {companyIsMetaOnly ? "Meta description du site" : "Synthèse du site"}
              {companyHost ? ` · ${companyHost}` : ""}
              {company?.generatedAt ? ` · ${relTime(company.generatedAt)}` : ""}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-zinc-400">
            {company?.url
              ? "Site injoignable ou vide — résumé indisponible."
              : "Pas de site connu pour cette entreprise."}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Pre-call brief (centre column, idle) ────────────────────────

export function PreCallBrief({
  selected,
  brain,
  brainLoading,
  onEnrich,
  enriching,
  onRoleObsolete,
}: {
  selected: BriefContext;
  brain: ContactBrainJSON | null | undefined;
  brainLoading: boolean;
  onEnrich?: () => void;
  enriching?: boolean;
  /** Called after the rep flags this contact as having left the role, so the
   *  cockpit can drop them from the queue. */
  onRoleObsolete?: (contactId: string) => void;
}) {
  const focal = brain?.focalContact;
  // Honest freshness: the title/company is sourced data, never re-verified, so
  // we let the rep flag "a quitté ce poste" — removes them from the list.
  const [markingLeft, setMarkingLeft] = useState(false);
  async function markRoleObsolete() {
    setMarkingLeft(true);
    try {
      await fetch(`/api/contacts/${selected.contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleObsolete: true }),
      });
      onRoleObsolete?.(selected.contactId);
    } catch {
      setMarkingLeft(false);
    }
  }
  // Live LinkedIn verification: when confirmed, the verified title is the
  // truth to display (over the possibly-stale sourced title).
  const verification = selected.roleVerification ?? null;
  const displayTitle =
    verification?.status === "confirmed" && verification.title
      ? verification.title
      : focal?.title ?? selected.title;
  const deals = brain?.ownedDeals ?? [];
  const activities = brain?.directActivities ?? [];
  const dossier = brain?.cachedDossier ?? null;
  const company = brain?.companyBrain?.company;
  // Precise location (enrichment city/canton/country) when we have it; otherwise
  // fall back to the country derived from the contact's timezone.
  const geo = company?.location ?? countryFromTimezone(selected.localTimezone);
  const [showDossier, setShowDossier] = useState(false);

  // The script is on the right — the centre is situational intelligence. What an
  // expert wants before dialling, ranked by what changes the call:

  // 1) Authority (decider-first). isChampion is the only grounded flag; the
  // seniority read is a soft, title-based hint ("probable"), never a hard claim.
  const titleStr = (focal?.title ?? selected.title ?? "").toLowerCase();
  const isSenior = [
    "ceo", "chief", "founder", "fondat", "président", "president",
    "directeur général", "directrice général", "direction générale", "dg ",
    "gérant", "gerant", "owner", "propriétaire", "associé", "partner",
    "secrétaire général", "secretaire general", "daf", "cfo", "coo", "dsi", "cto",
  ].some((k) => titleStr.includes(k));
  const authorityLabel = focal?.isChampion
    ? "Champion interne"
    : isSenior
      ? "Décideur probable"
      : "Influenceur — viser l'intro au décideur";

  // 2) Signals — the concrete "why now", PROMOTED to the top of the brief
  // (they used to be one buried line / hidden in the collapsed dossier). Only
  // externally-voiceable triggers qualify: a live signal of a sayable type,
  // funding, hiring, heating intent, the replaceable stack (the Pilae lever).
  // Never an internal/behavioral signal, and never the rep's own strategy note
  // (messagingAngle) — those are not reasons to call.
  const stack = mergeTechStacks(dossier?.techStack, brain?.enrichedTechnologies);
  const liveSignal =
    selected.latestSignal && isVoiceableSignal(selected.latestSignal.type)
      ? selected.latestSignal.label
      : null;
  const hiringRoles = (dossier?.hiringSignals ?? []).map((h) => h.role).filter(Boolean);
  const signals: Array<{ icon: typeof Radio; text: string; tag: string; hot?: boolean }> = [];
  if (liveSignal) signals.push({ icon: Radio, text: liveSignal, tag: "Signal", hot: true });
  if (dossier?.funding) {
    const d = dossier.funding.date && dossier.funding.date !== "Unknown" ? ` (${dossier.funding.date})` : "";
    signals.push({ icon: Banknote, text: `${dossier.funding.totalRaised} levés · ${dossier.funding.lastRound}${d}`, tag: "Levée" });
  }
  if (hiringRoles.length > 0) signals.push({ icon: UserPlus, text: `Recrute ${hiringRoles.slice(0, 3).join(", ")}`, tag: "Recrutement" });
  if (stack.length > 0) {
    // Lead with the tools that are actually REPLACEABLE (catalog-classified) —
    // "Microsoft 365, WordPress" is ammo; "AI, Apache, GTM" is noise. Honest
    // tag downgrade when nothing in the stack is replaceable.
    const replaceable = pickReplaceableTools(stack);
    signals.push({
      icon: Cpu,
      text: `${replaceable.length > 0 ? "Stack remplaçable" : "Stack détectée"} : ${(replaceable.length > 0 ? replaceable : stack).slice(0, 3).join(", ")}`,
      tag: replaceable.length > 0 ? "Levier Pilae" : "Stack",
    });
  }
  // Honest cold framing when nothing fired — never generic filler.
  const coldReason = company?.industry
    ? `${company.industry}${company.sizeBand ? ` · ${company.sizeBand}` : ""} — froid sur le profil ICP : ancrer sur le coût et le renouvellement.`
    : "Appel à froid — ancrer sur le coût, le renouvellement et la souveraineté.";

  // 3) Relationship — cold vs warm, fully grounded (deals + activities are real).
  const openDeal = deals[0];
  const lastActivity = activities[0];
  const relationship = openDeal
    ? `Deal lié : ${openDeal.name} · ${openDeal.stage}`
    : lastActivity
      ? `Déjà en contact — ${lastActivity.summary ?? lastActivity.type.replace(/_/g, " ")} · ${relTime(lastActivity.occurredAt)}`
      : focal?.lastTouchAt
        ? `Dernier contact ${relTime(focal.lastTouchAt)}`
        : "Premier contact — froid, jamais touché.";

  // What's still worth pulling before the call — honest gap list.
  // Only ACTIONABLE gaps — things the rep can fix before dialling. The
  // "absences" (no signal / no activity / no deal) are the default on a cold
  // call, not gaps worth a line; the Relation line already says it's cold.
  const gaps: string[] = [];
  if (!focal?.email && !brainLoading) gaps.push("Email direct introuvable");
  if (selected.accessibilityScore <= 0.5) gaps.push("Numéro non qualifié (standard probable)");

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      {/* Collision heads-up: a teammate already worked this prospect recently
          (soft, non-blocking — informs, never gates the call). */}
      <ContactCollisionNotice contactId={selected.contactId} lang="fr" />

      {/* ── Expert brief: situational intelligence (the script lives on the right) ── */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div
          className="flex items-center gap-2.5 px-4 py-2.5"
          style={{ background: focal?.isChampion ? "rgba(217,119,6,.07)" : isSenior ? "rgba(16,185,129,.07)" : "rgba(99,102,241,.05)" }}
        >
          {focal?.isChampion ? (
            <Crown className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Target className="h-4 w-4 shrink-0" style={{ color: isSenior ? "rgb(16,185,129)" : "rgb(99,102,241)" }} />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Autorité</div>
            <p className="truncate text-[13px] font-medium leading-snug text-zinc-800 dark:text-zinc-100">
              {authorityLabel}
              {displayTitle && (
                <span className="font-normal text-zinc-500"> · {displayTitle}</span>
              )}
            </p>
            {/* We verify the role ourselves on LinkedIn (no "à confirmer"
                label). Confirmed → a verified badge; left → the LinkedIn truth
                (these are normally dropped from the list upstream). The manual
                "a quitté ce poste" stays as an override. */}
            <div className="mt-0.5 flex items-center gap-2">
              {verification?.status === "confirmed" ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="h-3 w-3" />
                  poste vérifié sur LinkedIn{verification.at ? ` · ${relativeFr(verification.at)}` : ""}
                </span>
              ) : verification?.status === "left" ? (
                <span className="text-[10px] text-rose-600 dark:text-rose-400">
                  a quitté ce poste{verification.company ? ` — désormais ${verification.title ? `${verification.title}, ` : ""}${verification.company} (LinkedIn)` : " (LinkedIn)"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={markRoleObsolete}
                disabled={markingLeft}
                className="text-[10px] font-medium text-zinc-400 underline-offset-2 transition-colors hover:text-rose-600 hover:underline disabled:opacity-50"
              >
                {markingLeft ? "…" : "a quitté ce poste"}
              </button>
            </div>
          </div>
          {focal?.intentTrend && <IntentTrend trend={focal.intentTrend} />}
        </div>
        <div
          className="divide-y divide-zinc-100 dark:divide-zinc-800"
          style={{ borderTop: "1px solid var(--color-border-default)" }}
        >
          {/* Signaux — the concrete why-now, promoted (was a single buried line) */}
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              <Radio className="h-3.5 w-3.5" />
              {signals.length > 0 ? "Signaux — pourquoi maintenant" : "Pourquoi maintenant"}
            </div>
            {signals.length > 0 ? (
              <ul className="mt-1.5 space-y-1.5">
                {signals.map((sig, i) => {
                  const Icon = sig.icon;
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${sig.hot ? "text-emerald-500" : "text-zinc-400"}`} />
                      <span className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-800 dark:text-zinc-100">{sig.text}</span>
                      <span
                        className="shrink-0 rounded-sm px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
                      >
                        {sig.tag}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-0.5 text-[13px] leading-snug text-zinc-700 dark:text-zinc-300">{coldReason}</p>
            )}
          </div>
          <HeroBullet icon={Activity} label="Relation" value={relationship} />
        </div>
      </div>

      {/* Société : secteur · taille · géographie · heure locale — grounded context up
          front, plus a direct way to enrich the person. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {company?.industry && <ContextChip icon={industryIcon(company.industry)}>{company.industry}</ContextChip>}
        {company?.sizeBand && <ContextChip icon={Users}>{company.sizeBand}</ContextChip>}
        {geo && <ContextChip icon={Globe}>{geo}</ContextChip>}
        {selected.localTime && <ContextChip icon={Clock}>{selected.localTime} (heure locale)</ContextChip>}
        {onEnrich && (
          <button
            onClick={onEnrich}
            disabled={enriching}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            <Zap className="h-3 w-3" />
            {enriching ? "Enrichissement…" : "Enrichir ce contact"}
          </button>
        )}
      </div>

      {/* Qui est-ce / ce que fait l'entreprise d'après SON site — auto-built,
          caché 30 j (carrière Apollo + homepage réelle + une passe LLM groundée). */}
      <ProspectBriefCard contactId={selected.contactId} />

      {/* Gaps to enrich — actionable, stays visible above the collapsed dossier */}
      {gaps.length > 0 && (
        <Section icon={Search} title="À enrichir avant l'appel" count={gaps.length}>
          <div className="flex flex-wrap gap-1.5">
            {gaps.map((g, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px]"
                style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
              >
                <AlertTriangle className="h-3 w-3" />
                {g}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Collapsible full dossier — the dense reference, one click away ── */}
      <button
        onClick={() => setShowDossier((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-[12px] font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        <span>Dossier complet — historique, deals, paysage</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${showDossier ? "rotate-180" : ""}`} />
      </button>

      {showDossier && (
        <div className="space-y-6">
          {/* Score / quick facts / champion-badge intentionally removed: the
              score is queue-prioritisation metadata (still in the queue badge),
              and heure/numéro/poste/champion are already shown above. The
              dossier keeps only what isn't elsewhere. */}

      {/* Paysage concurrentiel — the one research fact not already promoted to
          Signaux (funding / hiring / stack now live at the top). */}
      {dossier?.competitiveLandscape && (
        <Section icon={Swords} title="Paysage concurrentiel">
          <p className="text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">{dossier.competitiveLandscape}</p>
        </Section>
      )}

      {/* Historique direct */}
      <Section icon={Activity} title="Historique" count={activities.length}>
        {brainLoading ? (
          <BriefSkeleton rows={3} />
        ) : activities.length === 0 ? (
          <Muted>Aucune interaction passée — premier contact.</Muted>
        ) : (
          <ol className="space-y-2">
            {activities.slice(0, 6).map((a) => {
              const Icon = activityIcon(a.type);
              return (
                <li key={a.id} className="flex gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <Icon className="h-3 w-3 text-zinc-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                      {a.summary ?? a.type.replace(/_/g, " ")}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {a.actorName ? `${a.actorName} · ` : ""}{a.direction ? `${a.direction} · ` : ""}{relTime(a.occurredAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {/* Deals liés */}
      {(deals.length > 0 || brainLoading) && (
        <Section icon={Briefcase} title="Deals liés" count={deals.length}>
          {brainLoading ? (
            <BriefSkeleton rows={1} />
          ) : (
            <div className="space-y-2">
              {deals.map((d) => (
                <DealRow key={d.id} deal={d} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* The pre-call brief deliberately stops at grounded data — activities,
          deals and the research dossier all trace to a real source. We do NOT
          surface free-text "facts" inferred from the context graph / memory
          here: during a live cold call an ungrounded claim (a budget, a
          timeline) the rep then repeats is worse than silence. Re-add only once
          each memory carries a citation the rep can trust. */}

      {/* end of collapsible dossier */}
        </div>
      )}
    </div>
  );
}

function HeroBullet({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  trend?: BrainContact["intentTrend"] | null;
}) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{label}</div>
        <p className="mt-0.5 text-[13px] leading-snug text-zinc-700 dark:text-zinc-300">{value}</p>
      </div>
      {trend && <IntentTrend trend={trend} />}
    </div>
  );
}

function DealRow({ deal }: { deal: BrainDeal }) {
  const tone = riskTone(deal.riskLevel);
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{deal.name}</span>
        <span className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatValue(deal.value)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{deal.stage}</span>
        {deal.riskLevel && deal.riskLevel !== "none" && (
          <span className="rounded-full px-2 py-0.5" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
        )}
        {deal.stallProbability != null && deal.stallProbability >= 0.5 && (
          <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(234,179,8,.12)", color: "rgb(133,77,14)" }}>
            Stall {Math.round(deal.stallProbability * 100)}%
          </span>
        )}
      </div>
      {deal.riskReasons.length > 0 && (
        <p className="mt-1.5 text-[12px] text-zinc-500">{deal.riskReasons[0]}</p>
      )}
    </div>
  );
}

// ── Account brain (right column) ────────────────────────────────

export function AccountBrainPanel({
  brain,
  brainLoading,
  focalContactId,
}: {
  brain: ContactBrainJSON | null | undefined;
  brainLoading: boolean;
  focalContactId: string;
}) {
  if (brainLoading && !brain) {
    return (
      <div className="p-5 space-y-4">
        <BriefSkeleton rows={5} />
      </div>
    );
  }
  if (!brain) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        Aucun compte rattaché à ce contact. Rattachez-le à une entreprise pour
        afficher le contexte du compte ici.
      </div>
    );
  }

  const { company, contacts, deals, knowledgeEntries } = brain.companyBrain;
  // Dedupe the buying committee: drop the focal contact, and never list the
  // same person twice (by id AND by name) — a duplicated member reads as amateur.
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const committee = contacts.filter((c) => {
    if (c.id === focalContactId) return false;
    const nameKey = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim().toLowerCase();
    if (c.id && seenIds.has(c.id)) return false;
    if (nameKey && seenNames.has(nameKey)) return false;
    if (c.id) seenIds.add(c.id);
    if (nameKey) seenNames.add(nameKey);
    return true;
  });
  const dossier = brain.cachedDossier ?? null;
  const leadership = dossier?.leadership ?? [];

  return (
    <div className="p-5 space-y-6">
      {/* Company header */}
      <div className="flex items-start gap-3">
        <CompanyLogo domain={company.domain} name={company.name} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{company.name}</h3>
          <p className="truncate text-[12px] text-zinc-500">
            {[company.industry, company.sizeBand, company.location].filter(Boolean).join(" · ") || "—"}
          </p>
          {company.domain && (
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:underline"
            >
              <Globe className="h-3 w-3" />
              {company.domain}
            </a>
          )}
        </div>
        {company.score != null && (
          <div className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-center dark:bg-zinc-800">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{Math.round(company.score)}</div>
            <div className="text-[9px] uppercase text-zinc-400">score</div>
          </div>
        )}
      </div>

      {/* Buying committee */}
      <Section icon={Users} title="Comité d'achat" count={committee.length}>
        {committee.length === 0 ? (
          <Muted>Aucun autre contact connu chez ce compte.</Muted>
        ) : (
          <div className="space-y-2">
            {committee.slice(0, 6).map((c) => {
              const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "—";
              return (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="group -mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  title={`Ouvrir ${name} — appeler ou écrire`}
                >
                  <Avatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-zinc-800 group-hover:text-indigo-600 dark:text-zinc-200 dark:group-hover:text-indigo-300">{name}</span>
                      {c.isChampion && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
                    </div>
                    <div className="truncate text-[11px] text-zinc-400">{c.title ?? "—"}</div>
                  </div>
                  {c.intentScore != null && (
                    <span className="shrink-0 text-[11px] font-medium text-zinc-500">{Math.round(c.intentScore * 100)}</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition group-hover:text-indigo-500" />
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      {/* Direction (from cached dossier — carries LinkedIn URLs) */}
      {leadership.length > 0 && (
        <Section icon={LinkedInGlyph} title="Direction" count={leadership.length}>
          <div className="space-y-2">
            {dossier?.recommendedApproach?.bestContact && (
              <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                <Target className="h-3 w-3 text-indigo-500" />
                Meilleur interlocuteur: {dossier.recommendedApproach.bestContact}
              </div>
            )}
            {leadership.slice(0, 6).map((l, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Avatar name={l.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-800 dark:text-zinc-200">{l.name}</div>
                  <div className="truncate text-[11px] text-zinc-400">{l.title}</div>
                </div>
                {l.linkedin && (
                  <a
                    href={l.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-zinc-400 transition hover:text-indigo-500"
                    title="Profil LinkedIn"
                  >
                    <LinkedInGlyph className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Pipeline */}
      {deals.length > 0 && (
        <Section icon={Building2} title="Pipeline du compte" count={deals.length}>
          <div className="space-y-2">
            {deals.slice(0, 5).map((d) => (
              <DealRow key={d.id} deal={d} />
            ))}
          </div>
        </Section>
      )}

      {/* Knowledge base — authored entries only. We intentionally don't render
          context-graph edges or memory items here: they are inferred, unsourced
          claims, and a cold-call brief must show only facts the rep can stand
          behind. */}
      {knowledgeEntries.length > 0 && (
        <Section icon={Brain} title="Base de connaissances">
          <div className="space-y-2">
            {knowledgeEntries.slice(0, 4).map((k) => (
              <FactLine key={k.id} dot="bg-emerald-400" text={k.title} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function FactLine({ dot, text }: { dot: string; text: string }) {
  return (
    <div className="flex items-start gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
      <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${dot}`} />
      <span className="leading-snug">{text}</span>
    </div>
  );
}

// ── Live transcript (centre column, during/after call) ──────────

export interface TranscriptChunk {
  speaker: "agent" | "prospect" | string;
  text: string;
  tsMs?: number;
}

export interface CoachingCard {
  ts: number;
  objectionClass: string;
  label: string;
  prospectQuote: string;
  suggestedResponses: string[];
}

// ── In-call context rail (right column, live) ───────────────────
//
// On a live call the rep should not be reading the full account brain — they
// should be talking. So the right rail strips down to the only three things
// worth a glance mid-sentence — the line to open with, the angle, why this
// call is timely — pinned at the top, with the objection-coaching cards
// stacking underneath in real time as the prospect pushes back (newest first).
// This is the calm, live-assist counterpart to the dense pre-call brief.
export function InCallContext({
  selected,
  brain,
  coaching,
}: {
  selected: BriefContext;
  brain: ContactBrainJSON | null | undefined;
  coaching: CoachingCard[];
}) {
  const firstName = selected.contactName.split(" ")[0];
  const approach = brain?.cachedDossier?.recommendedApproach;
  const opener =
    approach?.openingLine?.trim() ||
    `« Bonjour ${firstName}, j'ai 30 secondes ? »`;
  const angle = approach?.messagingAngle?.trim() || null;
  // Voiceable signals only — the campaign queue synthesizes a cadence
  // breadcrumb ({type:"call"}) that must never read as a "why now".
  const whyNow =
    selected.latestSignal && isVoiceableSignal(selected.latestSignal.type)
      ? selected.latestSignal.label
      : null;
  const champion =
    brain?.companyBrain?.contacts?.find((c) => c.isChampion && c.id !== selected.contactId) ?? null;
  const championName = champion
    ? [champion.firstName, champion.lastName].filter(Boolean).join(" ")
    : null;
  const ordered = coaching.slice().reverse(); // newest objection on top

  return (
    <div className="flex h-full flex-col">
      {/* Pinned — the line to say, the angle, why now */}
      <div className="shrink-0 space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            <MessageSquare className="h-3.5 w-3.5" />
            À dire maintenant
          </div>
          <p className="mt-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-sm italic leading-snug text-zinc-800 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-zinc-100">
            {opener}
          </p>
        </div>
        {angle && (
          <div className="flex items-start gap-2 text-[13px]">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <p className="text-zinc-700 dark:text-zinc-300">
              <span className="text-zinc-400">Angle · </span>
              {angle}
            </p>
          </div>
        )}
        {whyNow && (
          <div className="flex items-start gap-2 text-[13px]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <p className="text-zinc-700 dark:text-zinc-300">
              <span className="text-zinc-400">Pourquoi maintenant · </span>
              {whyNow}
            </p>
          </div>
        )}
        {championName && (
          <div className="flex items-start gap-2 text-[13px]">
            <Crown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-zinc-700 dark:text-zinc-300">
              <span className="text-zinc-400">Allié interne · </span>
              {championName}
              {champion?.title ? ` (${champion.title})` : ""}
            </p>
          </div>
        )}
      </div>

      {/* Live objection coaching — stacks as the prospect pushes back */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <Swords className="h-3.5 w-3.5" />
          Réponses aux objections
          {ordered.length > 0 && <span className="text-zinc-400">· {ordered.length}</span>}
        </div>
        {ordered.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Les objections détectées dans la conversation s&apos;afficheront ici, en direct, avec
            2-3 réponses prêtes à dire.
          </p>
        ) : (
          <div className="space-y-2">
            {ordered.map((card) => (
              <div
                key={card.ts}
                className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {card.label}
                </div>
                <div className="mt-0.5 text-[12px] italic text-zinc-500">
                  « {card.prospectQuote} »
                </div>
                {card.suggestedResponses.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {card.suggestedResponses.map((r, i) => (
                      <li
                        key={i}
                        className="rounded bg-zinc-50 px-2 py-1.5 text-[12px] leading-snug text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveTranscript({
  chunks,
  ended,
  connectedAtMs,
  coaching = [],
}: {
  chunks: TranscriptChunk[];
  ended: boolean;
  connectedAtMs: number | null;
  coaching?: CoachingCard[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);

  // Tick a 1s timer while live so the elapsed clock advances.
  useEffect(() => {
    if (ended || connectedAtMs == null) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ended, connectedAtMs]);

  // Auto-scroll to the newest chunk.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunks.length]);

  const elapsed = connectedAtMs ? Math.max(0, Math.floor((Date.now() - connectedAtMs) / 1000)) : 0;
  const mm = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");

  // Méthodology execution — computed instantly client-side at hang-up from the
  // in-memory chunks (the worker persists the same result for history). Null
  // on thin transcripts: no verdict on a voicemail.
  const lever = useMemo(() => (ended ? scoreTranscriptLevers(chunks) : null), [ended, chunks]);

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-2.5">
        <div className="flex items-center gap-2 text-[12px]">
          {ended ? (
            <>
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              <span className="text-zinc-500">Appel terminé · transcription figée</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
              </span>
              <span className="font-medium text-red-600 dark:text-red-400">En direct</span>
            </>
          )}
          <span className="flex items-center gap-1 text-zinc-400">
            <Radio className="h-3 w-3" /> Deepgram Nova-3
          </span>
        </div>
        {connectedAtMs && (
          <span className="font-mono text-[12px] text-zinc-500">{mm}:{ss}</span>
        )}
      </div>

      {/* Transcript stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {chunks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            {ended ? (
              <p className="max-w-sm text-sm text-zinc-500">
                Aucune parole captée. Si l&apos;appel a bien connecté, vérifiez que le
                bridge de streaming (voice-stream-server) tourne et que
                VOICE_STREAM_PUBLIC_URL pointe dessus.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </div>
                <p className="mt-3 text-sm text-zinc-500">À l&apos;écoute… la transcription apparaît dès le premier mot.</p>
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-3">
            {chunks.map((c, i) => {
              const isAgent = c.speaker === "agent";
              return (
                <div key={i} className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] ${isAgent ? "items-end" : "items-start"} flex flex-col`}>
                    <span className={`mb-0.5 text-[10px] uppercase tracking-wide ${isAgent ? "text-indigo-500" : "text-zinc-400"}`}>
                      {isAgent ? "Vous" : "Prospect"}
                      {typeof c.tsMs === "number" && (
                        <span className="ml-1.5 text-zinc-300 dark:text-zinc-600">
                          {Math.floor(c.tsMs / 60000).toString().padStart(2, "0")}:
                          {Math.floor((c.tsMs % 60000) / 1000).toString().padStart(2, "0")}
                        </span>
                      )}
                    </span>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                        isAgent
                          ? "rounded-br-sm bg-indigo-600 text-white"
                          : "rounded-bl-sm bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                      }`}
                    >
                      {c.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Post-call execution — what the methodology heard, the moment it
          matters. Deterministic (words said or not), one drill max. */}
      {ended && lever && (
        <div className="shrink-0 border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Exécution
            <span className="font-normal normal-case tracking-normal text-zinc-400">
              vous avez parlé {lever.talkRatioPct}% (cible ~55%)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ["Permission", lever.openerPermission],
              ["Raison", lever.reasonStated],
              ["Dé-risque", lever.askDerisked],
              ["Créneau guidé", lever.binarySlot],
            ] as const).map(([label, ok]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]"
                style={{
                  background: ok ? "rgba(34,197,94,.08)" : "var(--color-bg-hover)",
                  color: ok ? "rgb(21,128,61)" : "var(--color-text-tertiary)",
                }}
              >
                {ok ? "✓" : "—"} {label}
              </span>
            ))}
            {lever.bannedOpener && (
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: "rgba(220,38,38,.08)", color: "rgb(185,28,28)" }}>
                Accroche bannie
              </span>
            )}
            {lever.deferUsed && (
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: "rgba(234,179,8,.10)", color: "rgb(133,77,14)" }}>
                Créneau déféré
              </span>
            )}
          </div>
          {lever.drill && (
            <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--color-text-secondary)" }}>
              <span className="font-medium" style={{ color: "rgb(133,77,14)" }}>À travailler : {DRILL_COPY[lever.drill].label}</span>
              <span style={{ color: "var(--color-text-tertiary)" }}> — {DRILL_COPY[lever.drill].hint}</span>
            </p>
          )}
        </div>
      )}

      {/* Post-call objections review */}
      {ended && coaching.length > 0 && (
        <div className="max-h-56 shrink-0 overflow-y-auto border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Objections rencontrées · {coaching.length}
          </div>
          <div className="space-y-2">
            {coaching.map((card) => (
              <div
                key={card.ts}
                className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
              >
                <div className="text-[11px] font-medium text-zinc-500">{card.label}</div>
                <div className="mt-0.5 text-[13px] italic text-zinc-600 dark:text-zinc-400">
                  « {card.prospectQuote} »
                </div>
                {card.suggestedResponses.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {card.suggestedResponses.map((r, i) => (
                      <li key={i} className="rounded bg-zinc-50 px-2 py-1 text-[12px] text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
      style={{ animationDelay: delay }}
    />
  );
}

// ── Shared bits ─────────────────────────────────────────────────

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-zinc-400">{children}</p>;
}

function BriefSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800/60" />
      ))}
    </div>
  );
}
