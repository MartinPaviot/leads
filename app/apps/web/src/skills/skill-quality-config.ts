// Quality thresholds and grader types for all skills, used by the evaluation pipeline.

export interface SkillQualityConfig {
  slug: string;
  tier: 1 | 2 | 3;
  minQualityScore: number;
  graderType:
    | "email"
    | "field_completeness"
    | "data_completeness"
    | "signal_relevance"
    | "none";
  requiredFields?: string[];
}

export const SKILL_QUALITY_CONFIGS: Map<string, SkillQualityConfig> = new Map([
  // ── Tier 1 — Customer-facing (0.80) ──────────────────────────────────
  [
    "cold-email-outreach",
    { slug: "cold-email-outreach", tier: 1, minQualityScore: 0.8, graderType: "email" },
  ],
  [
    "email-drafting",
    { slug: "email-drafting", tier: 1, minQualityScore: 0.8, graderType: "email" },
  ],
  [
    "handle-objection",
    { slug: "handle-objection", tier: 1, minQualityScore: 0.8, graderType: "email" },
  ],
  [
    "leadership-change-outreach",
    { slug: "leadership-change-outreach", tier: 1, minQualityScore: 0.8, graderType: "email" },
  ],
  [
    "draft-proposal",
    {
      slug: "draft-proposal",
      tier: 1,
      minQualityScore: 0.8,
      graderType: "field_completeness",
      requiredFields: ["title", "sections", "pricing"],
    },
  ],
  [
    "meeting-brief",
    {
      slug: "meeting-brief",
      tier: 1,
      minQualityScore: 0.8,
      graderType: "field_completeness",
      requiredFields: ["attendees", "talkingPoints", "dealContext"],
    },
  ],
  [
    "sales-call-prep",
    {
      slug: "sales-call-prep",
      tier: 1,
      minQualityScore: 0.8,
      graderType: "field_completeness",
      requiredFields: ["agenda", "talkingPoints", "objections"],
    },
  ],
  [
    "battlecard-generator",
    {
      slug: "battlecard-generator",
      tier: 1,
      minQualityScore: 0.8,
      graderType: "field_completeness",
      requiredFields: ["strengths", "weaknesses", "objections"],
    },
  ],
  [
    "re-engage-stalled",
    {
      slug: "re-engage-stalled",
      tier: 1,
      minQualityScore: 0.8,
      graderType: "field_completeness",
      requiredFields: ["strategy", "suggestedEmail", "timeline"],
    },
  ],

  // ── Tier 2 — Decision-support (0.70) ─────────────────────────────────
  [
    "pipeline-review",
    {
      slug: "pipeline-review",
      tier: 2,
      minQualityScore: 0.7,
      graderType: "field_completeness",
      requiredFields: ["stages", "atRiskDeals", "summary"],
    },
  ],
  [
    "sales-coaching",
    {
      slug: "sales-coaching",
      tier: 2,
      minQualityScore: 0.7,
      graderType: "field_completeness",
      requiredFields: ["insights", "recommendations"],
    },
  ],
  [
    "churn-risk-detector",
    {
      slug: "churn-risk-detector",
      tier: 2,
      minQualityScore: 0.7,
      graderType: "field_completeness",
      requiredFields: ["atRiskAccounts", "riskScore"],
    },
  ],
  [
    "competitor-intel",
    {
      slug: "competitor-intel",
      tier: 2,
      minQualityScore: 0.7,
      graderType: "field_completeness",
      requiredFields: ["overview", "strengths", "weaknesses"],
    },
  ],
  [
    "sequence-performance",
    {
      slug: "sequence-performance",
      tier: 2,
      minQualityScore: 0.7,
      graderType: "data_completeness",
    },
  ],
  [
    "scope-poc",
    {
      slug: "scope-poc",
      tier: 2,
      minQualityScore: 0.7,
      graderType: "field_completeness",
      requiredFields: ["scope", "timeline", "criteria"],
    },
  ],
  [
    "icp-identification",
    {
      slug: "icp-identification",
      tier: 2,
      minQualityScore: 0.7,
      graderType: "field_completeness",
      requiredFields: ["icp", "reasoning"],
    },
  ],

  // ── Tier 3 — Data/background (0.60) ──────────────────────────────────
  [
    "tam-builder",
    { slug: "tam-builder", tier: 3, minQualityScore: 0.6, graderType: "data_completeness" },
  ],
  [
    "apollo-lead-finder",
    { slug: "apollo-lead-finder", tier: 3, minQualityScore: 0.6, graderType: "data_completeness" },
  ],
  [
    "company-contact-finder",
    {
      slug: "company-contact-finder",
      tier: 3,
      minQualityScore: 0.6,
      graderType: "data_completeness",
    },
  ],
  [
    "inbound-lead-enrichment",
    {
      slug: "inbound-lead-enrichment",
      tier: 3,
      minQualityScore: 0.6,
      graderType: "data_completeness",
    },
  ],
  [
    "lead-qualification",
    { slug: "lead-qualification", tier: 3, minQualityScore: 0.6, graderType: "data_completeness" },
  ],
  [
    "inbound-lead-qualification",
    {
      slug: "inbound-lead-qualification",
      tier: 3,
      minQualityScore: 0.6,
      graderType: "data_completeness",
    },
  ],
  [
    "signal-scanner",
    { slug: "signal-scanner", tier: 3, minQualityScore: 0.6, graderType: "signal_relevance" },
  ],
  [
    "funding-signal-monitor",
    {
      slug: "funding-signal-monitor",
      tier: 3,
      minQualityScore: 0.6,
      graderType: "signal_relevance",
    },
  ],
  [
    "job-posting-intent",
    { slug: "job-posting-intent", tier: 3, minQualityScore: 0.6, graderType: "signal_relevance" },
  ],
  [
    "champion-tracker",
    { slug: "champion-tracker", tier: 3, minQualityScore: 0.6, graderType: "data_completeness" },
  ],
  [
    "expansion-signal-spotter",
    {
      slug: "expansion-signal-spotter",
      tier: 3,
      minQualityScore: 0.6,
      graderType: "signal_relevance",
    },
  ],
  [
    "investor-overlap",
    { slug: "investor-overlap", tier: 3, minQualityScore: 0.6, graderType: "data_completeness" },
  ],
  [
    "contact-cache",
    { slug: "contact-cache", tier: 3, minQualityScore: 0.6, graderType: "none" },
  ],
]);

export function getSkillQualityConfig(slug: string): SkillQualityConfig {
  return (
    SKILL_QUALITY_CONFIGS.get(slug) ?? {
      slug,
      tier: 3,
      minQualityScore: 0.6,
      graderType: "none",
    }
  );
}
