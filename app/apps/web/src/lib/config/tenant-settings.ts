import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Typed tenant settings — single source of truth for the settings JSONB schema.
 * Every key that goes into tenants.settings MUST be defined here.
 */
export interface TenantSettings {
  // ── Onboarding profile ──
  onboardingFullName?: string;
  onboardingCompanyName?: string;
  companyDomain?: string;
  onboardingRole?: string;
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string;
  /** Last wizard step the user was on. Persisted on every `setStep` so the
   * wizard can be re-opened at the same place after a reload. Cleared when
   * onboarding completes. */
  onboardingCurrentStep?: string;
  /** ISO timestamp of the welcome-email send. Set once on completion so a
   * resume / re-completion (rare but possible) can't mailbomb the user. */
  welcomeEmailSentAt?: string;

  // ── WS-0 telemetry ──
  /** First time the onboarding wizard mounted for this tenant. Written once,
   * used as the denominator for `onboarding_completed.durationMs`. */
  onboardingStartedAt?: string;
  /** First successful OAuth callback timestamp. Written by `auth.ts` jwt
   * callback via `markTtfaaStarted`. Paired with `ttfaaCompletedAtV1Proxy`
   * to compute Time-To-First-Agent-Action v1 proxy duration. */
  ttfaaStartedAt?: string;
  /** UUID correlating `ttfaa_started` and `ttfaa_completed_v1_proxy`. Acts
   * as the idempotency guard — if this is set, the start event has already
   * fired and we don't re-fire on token refresh. */
  ttfaaSessionId?: string;
  /** First time the dashboard hydrate returned a non-empty summary after
   * onboarding completed. Idempotency guard for the v1 proxy completion
   * event. */
  ttfaaCompletedAtV1Proxy?: string;

  // ── Product context ──
  productDescription?: string;
  salesMotion?: string;
  aiTone?: string;
  primaryChallenge?: string;

  // ── Revenue goal (forecast) ──
  /**
   * Revenue target, same unit as deal ACV (project + platform summed).
   * Consumed by GET /api/analytics/forecast to compute goal coverage and name
   * the binding bottleneck (demand vs conversion vs capacity). Absent or 0 →
   * the forecast falls back to the demand-first prior and says so honestly.
   * `amount` is a tolerated legacy alias for `monthly` on the read path.
   */
  revenueGoal?: { monthly?: number; amount?: number; updatedAt?: string };

  /**
   * The user's own cap-table investors (funds, angels, accelerators).
   * Used by the `investor-overlap` signal to flag target accounts that
   * share any investor with the user — a Monaco-style warm-intro lever
   * ("Common Investor?" column on the TAM table). One investor per
   * entry, free text matched case-insensitively against
   * `companies.properties.investors` and Apollo funding-round payloads.
   */
  companyInvestors?: string[];

  // ── Live call coaching ──
  /** Per-tenant objection responses (lib/voice/tenant-playbook.ts) —
   * generated once from product + ICP, class-by-class override of the
   * neutral coaching PLAYBOOK. Founder-editable. */
  objectionBank?: Array<{ objectionClass: string; responses: string[] }>;
  /** ISO timestamp of the one-shot bank generation (idempotency marker). */
  objectionBankGeneratedAt?: string;
  /** Script generation posture. "consultative" (default — sober, no
   * contrarian reframe; fits fondations/parapublic/santé) or "challenger"
   * (one grounded factual reframe allowed). Founder-set. */
  scriptPosture?: "consultative" | "challenger";

  // ── ICP (Ideal Customer Profile) ──
  targetIndustries?: string[];
  targetCompanySizes?: string[];
  targetRoles?: string;
  targetSeniorities?: string[];
  targetDepartments?: string[];
  targetGeographies?: string[];
  /**
   * Full Apollo org-search filter surface set during onboarding /
   * ICP editing. Every field maps 1:1 to an OrgSearchParams key and is
   * consumed by /api/tam (build) + /api/tam/estimate (live count). Kept
   * flat (not nested) to match the rest of the target* settings.
   */
  targetKeywords?: string[];
  /** revenue_range bounds, USD. */
  targetRevenueMin?: number;
  targetRevenueMax?: number;
  /** currently_using_any_of_technology_uids (display names; slugged at use). */
  targetTechnologies?: string[];
  /** organization_not_locations. */
  excludeGeographies?: string[];
  /** latest_funding_date_range.min = now − N days. */
  fundingRecencyDays?: number;
  /** total_funding_range bounds, USD. */
  totalFundingMin?: number;
  totalFundingMax?: number;
  /** organization_num_jobs_range.min — hiring-intent gate. */
  minJobOpenings?: number;
  /** q_organization_job_titles — roles companies are actively hiring for. */
  hiringTitles?: string[];

