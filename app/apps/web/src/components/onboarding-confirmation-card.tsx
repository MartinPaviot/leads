"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Shield, Target, Loader2, Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  INDUSTRIES,
  COMPANY_SIZES,
  GEOGRAPHIES,
  JOB_SENIORITIES,
  JOB_DEPARTMENTS,
} from "@/lib/config/icp-constants";

/**
 * WS-2 v2 onboarding confirmation card — collapses v1's welcome +
 * product + icp steps into a single page with three zones:
 *
 * 1. Identity + product (Category A fields)
 *    — shown with AI-inference attribution badges where applicable.
 *    — editable inline.
 *    — `aiTone` surfaces the LLM-suggested value explicitly (no silent
 *      override, per WS-0 audit bug BUG-WS0-004).
 *
 * 2. Targeting (Category B fields)
 *    — preset verticals + tighter/looser adjuster (simplified for v1
 *      of this component; full adjuster lands in a follow-up polish
 *      pass once Martin has the UX signal).
 *    — live Apollo count via GET /api/tam/estimate, debounced 400 ms.
 *
 * 3. Guardrails (Category C fields)
 *    — informational reuse of WS-1 infrastructure; the actual controls
 *      live in Settings → Guardrails. The card surfaces the user's
 *      current defaults so they know what they're opting into.
 *
 * Gated behind `onboarding.v2.confirmation-card` feature flag — the
 * parent wizard decides whether to render this component vs v1.
 */

export interface ConfirmationCardInferred {
  fullName: string;
  companyName: string;
  domain: string;
  /** Pre-filled from analyze-website; empty string when the LLM
   *  couldn't infer a meaningful description. */
  productDescription: string;
  /** Suggested tone from the LLM, or null when no suggestion. When
   *  non-null, the UI renders an attribution badge next to the tone
   *  radio. */
  suggestedTone: "Formal" | "Direct" | "Casual" | null;
  /** Current aiTone (starts at the tenant's default or "Direct"). */
  aiTone: string;
  /** Inferred from browser; user can override. */
  language: string;
  timezone: string;
  /** 0-1 confidence from the LLM's ICP inference. */
  overallConfidence: number;
  /** Fields flagged < 0.7 confidence by the LLM — UI highlights them. */
  lowConfidenceFields: string[];
}

/**
 * Targeting state — mirrors the full pushable Apollo org-search surface
 * (OrgSearchParams in lib/integrations/apollo-client) plus the two
 * people-level axes. Every field here has a downstream consumer:
 *   - org-level fields  → /api/tam/estimate (live count) + /api/tam (build)
 *   - people-level axes → persisted to settings, drive contact targeting
 *     via deriveTargetRoles()
 * "Everything that can be filtered is filtered" — no Apollo org filter is
 * left unexposed.
 */
export interface ConfirmationCardTargeting {
  // ── Company / firmographics ──
  industries: string[];
  /** Free keyword tags unioned with industries into q_organization_keyword_tags. */
  keywords: string[];
  companySizes: string[];
  /** revenue_range bounds, USD. null = unbounded on that side. */
  revenueMin: number | null;
  revenueMax: number | null;
  /** currently_using_any_of_technology_uids (display names → slugs server-side). */
  technologies: string[];
  geographies: string[];
  /** organization_not_locations. */
  excludeGeographies: string[];
  // ── Buying signals ──
  /** latest_funding_date_range.min = now − N days. null = any time. */
  fundingRecencyDays: number | null;
  /** total_funding_range bounds, USD. */
  totalFundingMin: number | null;
  totalFundingMax: number | null;
  /** organization_num_jobs_range.min — hiring-intent gate. */
  minJobOpenings: number | null;
  /** q_organization_job_titles — roles the company is actively hiring for. */
  hiringTitles: string[];
  // ── People ──
  targetSeniorities: string[];
  targetDepartments: string[];
}

export interface ConfirmationCardGuardrails {
  approvalMode: "review-each" | "batch-daily" | "auto-high-confidence";
  llmMonthlyCostCapUsd: number;
  sendingMailboxMode: string;
  sendingDailyCapPrimary: number;
}

export interface ConfirmationCardProps {
  inferred: ConfirmationCardInferred;
  targeting: ConfirmationCardTargeting;
  guardrails: ConfirmationCardGuardrails;
  onConfirm: (next: {
    identity: ConfirmationCardInferred;
    targeting: ConfirmationCardTargeting;
  }) => Promise<void>;
  onEdit: (next: {
    identity: ConfirmationCardInferred;
    targeting: ConfirmationCardTargeting;
  }) => void;
}

