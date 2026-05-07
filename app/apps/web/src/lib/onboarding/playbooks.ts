/**
 * Vertical-specific playbook registry (Sprint-3 audit follow-up).
 *
 * Maps the founder's Phase-1 industry input to the right playbook
 * from `_research/playbooks/`. Used at Phase 4 (Signals) of the
 * 7-phase wizard to pre-fill 5 canonical signals + 3 sequence
 * templates instead of starting from a blank field.
 *
 * The mapping is intentionally conservative : keyword-based, no
 * LLM. Each industry token maps to at most one playbook ; ambiguous
 * inputs return the b2b-saas-ops generic fallback.
 *
 * Adding a new vertical :
 *   1. Drop `_research/playbooks/<slug>.md` with the canonical
 *      sections (TAM, signals, sequences, stages, objections, geo).
 *   2. Add an entry to `PLAYBOOKS` below.
 *   3. Add detection keywords to `KEYWORDS_FOR`.
 *   4. Update tests.
 */

export type PlaybookSlug =
  | "devtools"
  | "fintech"
  | "healthtech"
  | "ecommerce"
  | "b2b-saas-ops";

export interface PlaybookSignal {
  /** Canonical key surfaced in the UI as a chip the user can toggle. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** One-line "why this signal matters". */
  rationale: string;
}

export interface PlaybookSequenceTemplate {
  /** Internal key. */
  key: string;
  /** Human label. */
  label: string;
  /** One-line description shown in the picker. */
  blurb: string;
}

export interface Playbook {
  slug: PlaybookSlug;
  /** Display label for the founder UI. */
  label: string;
  /** The 5 canonical signals — pre-filled at Phase 4. */
  signals: PlaybookSignal[];
  /** The 3 starter sequences — surfaced at Phase 5. */
  sequences: PlaybookSequenceTemplate[];
  /** Default pipeline stages (Phase 6). */
  defaultStages: Array<{ id: string; name: string }>;
}