  // ── Workspace branding ──
  /** Workspace logo shown in place of the initials avatar (sidebar +
   * Settings → General). A small raster data URL (png/jpeg/webp), client-
   * rasterized to ≤256px and capped at WORKSPACE_LOGO_MAX_DATAURL_CHARS
   * (lib/logo/workspace-logo.ts). Served to the browser via
   * GET /api/settings/workspace/logo — never inline the bytes into SSR
   * payloads or LLM prompts. Null/absent = initials fallback. */
  logoDataUrl?: string | null;
  /** ISO timestamp of the last logo change — cache-busting `?v=` param on
   * the serving URL. */
  logoUpdatedAt?: string;

  // ── Email provider ──
  emailProvider?: string;

  // ── Email sync preferences (set during onboarding) ──
  contactCreationMode?: "disabled" | "selective" | "always";
  backsyncRange?: "1m" | "3m" | "6m" | "12m";
  doNotTrackDomains?: string[];

  /**
   * O7 — default visibility for newly captured records (emails, meetings,
   * notes, contacts).
   * - "everyone": all tenant members can see (current behavior).
   * - "team": NOT IMPLEMENTED — exists in the type for forward compat
   *   but no team scoping logic exists. The onboarding wizard (BUG-WS0-002)
   *   no longer offers this option. If a tenant already has "team" stored
   *   it behaves identically to "everyone" at runtime.
   * - "private": only the creating user can see — used by founders who
   *   demo or share screens publicly and don't want a teammate's leads
   *   to leak in.
   */
  defaultDataVisibility?: "everyone" | "team" | "private";

  // ── Sequence behavior ──
  /** When true (default), sequence step delays skip Saturdays and Sundays. */
  sequencesSkipWeekends?: boolean;

  // ── Custom schema ──
  customFields?: CustomFieldDef[];
  pipelineStages?: PipelineStageDef[];

  // ── Knowledge base ──
  knowledge?: KnowledgeEntry[];

  // ── Locale ──
  language?: string; // e.g. "en", "fr", "de"
  timezone?: string; // e.g. "America/New_York", "Europe/Paris"

  // ── Agent behavior ──
  /**
   * Trust calibration knob — controls when autonomous actions require
   * human approval. WS-1 migrated this from the legacy enum
   * ("auto" | "ask" | "manual") to the v2 values below. Reads should
   * go through `readApprovalMode()` in lib/guardrails/approval-mode.ts,
   * which coerces any remaining legacy values so rollback stays safe.
   *
   * - "review-each"           → every autonomous action requires a
   *                             per-item human approval before dispatch.
   *                             The conservative default for every new
   *                             tenant (brief §6 success criterion
   *                             "zero silent actions").
   * - "batch-daily"           → actions accumulate in a daily queue the
   *                             user reviews once; approve all / reject
   *                             individually. Unlocked via
   *                             progressive-autonomy nudge at
   *                             trustScore ≥ 0.5.
   * - "auto-high-confidence"  → the agent sends actions whose confidence
   *                             score crosses the agent-specific
   *                             threshold without prompting. Lower-
   *                             confidence actions still queue for
   *                             review. Unlocked at trustScore ≥ 0.8.
   *
   * Legacy values `"auto" | "ask" | "manual" | "off"` are accepted on
   * read so tenants migrated by WS-1 but not yet rewritten by the
   * runner keep compiling. Writers should always emit v2 values;
   * `readApprovalMode()` (PR B) coerces for callers that branch on the
   * effective mode.
   */
  agentApprovalMode?:
    | "review-each"
    | "batch-daily"
    | "auto-high-confidence"
    | "auto"
    | "ask"
    | "manual"
    | "off";

  /**
   * Per-tenant monthly LLM budget cap in US dollars. When set, every
   * traced-ai call goes through `enforceLlmBudget` which sums
   * `usage_events.metadata.estimatedCost` for the current calendar
   * month and throws `BudgetExceededError` once the cap is reached.
   *
   * Semantics:
   *   - undefined or 0 → no cap (LLM calls always allowed).
   *   - number > 0 → cap in USD, checked pre-dispatch.
   *
   * Callers of the traced-ai helpers should not try/catch this error
   * silently; the intended flow is to surface "you've hit your AI
   * budget for this month — increase cap or wait for next month" to
   * the user so they can take action.
   */
  llmMonthlyCostCapUsd?: number;