const TONE_OPTIONS: Array<"Formal" | "Direct" | "Casual"> = [
  "Formal",
  "Direct",
  "Casual",
];

function InferenceBadge({
  source,
  confidence,
}: {
  source: string;
  confidence?: number;
}) {
  const low = typeof confidence === "number" && confidence < 0.7;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
      style={{
        background: low
          ? "rgba(234,179,8,.12)"
          : "rgba(44,107,237,.08)",
        color: low ? "rgb(133,77,14)" : "var(--color-accent)",
      }}
      title={
        low
          ? "AI inferred this with low confidence — please verify"
          : `AI inferred this from ${source}`
      }
    >
      <Sparkles size={10} />
      AI · {source}
      {low && " · verify"}
    </span>
  );
}

/** Debounced Apollo count query — hits /api/tam/estimate with the
 *  current targeting params. Returns loading state + count + whether
 *  Apollo capped. */
function useApolloCount(targeting: ConfirmationCardTargeting) {
  const [count, setCount] = useState<{
    total: number | null;
    capped: boolean;
    loading: boolean;
  }>({ total: null, capped: false, loading: false });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // The estimate counts COMPANIES, so only org-level filters move the
    // number. If none are set, there's nothing to count yet.
    const hasOrgFilter =
      targeting.industries.length > 0 ||
      targeting.keywords.length > 0 ||
      targeting.companySizes.length > 0 ||
      targeting.geographies.length > 0 ||
      targeting.excludeGeographies.length > 0 ||
      targeting.technologies.length > 0 ||
      targeting.hiringTitles.length > 0 ||
      targeting.revenueMin !== null ||
      targeting.revenueMax !== null ||
      targeting.totalFundingMin !== null ||
      targeting.totalFundingMax !== null ||
      targeting.minJobOpenings !== null ||
      targeting.fundingRecencyDays !== null;
    if (!hasOrgFilter) {
      setCount({ total: null, capped: false, loading: false });
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setCount((prev) => ({ ...prev, loading: true }));
      fetch("/api/tam/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: targeting.industries,
          keywords: targeting.keywords,
          companySizes: targeting.companySizes,
          geographies: targeting.geographies,
          excludeGeographies: targeting.excludeGeographies,
          technologies: targeting.technologies,
          revenueMin: targeting.revenueMin,
          revenueMax: targeting.revenueMax,
          fundingRecencyDays: targeting.fundingRecencyDays,
          totalFundingMin: targeting.totalFundingMin,
          totalFundingMax: targeting.totalFundingMax,
          minJobOpenings: targeting.minJobOpenings,
          hiringTitles: targeting.hiringTitles,
        }),
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          setCount({
            total: data.total ?? null,
            capped: !!data.capped,
            loading: false,
          });
        })
        .catch(() => {
          setCount((prev) => ({ ...prev, loading: false }));
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [targeting]);

  return count;
}

