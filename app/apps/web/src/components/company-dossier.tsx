"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Users,
  DollarSign,
  Cpu,
  TrendingUp,
  Target,
  MessageSquare,
  Briefcase,
  AlertTriangle,
  Loader2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* ── Types matching the Dossier interface from lib/research/dossier-builder ── */

interface DossierLeader {
  name: string;
  title: string;
  linkedin?: string;
  relevance: string;
}

interface DossierFunding {
  totalRaised: string;
  lastRound: string;
  investors: string[];
  date: string;
}

interface DossierHiringSignal {
  role: string;
  department: string;
  signal: string;
}

interface DossierIcpFit {
  score: number;
  reasoning: string;
  gaps: string[];
}

interface DossierRecommendedApproach {
  bestContact: string;
  messagingAngle: string;
  timing: string;
  openingLine: string;
}

interface Dossier {
  company: {
    name: string;
    domain: string;
    industry: string;
    size: string;
    revenue: string;
    description: string;
  };
  leadership: DossierLeader[];
  funding: DossierFunding | null;
  techStack: string[];
  hiringSignals: DossierHiringSignal[];
  competitiveLandscape: string;
  icpFit: DossierIcpFit;
  recommendedApproach: DossierRecommendedApproach;
  sources: string[];
  generatedAt: string;
}

interface CompanyDossierProps {
  accountId: string;
  accountDomain: string | null;
  accountName: string;
  /**
   * CLE-07: optional registration seam so a page action can drive THIS card's
   * own `generateDossier` (spinner/poll/refresh stay identical). Additive — the
   * card renders identically when the prop is not passed. The page captures the
   * api into a ref and `accounts.generateDossier.run` calls `api.generate()`.
   */
  onRegister?: (api: { generate: () => Promise<void>; hasDomain: boolean }) => void;
}