  // ── Custom objects ──
  customObjectTypes?: CustomObjectTypeDef[];

  // ── MCP API keys ──
  mcpApiKeys?: McpApiKeyEntry[];

  // ── WS-1 guardrails ──
  /**
   * How outbound emails leave Elevay. Gates every send via
   * `enforceSendingIdentity()` in lib/guardrails/sending-identity.ts.
   *
   * - "primary-with-caps"       → send from the user's primary mailbox
   *                               (Gmail/Outlook OAuth) with a daily cap
   *                               and a cold-outreach block. Default for
   *                               every new tenant so nobody accidentally
   *                               torches their primary domain.
   * - "external-connected"      → route through a user-connected third-
   *                               party sender (Instantly first; Smartlead
   *                               etc. later). Credentials live in
   *                               `instantlyCredentialsEncrypted`.
   * - "elevay-managed-requested"→ user asked Elevay to set up a dedicated
   *                               sending domain. Ticketed in
   *                               `sending_infra_requests` table; no
   *                               automated provisioning.
   * - "elevay-managed-active"   → managed domain is warm and ready.
   */
  sendingMailboxMode?:
    | "primary-with-caps"
    | "external-connected"
    | "elevay-managed-requested"
    | "elevay-managed-active";
  /** Max sends per calendar day from the user's primary mailbox when
   *  `sendingMailboxMode === "primary-with-caps"`. Default 20. */
  sendingDailyCapPrimary?: number;
  /**
   * CLE-11 outbound undo window (de-facto unsend), in SECONDS. When > 0, an
   * outbound action whose disposition is "execute" is enqueued on a cancellable
   * hold (status="held", hold_until = now + this) instead of being queued
   * immediately; the cron releases it once the window elapses, and an undo
   * within the window cancels it before it leaves. Default 0 (backwards-safe:
   * no hold, today's behaviour exactly). Read it through
   * `readOutboundUndoWindowSeconds()` which coerces malformed/out-of-range
   * values back to the default. Recommended range when enabled: 30–60s.
   */
  outboundUndoWindowSeconds?: number;
  /** When false (default), cold outreach from the primary inbox is
   *  blocked and routed to the scaling-path prompt instead. */
  sendingAllowColdOnPrimary?: boolean;
  /** AES-GCM ciphertext of the Instantly Hypergrowth API key, encrypted
   *  with ELEVAY_APP_SECRET. Present only when the tenant has connected
   *  Instantly via `external-connected`. */
  instantlyCredentialsEncrypted?: string;

  /**
   * F005 / CLE-16 — learned per-action confidence thresholds, keyed by
   * `GuardedAction`. Produced by `recalculateThresholds`
   * (lib/guardrails/learned-trust.ts) from F003 `action_outcomes` + the CLE-11
   * reversal/bounce signal, bounded to [0.5, 1.0]. Read back via
   * `computeEffectiveThresholds`/`getEffectiveThreshold` and folded into the
   * `decideAction` `extra.learnedThresholds` map by the background callers
   * (always through `buildEffectiveThresholdMap`, which ceiling-forces the
   * hard-excluded outbound/paid/destructive classes — they NEVER carry a learned
   * key, design §3.3). jsonb-backed config; no DB migration. Never lowers a bar
   * for an action the core refuses to auto-execute. */
  learnedThresholds?: Record<string, number>;
  /** ISO timestamp of the last `recalculateThresholds` write. Observability
   *  marker for the weekly trust recalc; paired with `learnedThresholds`. */
  trustStatsUpdatedAt?: string;