export function OnboardingConfirmationCard({
  inferred: inferredInit,
  targeting: targetingInit,
  guardrails,
  onConfirm,
  onEdit,
}: ConfirmationCardProps) {
  const { toast } = useToast();
  const [identity, setIdentity] = useState(inferredInit);
  const [targeting, setTargeting] = useState(targetingInit);
  const [confirming, setConfirming] = useState(false);
  const apolloCount = useApolloCount(targeting);

  const updateIdentity = useCallback(
    (next: Partial<ConfirmationCardInferred>) => {
      setIdentity((prev) => ({ ...prev, ...next }));
    },
    [],
  );

  const updateTargeting = useCallback(
    (next: Partial<ConfirmationCardTargeting>) => {
      setTargeting((prev) => ({ ...prev, ...next }));
    },
    [],
  );

  // Notify the parent of edits in an effect — AFTER render — rather than from
  // inside the setState updater (which runs during render and caused
  // "Cannot update a component (OnboardingV2Wrapper) while rendering a
  // different component (OnboardingConfirmationCard)"). A ref keeps the
  // latest onEdit without re-firing the effect when its identity changes.
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const skipFirstEdit = useRef(true);
  useEffect(() => {
    if (skipFirstEdit.current) {
      skipFirstEdit.current = false;
      return;
    }
    onEditRef.current({ identity, targeting });
  }, [identity, targeting]);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm({ identity, targeting });
    } catch (err) {
      console.warn("confirmation-card: confirm failed", err);
      toast("Couldn't save your setup — please retry", "error");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Zone 1 — Identity + product */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--color-accent)" }} />
            <h2
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Here&apos;s what I picked up about you
            </h2>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Edit anything that doesn&apos;t match. Each field shows where the
            inference came from.
          </p>

          <div className="mt-3 space-y-3">
            <Field
              label="Your name"
              value={identity.fullName}
              onChange={(v) => updateIdentity({ fullName: v })}
            />
            <Field
              label="Company"
              value={identity.companyName}
              onChange={(v) => updateIdentity({ companyName: v })}
              badge={identity.domain ? (
                <InferenceBadge source={identity.domain} />
              ) : null}
            />
            <Field
              label="Company website"
              value={identity.domain}
              onChange={(v) => updateIdentity({ domain: v })}
              badge={<InferenceBadge source="your email" />}
            />
            <div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  What you sell
                </label>
                {identity.productDescription && (
                  <InferenceBadge
                    source="your website"
                    confidence={identity.overallConfidence}
                  />
                )}
              </div>
              <textarea
                value={identity.productDescription}
                onChange={(e) => updateIdentity({ productDescription: e.target.value })}
                rows={2}
                className="mt-0.5 w-full rounded-md px-2 py-1 text-[12px]"
                style={{
                  background: "var(--color-bg-page)",
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-primary)",
                  resize: "vertical",
                }}
              />
            </div>

            {/* aiTone — explicit surface (silent override removed) */}
            <div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Email tone
                </label>
                {identity.suggestedTone && identity.suggestedTone !== identity.aiTone && (
                  <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                    AI suggests <strong>{identity.suggestedTone}</strong> — change below if needed
                  </span>
                )}
              </div>
              <div className="mt-1 flex gap-1.5">
                {TONE_OPTIONS.map((tone) => {
                  const active = identity.aiTone === tone;
                  return (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => updateIdentity({ aiTone: tone })}
                      className="rounded-full px-3 py-1 text-[11px]"
                      style={{
                        background: active
                          ? "var(--color-accent)"
                          : "var(--color-bg-page)",
                        color: active
                          ? "white"
                          : "var(--color-text-primary)",
                        border: `1px solid ${
                          active
                            ? "var(--color-accent)"
                            : "var(--color-border-default)"
                        }`,
                      }}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Zone 2 — Targeting */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <Target size={16} style={{ color: "var(--color-accent)" }} />
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Who you&apos;re going after
            </h2>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Adjust anything that doesn&apos;t fit. The live count below reflects your current criteria.
          </p>

          <div className="mt-3 space-y-4">
            {/* Company / firmographics */}
            <FilterGroup label="Company">
              <TargetingRow
                label="Industries"
                items={targeting.industries}
                onChange={(v) => updateTargeting({ industries: v })}
                options={INDUSTRIES}
                placeholder="Search industries — e.g. Computer Software"
              />
              <TargetingRow
                label="Keywords"
                items={targeting.keywords}
                onChange={(v) => updateTargeting({ keywords: v })}
                options={[]}
                placeholder="Type a keyword and press Enter — e.g. developer tools"
              />
              <TargetingRow
                label="Company sizes"
                items={targeting.companySizes}
                onChange={(v) => updateTargeting({ companySizes: v })}
                options={COMPANY_SIZES}
                placeholder="Search sizes — e.g. 11-50"
              />
              <RangeRow
                label="Annual revenue (USD)"
                min={targeting.revenueMin}
                max={targeting.revenueMax}
                onChange={(min, max) =>
                  updateTargeting({ revenueMin: min, revenueMax: max })
                }
                prefix="$"
              />
              <TargetingRow
                label="Technologies used"
                items={targeting.technologies}
                onChange={(v) => updateTargeting({ technologies: v })}
                options={[]}
                placeholder="Type a technology and press Enter — e.g. Kubernetes"
              />
              <TargetingRow
                label="Geographies"
                items={targeting.geographies}
                onChange={(v) => updateTargeting({ geographies: v })}
                options={GEOGRAPHIES}
                placeholder="Search geographies — e.g. United States"
              />
              <TargetingRow
                label="Exclude geographies"
                items={targeting.excludeGeographies}
                onChange={(v) => updateTargeting({ excludeGeographies: v })}
                options={GEOGRAPHIES}
                placeholder="Search geographies to exclude — e.g. India"
              />
            </FilterGroup>

            {/* Buying signals */}
            <FilterGroup label="Buying signals">
              <SelectRow
                label="Recently funded"
                value={targeting.fundingRecencyDays}
                onChange={(v) => updateTargeting({ fundingRecencyDays: v })}
                options={[
                  { label: "Any time", value: null },
                  { label: "Last 90 days", value: 90 },
                  { label: "Last 6 months", value: 180 },
                  { label: "Last 12 months", value: 365 },
                ]}
              />
              <RangeRow
                label="Total funding raised (USD)"
                min={targeting.totalFundingMin}
                max={targeting.totalFundingMax}
                onChange={(min, max) =>
                  updateTargeting({ totalFundingMin: min, totalFundingMax: max })
                }
                prefix="$"
              />
              <NumberRow
                label="Min. active job postings"
                value={targeting.minJobOpenings}
                onChange={(v) => updateTargeting({ minJobOpenings: v })}
                placeholder="e.g. 1 — companies actively hiring"
              />
              <TargetingRow
                label="Hiring for titles"
                items={targeting.hiringTitles}
                onChange={(v) => updateTargeting({ hiringTitles: v })}
                options={[]}
                placeholder="Type a title and press Enter — e.g. Account Executive"
              />
            </FilterGroup>

            {/* People */}
            <FilterGroup label="People (who you'll reach inside each company)">
              <TargetingRow
                label="Seniorities"
                items={targeting.targetSeniorities}
                onChange={(v) => updateTargeting({ targetSeniorities: v })}
                options={JOB_SENIORITIES}
                placeholder="Search seniorities — e.g. C-Suite"
              />
              <TargetingRow
                label="Departments"
                items={targeting.targetDepartments}
                onChange={(v) => updateTargeting({ targetDepartments: v })}
                options={JOB_DEPARTMENTS}
                placeholder="Search departments — e.g. Engineering"
              />
            </FilterGroup>
          </div>

          <div
            className="mt-3 rounded-md p-2 text-[12px]"
            style={{
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {apolloCount.loading ? (
              <span className="inline-flex items-center gap-1" style={{ color: "var(--color-text-tertiary)" }}>
                <Loader2 size={12} className="animate-spin" /> Computing TAM…
              </span>
            ) : apolloCount.total === null ? (
              <span style={{ color: "var(--color-text-tertiary)" }}>
                Add at least one company filter to see the TAM estimate.
              </span>
            ) : (
              <span style={{ color: "var(--color-text-primary)" }}>
                <strong>
                  ≈ {apolloCount.capped ? "100,000+" : apolloCount.total.toLocaleString()}
                </strong>{" "}
                companies match your criteria.
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Zone 3 — Guardrails summary */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <Shield size={16} style={{ color: "var(--color-accent)" }} />
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Your sending protections
            </h2>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            By default, Elevay sends your first emails from your primary inbox with protective caps
            ({guardrails.sendingDailyCapPrimary}/day max, warm follow-ups to existing contacts only).
            We deliberately don&apos;t send cold outreach from your primary domain — it would damage your
            deliverability within weeks. When you&apos;re ready to scale to cold outreach, we&apos;ll walk you
            through setting up dedicated sending infrastructure.
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
            <div>
              <dt style={{ color: "var(--color-text-tertiary)" }}>Approval mode</dt>
              <dd className="mt-0.5 font-medium" style={{ color: "var(--color-text-primary)" }}>
                {guardrails.approvalMode}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--color-text-tertiary)" }}>LLM budget</dt>
              <dd className="mt-0.5 font-medium" style={{ color: "var(--color-text-primary)" }}>
                ${guardrails.llmMonthlyCostCapUsd}/mo
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--color-text-tertiary)" }}>Sending mode</dt>
              <dd className="mt-0.5 font-medium" style={{ color: "var(--color-text-primary)" }}>
                {guardrails.sendingMailboxMode}
              </dd>
            </div>
          </dl>
          <a
            href="/settings/guardrails"
            className="mt-3 inline-block text-[12px]"
            style={{ color: "var(--color-accent)" }}
          >
            Adjust guardrails →
          </a>
        </CardBody>
      </Card>

      <div className="pt-2">
        <Button
          onClick={() => void handleConfirm()}
          disabled={confirming}
          size="md"
        >
          {confirming ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Building your pipeline…
            </>
          ) : (
            <>
              <Check size={14} /> Looks right — build my pipeline
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  badge,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label
          className="text-[11px] font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {label}
        </label>
        {badge}
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** A labelled group of related filters with a faint section heading. */
function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </div>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

/** Parse a user-typed number, allowing "10k"/"1.5m"/"2b" shorthand and
 *  thousands separators. Returns null on empty/unparseable. */
function parseAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[,$\s]/g, "");
  if (!s) return null;
  const m = s.match(/^(\d*\.?\d+)([kmb])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  return Math.round(n * mult);
}

const NUM_INPUT_STYLE: React.CSSProperties = {
  background: "var(--color-bg-page)",
  border: "1px solid var(--color-border-default)",
  color: "var(--color-text-primary)",
};

/** A min/max numeric range with an optional unit prefix (e.g. "$"). */
function RangeRow({
  label,
  min,
  max,
  onChange,
  prefix,
}: {
  label: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  prefix?: string;
}) {
  return (
    <div>
      <label
        className="text-[11px] font-medium"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <AmountInput
          value={min}
          onChange={(v) => onChange(v, max)}
          placeholder={`${prefix ?? ""}Min`}
        />
        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          to
        </span>
        <AmountInput
          value={max}
          onChange={(v) => onChange(min, v)}
          placeholder={`${prefix ?? ""}Max`}
        />
      </div>
    </div>
  );
}

/** Uncontrolled-friendly amount field — keeps the user's raw text while
 *  typing, emits the parsed number on change. */
function AmountInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  // Reflect external resets (e.g. parent clears the field).
  useEffect(() => {
    setText((prev) => (parseAmount(prev) === value ? prev : value === null ? "" : String(value)));
  }, [value]);
  return (
    <input
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseAmount(e.target.value));
      }}
      inputMode="numeric"
      placeholder={placeholder}
      className="w-full rounded-md px-2 py-1 text-[12px]"
      style={NUM_INPUT_STYLE}
    />
  );
}

/** A single numeric "minimum" field. */
function NumberRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label
        className="text-[11px] font-medium"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </label>
      <div className="mt-1">
        <AmountInput value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    </div>
  );
}