export const PLAYBOOKS: Record<PlaybookSlug, Playbook> = {
  devtools: {
    slug: "devtools",
    label: "Devtools / developer platform",
    signals: [
      { key: "funding_recent", label: "Recent funding round", rationale: "New round → tooling budget within 60d" },
      { key: "head_of_eng_hired", label: "New Head of Engineering", rationale: "First-90-days plays drive tool consolidation" },
      { key: "competitor_adoption_in_jd", label: "Competitor in their job ads", rationale: "Already evaluating the category — hot" },
      { key: "eng_hiring_burst", label: "≥5 eng job posts active", rationale: "Team scale → infra pain points emerge" },
      { key: "conference_attendance", label: "DevOpsDays / KubeCon presence", rationale: "Active in modern-tooling community" },
    ],
    sequences: [
      { key: "funding-congrats", label: "Funding round congrats", blurb: "Founder-to-founder note tied to a recent round announcement." },
      { key: "stack-aware-switching", label: "Stack-aware switching", blurb: "Pattern-recognition message when competitor product is in the JD." },
      { key: "hiring-burst-opportunity", label: "Hiring burst opportunity", blurb: "30-min audit offer when 5+ eng roles are active." },
    ],
    defaultStages: [
      { id: "discovery", name: "Discovery" },
      { id: "champion", name: "Champion identified" },
      { id: "architecture-review", name: "Architecture review" },
      { id: "security-review", name: "Security review" },
      { id: "trial", name: "Trial" },
      { id: "procurement", name: "Procurement" },
      { id: "won", name: "Won" },
      { id: "lost", name: "Lost" },
    ],
  },

  fintech: {
    slug: "fintech",
    label: "Fintech / banking-as-a-service",
    signals: [
      { key: "regulatory_milestone", label: "License / charter granted", rationale: "Clearance unlocks growth playbooks" },
      { key: "funding_growth_explicit", label: "Funding mentions GTM scale", rationale: "Direct outbound budget signal" },
      { key: "cro_or_revenue_lead_hired", label: "New CRO / VP Sales", rationale: "First-90-days outbound investment" },
      { key: "compliance_hire_burst", label: "≥3 compliance hires", rationale: "Pre-IPO maturity, sales motion forming" },
      { key: "partnership_announcement", label: "New platform partner", rationale: "Distribution moment" },
    ],
    sequences: [
      { key: "regulatory-milestone-congrats", label: "Regulatory milestone congrats", blurb: "Recognise license / charter, offer geo-specific outbound playbook." },
      { key: "compliance-friendly-outbound", label: "Compliance-friendly outbound", blurb: "Audit trail + DPA-aware messaging — fintech founders care most." },
      { key: "cross-border-expansion", label: "Cross-border expansion", blurb: "Press / hiring → expansion plan → 6-12 month nurture." },
    ],
    defaultStages: [
      { id: "discovery", name: "Discovery" },
      { id: "champion", name: "Champion + use case" },
      { id: "compliance-review", name: "Compliance review" },
      { id: "pilot", name: "Pilot scoped" },
      { id: "procurement", name: "Procurement / Legal" },
      { id: "won", name: "Won" },
      { id: "lost", name: "Lost" },
    ],
  },

  healthtech: {
    slug: "healthtech",
    label: "Healthtech / digital health",
    signals: [
      { key: "hipaa_milestone", label: "HIPAA / SOC2 achieved", rationale: "Maturity → enterprise outbound" },
      { key: "provider_partnership", label: "Hospital / IDN partnership", rationale: "Distribution event for cross-sell" },
      { key: "cmo_hired", label: "Chief Medical Officer hired", rationale: "Clinical credibility → GTM scaling" },
      { key: "rfp_response_active", label: "RFP coordinator role active", rationale: "High-intent enterprise pipeline" },
      { key: "fda_or_regulatory_clearance", label: "FDA 510(k) / CE mark", rationale: "Regulatory unlock = market entry" },
    ],
    sequences: [
      { key: "compliance-first-founder-note", label: "Compliance-first founder note", blurb: "Recognise HIPAA milestone, offer outbound architecture for HIPAA-aware orgs." },
      { key: "rfp-health-system-selling", label: "RFP / health-system selling", blurb: "6-12 stakeholder mapping for RFPs." },
      { key: "provider-partnership-amplifier", label: "Provider partnership amplifier", blurb: "IDN sister-hospital cross-sell." },
    ],
    defaultStages: [
      { id: "discovery", name: "Discovery" },
      { id: "clinical-champion", name: "Clinical champion identified" },
      { id: "hipaa-review", name: "HIPAA + security review" },
      { id: "procurement", name: "Procurement" },
      { id: "legal-baa", name: "Legal + BAA executed" },
      { id: "pilot", name: "Pilot" },
      { id: "won", name: "Won" },
      { id: "lost", name: "Lost" },
    ],
  },

  ecommerce: {
    slug: "ecommerce",
    label: "E-commerce / DTC SaaS",
    signals: [
      { key: "app_store_install_velocity", label: "30%+ MoM install growth", rationale: "Demand pull → outbound budget" },
      { key: "funding_seed_to_a", label: "Seed → Series A in last 90d", rationale: "First GTM hire being recruited" },
      { key: "shopify_plus_partner", label: "Shopify Plus partner status", rationale: "Enterprise tier — bigger brands" },
      { key: "head_of_growth_hired", label: "New Head of Growth", rationale: "First-90-days outbound" },
      { key: "public_metrics_milestone", label: "Public milestone (e.g. 10k merchants)", rationale: "Maturity moment" },
    ],
    sequences: [
      { key: "install-velocity-congrats", label: "Install velocity congrats", blurb: "30% MoM growth → enterprise brand outbound." },
      { key: "shopify-plus-expansion", label: "Shopify Plus expansion", blurb: "Concrete brand list of 50 Plus brands matching their use case." },
      { key: "funding-event-nurture", label: "Funding event nurture", blurb: "Founder-to-founder, single concrete benchmark." },
    ],
    defaultStages: [
      { id: "discovery", name: "Discovery" },
      { id: "champion", name: "Champion identified" },
      { id: "trial", name: "Trial" },
      { id: "procurement", name: "Procurement" },
      { id: "won", name: "Won" },
      { id: "lost", name: "Lost" },
    ],
  },

  "b2b-saas-ops": {
    slug: "b2b-saas-ops",
    label: "B2B SaaS Ops (RevOps / CS / HR / IT)",
    signals: [
      { key: "revops_lead_hired", label: "New VP RevOps / Head of Ops", rationale: "First-90-days tooling rationalisation" },
      { key: "funding_growth_round", label: "Series A or B in last 90d", rationale: "GTM scaling moment" },
      { key: "g2_listing", label: "New G2 / Capterra listing", rationale: "Marketing-led growth + outbound complement" },
      { key: "integration_partnership", label: "Salesforce / HubSpot marketplace", rationale: "Distribution event" },
      { key: "headcount_growth_burst", label: "≥20% headcount growth 6mo", rationale: "Operational pain at scale" },
    ],
    sequences: [
      { key: "revops-hire-congrats", label: "RevOps hire congrats", blurb: "First-90-days playbook reference." },
      { key: "stack-rationalisation", label: "Stack rationalisation post-funding", blurb: "Tool-consolidation matrix." },
      { key: "marketplace-amplifier", label: "Marketplace listing amplifier", blurb: "Outbound pairs well with marketplace inbound." },
    ],
    defaultStages: [
      { id: "discovery", name: "Discovery" },
      { id: "champion", name: "Champion + use case" },
      { id: "trial", name: "Trial / POC" },
      { id: "procurement", name: "Procurement" },
      { id: "legal", name: "Legal" },
      { id: "won", name: "Won" },
      { id: "lost", name: "Lost" },
    ],
  },
};