  /** Progressive-autonomy trust score, 0.0 - 1.0. Drives nudge thresholds.
   *  See lib/guardrails/trust-score.ts. Never write directly — use the
   *  helpers so the audit trail in `trust_events` stays in sync.
   *  NOTE (CLE-16 §4.4): this 0–1 "nudge" score is DISTINCT from the 0–100
   *  `systemTrustScore.overall` gate score used by the autonomy level gate +
   *  strategic relaxation. Do not conflate them. */
  trustScore?: number;
  /** ISO timestamp of the last positive trust event (approved_no_edit or
   *  approved_with_edit). Used by applyTrustDecay() to reduce stale scores
   *  when a tenant stops interacting with the agent. */
  lastPositiveTrustEventAt?: string;
  /** Tracks whether each progressive-autonomy nudge has been offered
   *  and whether the user accepted or dismissed it. */
  autonomyNudgeState?: {
    batchDailyOffered: boolean;
    batchDailyOfferedAt?: string;
    batchDailyDismissedAt?: string;
    batchDailyAcceptedAt?: string;
    autoHighConfidenceOffered: boolean;
    autoHighConfidenceOfferedAt?: string;
    autoHighConfidenceDismissedAt?: string;
    autoHighConfidenceAcceptedAt?: string;
  };
  /** T2+T4 mitigation (master brief §8.1): autonomy nudges cannot surface
   *  until this flag is `true`. Flipped by WS-8 on first open of the
   *  Agent Memory panel. WS-1 only seeds `false`. */
  agentMemoryPanelDiscovered?: boolean;
  /** Idempotency guard for the WS-1 migration runner. ISO timestamp. */
  ws1MigrationRanAt?: string;
  /** ISO timestamp of when the user dismissed the one-shot WS-1 banner.
   *  Banner renders only for tenants whose legacy mode was "auto"
   *  (i.e. the migration tightened their approval rule). */
  ws1MigrationBannerDismissedAt?: string;
  /** Summary of the last ICP fit recompute (Phase 0,
   *  _specs/icp-unification R3.3) — written by the recompute's final
   *  step, read by the ICP editor's diff-after-save poll. */
  lastIcpRecompute?: {
    at: string;
    companies: number;
    regradedUp: number;
    regradedDown: number;
    unowned: number;
    icps: number;
  };

  // ── WS-2 experiments (feature flags) ──
  /** Tenant-scoped feature flags. Flags follow the convention
   *  `workstream.feature-name`, e.g. `onboarding.v2.confirmation-card`.
   *  Unknown keys decode to `undefined` (equivalent to `false`). */
  experiments?: Record<string, boolean>;

  /** Per-op idempotency map for the `/api/estimate-cost` T3 display
   *  rule. Writer: WS-4's TAM kickoff stamps on first preview shown.
   *  Reader: `/api/estimate-cost` `isFirstTimeForOp` hint. */
  costPreviewSeenForOp?: Record<string, string>;

  // ── Cross-tenant learning (#96) ──
  /**
   * Whether this tenant's anonymized signal outcomes (industry, company
   * size, signal type, win/loss rate) are included in cross-tenant
   * benchmark aggregation. No PII is ever shared — only aggregate counts
   * and rates, and only when >=10 tenants contribute to a bucket
   * (k-anonymity). Defaults to true (opt-out).
   */
  anonymizedDataContribution?: boolean;

  // ── Compliance / audit retention ──
  /**
   * How long audit log entries (HMAC-signed system_event activities)
   * are retained before the data-retention cron is allowed to purge
   * them. Default: "7y" (7 years) per SOC 2 Type II requirements.
   *
   * Accepted values follow the pattern `<number><unit>` where unit is
   * "y" (years), "m" (months), or "d" (days). The data-retention cron
   * in inngest/data-retention.ts reads this value when deciding whether
   * an audit row has exceeded its retention window.
   *
   * In practice the cron currently preserves ALL audit rows for
   * canceled tenants unconditionally (the 7-year window is enforced
   * by never deleting them during the 30-day tenant purge). This field
   * exists so a future scheduled job can age-out audit entries that
   * have exceeded the configured retention period.
   */
  auditRetentionPolicy?: string; // default "7y"

  // ── Compliance / DPA tracking ──
  /**
   * Data Processing Agreement status per sub-processor. Tracks whether
   * the tenant admin has requested and/or signed a DPA with each
   * third-party provider that handles tenant data. Programmatic signing
   * is not supported — this is a manual tracking mechanism so the admin
   * can record status and the compliance page can surface it.
   *
   * Sub-processors tracked:
   *   - anthropic  — LLM inference (Claude)
   *   - neon       — PostgreSQL hosting
   *   - resend     — transactional email
   *   - recall     — meeting bot / recording
   *   - stripe     — billing
   */
  dpaStatus?: {
    anthropic: "not_started" | "requested" | "signed";
    neon: "not_started" | "requested" | "signed";
    resend: "not_started" | "requested" | "signed";
    recall: "not_started" | "requested" | "signed";
    stripe: "not_started" | "requested" | "signed";
  };
}