/** A single-choice select rendered as a full-width native select. */
function SelectRow<T extends string | number | null>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ label: string; value: T }>;
}) {
  return (
    <div>
      <label
        className="text-[11px] font-medium"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </label>
      <select
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const picked = options.find(
            (o) => (o.value === null ? "" : String(o.value)) === e.target.value,
          );
          onChange((picked ? picked.value : null) as T);
        }}
        className="mt-1 w-full rounded-md px-2 py-1 text-[12px]"
        style={NUM_INPUT_STYLE}
      >
        {options.map((o) => (
          <option key={o.label} value={o.value === null ? "" : String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Targeting input — full-width search field (matching the Zone 1 identity
 * fields) backed by an autocomplete dropdown of the Apollo taxonomy for
 * this dimension (industries, sizes, geographies, seniorities,
 * departments — see lib/config/icp-constants). Selected values render as
 * removable chips above the field. Mirrors the MultiSelectDropdown pattern
 * from settings/icp so onboarding and settings stay consistent.
 *
 * When `options` is empty the field is a pure free-text chip input (used
 * for keywords / technologies / hiring titles, which have no fixed
 * taxonomy). Enter adds the top matching suggestion when there is one,
 * otherwise the raw text.
 */
function TargetingRow({
  label,
  items,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  options: readonly string[];
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = options.filter(
    (o) =>
      o.toLowerCase().includes(search.toLowerCase()) && !items.includes(o),
  );

  function add(value: string) {
    const v = value.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setSearch("");
    setOpen(false);
  }

  return (
    <div>
      <label
        className="text-[11px] font-medium"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {label}
      </label>

      {items.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== item))}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative mt-1">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) {
              e.preventDefault();
              add(filtered.length > 0 ? filtered[0] : search);
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-md px-2 py-1 text-[12px]"
          style={{
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
        />
        {open && search && filtered.length > 0 && (
          <div
            className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md py-1 shadow-lg"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {filtered.slice(0, 20).map((item) => (
              <button
                key={item}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px]"
                style={{ color: "var(--color-text-secondary)" }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(item)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
        {open && (
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setOpen(false);
              setSearch("");
            }}
          />
        )}
      </div>
    </div>
  );
}