const KEYWORDS_FOR: Record<PlaybookSlug, string[]> = {
  devtools: [
    "devtools",
    "developer",
    "developer platform",
    "developer tools",
    "ci/cd",
    "infrastructure",
    "infra",
    "observability",
    "ide",
    "ai-augmented dev",
    "code quality",
    "platform engineering",
  ],
  fintech: [
    "fintech",
    "finance",
    "financial",
    "banking",
    "payments",
    "lending",
    "treasury",
    "embedded finance",
    "crypto",
    "neobank",
    "challenger bank",
  ],
  healthtech: [
    "healthtech",
    "health tech",
    "healthcare",
    "digital health",
    "telehealth",
    "telemedicine",
    "ehr",
    "clinical",
    "medical device",
    "biotech",
    "pharma",
  ],
  ecommerce: [
    "e-commerce",
    "ecommerce",
    "dtc",
    "shopify",
    "amazon seller",
    "retail tech",
    "post-purchase",
    "loyalty",
    "shopify app",
  ],
  "b2b-saas-ops": [
    "b2b saas",
    "saas",
    "ops platform",
    "revops",
    "rev ops",
    "workflow automation",
    "hr tech",
    "it ops",
    "horizontal saas",
  ],
};

/**
 * Resolve the most relevant playbook for an industry string. Falls
 * back to `b2b-saas-ops` (the most generic horizontal vertical)
 * when nothing matches.
 */
export function resolvePlaybook(industryRaw: string | null | undefined): Playbook {
  if (!industryRaw) return PLAYBOOKS["b2b-saas-ops"];
  const lower = industryRaw.toLowerCase();
  for (const slug of Object.keys(KEYWORDS_FOR) as PlaybookSlug[]) {
    if (KEYWORDS_FOR[slug].some((k) => lower.includes(k))) {
      return PLAYBOOKS[slug];
    }
  }
  return PLAYBOOKS["b2b-saas-ops"];
}