export interface McpApiKeyEntry {
  id: string;
  name: string;
  /** The hashed key (bcrypt). Only stored hashed. */
  keyHash: string;
  /** The key prefix for display, e.g. "mcp_a1b2..." */
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  /** ISO timestamp of when the key was created (mirrors createdAt for
   *  explicit audit trail semantics). */
  keyCreatedAt?: string;
  /** The user ID of the admin who created this key. Used for audit
   *  trail attribution — who issued the credential. */
  keyOwnerId?: string;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  entityType: string;
  type: string;
  aiFillMode: string;
  options?: string[];
  // CHAT-06: AI Attributes. When type === "ai_computed", the field is
  // populated by an LLM call. aiConfig describes what to compute.
  // aiConfig.kind:
  //   - "summarize"        → free-form summary of record attributes
  //   - "classify"         → pick one of aiConfig.options (select-like)
  //   - "prompt"           → arbitrary text completion from aiConfig.prompt
  //   - "research"         → web + CRM research agent (long-running,
  //                          deferred to the researchAgent Inngest job)
  // runMode decides when the AI attribute recomputes:
  //   - "manual"           → only when the user triggers it (default)
  //   - "onChange"         → whenever any other field on the record changes
  //   - "scheduled"        → daily (Inngest cron)
  aiConfig?: {
    kind: "summarize" | "classify" | "prompt" | "research";
    prompt?: string;
    runMode?: "manual" | "onChange" | "scheduled";
  };
}

export interface PipelineStageDef {
  name: string;
  category: string;
  description?: string;
  aiFillMode?: string;
}

export interface KnowledgeEntry {
  topic: string;
  content: string;
}

export interface CustomObjectFieldDef {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "url" | "boolean";
  options?: string[];   // for select type
  required?: boolean;
}

export interface CustomObjectTypeDef {
  id: string;           // slug, e.g. "project"
  name: string;         // plural display, e.g. "Projects"
  nameSingular: string; // singular, e.g. "Project"
  icon: string;         // lucide icon name, e.g. "Folder"
  fields: CustomObjectFieldDef[];
}

// ── Defaults ──

// CLE-13 (T1): exported so the shared sending-gate (lib/guardrails/sending-gate.ts)
// reads the SAME sending defaults the `getTenantSettings` merge applies, with no
// value change. `getTenantSettings` always merges these in, so a tenant with no
// explicit sending config still gets `primary-with-caps` / cap 20 / cold-blocked.
export const DEFAULTS: Required<Pick<
  TenantSettings,
  | "aiTone"
  | "salesMotion"
  | "agentApprovalMode"
  | "sendingMailboxMode"
  | "sendingDailyCapPrimary"
  | "sendingAllowColdOnPrimary"
  | "trustScore"
  | "agentMemoryPanelDiscovered"
  | "auditRetentionPolicy"
>> = {
  aiTone: "Direct",
  salesMotion: "Founder-led sales",
  // WS-1: default changed from "auto" to "review-each" to honor the
  // brief's "zero silent actions" success criterion. Legacy tenants
  // keep their previous mode (migrated via ws-1-guardrail-defaults.ts);
  // fresh tenants start conservative.
  agentApprovalMode: "review-each",
  sendingMailboxMode: "primary-with-caps",
  sendingDailyCapPrimary: 20,
  sendingAllowColdOnPrimary: false,
  trustScore: 0.0,
  agentMemoryPanelDiscovered: false,
  auditRetentionPolicy: "7y",
};

// ── Per-request cache ──
// Next.js API routes run in a fresh context per request. A simple Map
// avoids hitting the DB multiple times within the same request when
// several functions (snapshot builder, knowledge loader, approval mode
// checker) all need the same tenant settings.
//
// The cache is scoped to the module — which in serverless/edge is
// effectively per-isolate. Entries auto-expire after 5 s so a long-lived
// server process won't serve stale data across requests.

interface CacheEntry {
  settings: TenantSettings;
  ts: number;
}

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

function getCached(tenantId: string): TenantSettings | null {
  const entry = cache.get(tenantId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(tenantId);
    return null;
  }
  return entry.settings;
}

function setCache(tenantId: string, settings: TenantSettings): void {
  cache.set(tenantId, { settings, ts: Date.now() });
}

// ── Accessor ──

/** Load typed tenant settings. Cached per-request (5 s TTL). */
export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const cached = getCached(tenantId);
  if (cached) return cached;

  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const raw = (tenant?.settings || {}) as Record<string, unknown>;
  const settings = { ...DEFAULTS, ...raw } as TenantSettings;

  setCache(tenantId, settings);
  return settings;
}