export function CompanyDossier({ accountId, accountDomain, accountName, onRegister }: CompanyDossierProps) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountDomain) {
      setLoading(false);
      return;
    }
    fetchDossier();
  }, [accountDomain]);

  // CLE-07: expose this card's own generateDossier + hasDomain to the page once
  // (and whenever the domain flips). Reads via a ref-stable callback so the
  // generate path is exactly the button's path — no duplicated POST.
  const generateRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    onRegister?.({ generate: () => generateRef.current(), hasDomain: !!accountDomain });
  }, [onRegister, accountDomain]);

  async function fetchDossier() {
    if (!accountDomain) return;
    setLoading(true);
    setError(null);
    setLoadError(false);
    try {
      const res = await fetch(`/api/research/dossier?company=${encodeURIComponent(accountDomain)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.company) {
          setDossier(data);
        } else {
          // 200 with no dossier = genuinely not generated yet → CTA.
          setDossier(null);
        }
      } else {
        // A 500 used to fall through to the "Generate dossier" CTA, masking a
        // backend failure as "no dossier yet". Flag it so we can say so.
        setDossier(null);
        setLoadError(true);
      }
    } catch {
      setDossier(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function generateDossier() {
    if (!accountDomain) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/research/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: accountDomain }),
      });
      if (res.ok) {
        // Poll for the result after a short delay
        setTimeout(() => fetchDossier(), 3000);
      } else {
        setError("Failed to start dossier generation");
      }
    } catch {
      setError("Failed to start dossier generation");
    } finally {
      setGenerating(false);
    }
  }
  // CLE-07: keep the registration ref pointed at the live generateDossier so the
  // action drives the exact same handler the button does.
  generateRef.current = generateDossier;

  async function refreshDossier() {
    if (!accountDomain) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/research/dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: accountDomain }),
      });
      if (res.ok) {
        setTimeout(() => {
          fetchDossier();
          setRefreshing(false);
        }, 3000);
      } else {
        setError("Failed to refresh dossier");
        setRefreshing(false);
      }
    } catch {
      setError("Failed to refresh dossier");
      setRefreshing(false);
    }
  }

  // No domain available
  if (!accountDomain) {
    return (
      <div
        className="rounded-lg p-3"
        style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Target size={12} style={{ color: "var(--color-text-tertiary)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Research Dossier
          </span>
        </div>
        <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          Add a domain to this account to generate a research dossier.
        </p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div
        className="rounded-lg p-3"
        style={{ background: "var(--color-accent-soft)", border: "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)" }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Target size={12} style={{ color: "var(--color-accent)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
            Research Dossier
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
          <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Loading dossier...</span>
        </div>
      </div>
    );
  }

  // Load failed -- a 500/network error must NOT look like "no dossier yet".
  if (loadError && !dossier) {
    return (
      <div
        role="alert"
        className="rounded-lg p-4"
        style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-error)" }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle size={12} style={{ color: "var(--color-error)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-error)" }}>
            Research Dossier
          </span>
        </div>
        <p className="text-[12px] mb-3" style={{ color: "var(--color-text-secondary)" }}>
          Couldn&apos;t load the research dossier for {accountName}. This is not the
          same as no dossier — the request failed.
        </p>
        <Button
          variant="outline"
          size="sm"
          icon={loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          onClick={fetchDossier}
          disabled={loading}
        >
          {loading ? "Retrying..." : "Retry"}
        </Button>
      </div>
    );
  }

  // No dossier exists -- show CTA
  if (!dossier) {
    return (
      <div
        className="rounded-lg p-4"
        style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Target size={12} style={{ color: "var(--color-text-tertiary)" }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Research Dossier
          </span>
        </div>
        <p className="text-[12px] mb-3" style={{ color: "var(--color-text-secondary)" }}>
          No research dossier available for {accountName}. Generate one to get leadership, funding, tech stack, competitive landscape, and outreach recommendations.
        </p>
        {error && (
          <p className="text-[11px] mb-2" style={{ color: "var(--color-error)" }}>{error}</p>
        )}
        <Button
          variant="gradient"
          size="sm"
          icon={generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          onClick={generateDossier}
          disabled={generating}
        >
          {generating ? "Generating..." : "Generate research dossier"}
        </Button>
      </div>
    );
  }

  // Dossier exists -- render full view
  const daysAgo = Math.floor(
    (Date.now() - new Date(dossier.generatedAt).getTime()) / 86400000
  );

  return (
    <div
      className="rounded-lg"
      style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
    >
      {/* Header — a div (not a <button>) so the inner Refresh button isn't an
          invalid nested <button> (caused a hydration error). Keyboard-accessible
          via role/tabIndex/onKeyDown. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 transition-colors"
        style={{ borderBottom: expanded ? "1px solid var(--color-border-default)" : "none" }}
      >
        <div className="flex items-center gap-2">
          <Target size={13} style={{ color: "var(--color-accent)" }} />
          <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
            Research Dossier
          </span>
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            Updated {daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="icon"
            size="sm"
            onClick={(e) => { e.stopPropagation(); refreshDossier(); }}
            disabled={refreshing}
            title="Refresh dossier"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </Button>
          {expanded ? <ChevronUp size={14} style={{ color: "var(--color-text-tertiary)" }} /> : <ChevronDown size={14} style={{ color: "var(--color-text-tertiary)" }} />}
        </div>
      </div>

      {error && (
        <p className="px-4 py-2 text-[11px]" style={{ color: "var(--color-error)" }}>{error}</p>
      )}

      {expanded && (
        <div className="px-4 py-3 space-y-4">
          {/* Recommended Approach -- highlighted callout */}
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--color-accent-soft)", border: "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)" }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare size={12} style={{ color: "var(--color-accent)" }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>
                Recommended Approach
              </span>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Best Contact</p>
                <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{dossier.recommendedApproach.bestContact}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Messaging Angle</p>
                <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>{dossier.recommendedApproach.messagingAngle}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Timing</p>
                <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{dossier.recommendedApproach.timing}</p>
              </div>
              <div
                className="rounded-md p-2 mt-1"
                style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
              >
                <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--color-text-tertiary)" }}>Opening Line</p>
                <p className="text-[12px] italic leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
                  &ldquo;{dossier.recommendedApproach.openingLine}&rdquo;
                </p>
              </div>
            </div>
          </div>

          {/* ICP Fit */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target size={12} style={{ color: "var(--color-text-tertiary)" }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                ICP Fit
              </span>
              {/not configured|scoring unavailable|unavailable \(/i.test(dossier.icpFit.reasoning) ? (
                <span className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>Not scored</span>
              ) : (
                <IcpScoreBadge score={dossier.icpFit.score} />
              )}
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {dossier.icpFit.reasoning}
            </p>
            {dossier.icpFit.gaps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {dossier.icpFit.gaps.map((gap, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--color-error-soft)", color: "var(--color-error)", border: "1px solid var(--color-error)20" }}
                  >
                    <AlertTriangle size={9} />
                    {gap}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Leadership */}
          {dossier.leadership.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={12} style={{ color: "var(--color-text-tertiary)" }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Leadership ({dossier.leadership.length})
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {dossier.leadership.map((leader, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-md p-2"
                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0"
                      style={{ background: "var(--color-accent)", color: "white" }}>
                      {leader.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                          {leader.name}
                        </p>
                        {leader.linkedin && (
                          <a
                            href={leader.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={10} style={{ color: "var(--color-accent)" }} />
                          </a>
                        )}
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{leader.title}</p>
                      <span
                        className="inline-block mt-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
                        style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)", border: "1px solid var(--color-border-default)" }}
                      >
                        {leader.relevance}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Funding */}
          {dossier.funding && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <DollarSign size={12} style={{ color: "var(--color-text-tertiary)" }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Funding
                </span>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <div>
                  <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Total Raised</p>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--color-success)" }}>{dossier.funding.totalRaised}</p>
                </div>
                <div
                  className="h-8"
                  style={{ width: 1, background: "var(--color-border-default)" }}
                />
                <div>
                  <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Last Round</p>
                  <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{dossier.funding.lastRound}</p>
                </div>
                {dossier.funding.date && dossier.funding.date !== "Unknown" && (
                  <>
                    <div
                      className="h-8"
                      style={{ width: 1, background: "var(--color-border-default)" }}
                    />
                    <div>
                      <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Date</p>
                      <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{dossier.funding.date}</p>
                    </div>
                  </>
                )}
              </div>
              {dossier.funding.investors.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dossier.funding.investors.map((investor, i) => (
                    <Badge key={i} variant="neutral" size="sm">{investor}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tech Stack */}
          {dossier.techStack.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu size={12} style={{ color: "var(--color-text-tertiary)" }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Tech Stack ({dossier.techStack.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {dossier.techStack.map((tech, i) => (
                  <span
                    key={i}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: "var(--color-info-soft)",
                      color: "var(--color-info)",
                      border: "1px solid var(--color-info)20",
                    }}
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hiring Signals */}
          {dossier.hiringSignals.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Briefcase size={12} style={{ color: "var(--color-text-tertiary)" }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Hiring Signals ({dossier.hiringSignals.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {dossier.hiringSignals.map((signal, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md p-2"
                    style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                  >
                    <TrendingUp size={12} className="flex-shrink-0 mt-0.5" style={{ color: "var(--color-warning)" }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {signal.role}
                        </span>
                        <Badge variant="neutral" size="sm">{signal.department}</Badge>
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                        {signal.signal}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Competitive Landscape */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp size={12} style={{ color: "var(--color-text-tertiary)" }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                Competitive Landscape
              </span>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {dossier.competitiveLandscape}
            </p>
          </div>

          {/* Sources */}
          {dossier.sources.length > 0 && (
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
              <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Sources:</span>
              {dossier.sources.map((source, i) => (
                <span key={i} className="text-[9px]" style={{ color: "var(--color-text-muted)" }}>
                  {source}{i < dossier.sources.length - 1 ? " /" : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ICP Score Badge ── */

function IcpScoreBadge({ score }: { score: number }) {
  let variant: "success" | "warning" | "error" | "neutral" = "neutral";
  if (score >= 70) variant = "success";
  else if (score >= 40) variant = "warning";
  else variant = "error";

  return (
    <Badge variant={variant} size="sm">
      {score}%
    </Badge>
  );
}