/** Update tenant settings (partial merge). Invalidates cache. */
export async function updateTenantSettings(
  tenantId: string,
  updates: Partial<TenantSettings>
): Promise<void> {
  const current = await getTenantSettings(tenantId);
  const merged = { ...current, ...updates };

  await db
    .update(tenants)
    .set({ settings: merged, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  // Invalidate so next read picks up the write
  cache.delete(tenantId);
}

// ── Email Sync Helpers ──

const BACKSYNC_DAYS: Record<string, number> = { "1m": 30, "3m": 90, "6m": 180, "12m": 365 };

/** Convert backsyncRange setting to number of days. Defaults to 90 (3 months). */
export function backsyncRangeToDays(range: string | undefined): number {
  return BACKSYNC_DAYS[range || "3m"] || 90;
}

/** Build the full set of ignored domains for email sync (personal providers + user's own domain + do-not-track). */
export function buildIgnoredDomains(settings: TenantSettings, ownDomain?: string): Set<string> {
  const ignored = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com",
    "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "icloud.com",
    "aol.com", "protonmail.com", "proton.me", "mail.com", "msn.com",
    "yandex.com", "zoho.com", "gmx.com", "fastmail.com", "me.com",
  ]);
  if (ownDomain) ignored.add(ownDomain);
  if (settings.doNotTrackDomains) {
    for (const d of settings.doNotTrackDomains) {
      if (d.trim()) ignored.add(d.trim().toLowerCase());
    }
  }
  return ignored;
}

/** Check whether a contact should be auto-created based on creation mode and email direction. */
export function shouldAutoCreateContact(
  mode: string | undefined,
  direction: "inbound" | "outbound",
): boolean {
  if (mode === "disabled") return false;
  if (mode === "always") return true;
  // "selective" (default): only from sent emails
  return direction === "outbound";
}

// ── ICP Helpers ──

/**
 * Does the tenant have enough of an ICP to target a search? Reads the flat
 * target* keys — since icp-unification Phase 1 these are the mirror written
 * by the rank-1 ICP profile's save, so this covers both legacy flat-ICP
 * tenants and unified-profile tenants without touching the icps table.
 */
export function hasUsableIcp(settings: TenantSettings): boolean {
  return Boolean(
    settings.targetIndustries?.length ||
      settings.targetKeywords?.length ||
      settings.targetGeographies?.length ||
      settings.targetRoles ||
      settings.targetSeniorities?.length,
  );
}

/** Parse targetCompanySizes into a numeric [min, max] range for scoring. */
export function parseSizeRange(settings: TenantSettings): [number, number] | null {
  const sizes = settings.targetCompanySizes;
  if (!sizes || sizes.length === 0) return null;

  const nums = sizes.flatMap((s) => {
    const clean = String(s).replace(/,/g, "").replace("+", "");
    return clean.split("-").map(Number).filter((n) => !isNaN(n));
  });
  if (nums.length === 0) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

/**
 * BUG-WS0-008: Derive targetRoles at read time from targetSeniorities +
 * targetDepartments. This replaces the stale-persisted value and ensures
 * every downstream consumer (scoring, TAM, chat prompts) always gets the
 * current seniority/department combination.
 *
 * If the tenant has a manually-edited targetRoles string (from the ICP
 * settings page text field) AND no structured seniorities/departments,
 * we fall back to the stored value for backward compat.
 */
export function deriveTargetRoles(settings: TenantSettings): string {
  const seniorities = settings.targetSeniorities || [];
  const departments = settings.targetDepartments || [];
  if (seniorities.length > 0 || departments.length > 0) {
    return [...seniorities, ...departments].join(", ");
  }
  // Fall back to stored value for legacy tenants or manual edits
  return settings.targetRoles || "";
}

/** Parse targetRoles free text into lowercase keywords for matching. */
export function parseRoleKeywords(settings: TenantSettings): string[] {
  const raw = deriveTargetRoles(settings);
  return raw
    .split(/[,;]/)
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

/** Get pipeline stage names, or defaults. */
export function getStageNames(settings: TenantSettings): string {
  if (settings.pipelineStages && settings.pipelineStages.length > 0) {
    return settings.pipelineStages.map((s) => s.name).join(", ");
  }
  return "lead, qualification, demo, trial, proposal, negotiation, won, lost";
}
