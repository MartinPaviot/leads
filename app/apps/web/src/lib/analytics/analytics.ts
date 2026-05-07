/**
 * PostHog analytics wrapper.
 *
 * Two ways to call it:
 *
 *   1. The legacy `captureEvent(distinctId, event, properties)` — still
 *      supported so old call sites keep compiling. The property map is
 *      typed loosely (`Record<string, unknown>`), which is how most of
 *      the codebase still talks to this module.
 *
 *   2. The typed `posthogEvents.<name>(distinctId, props)` — every
 *      event declared below gets a typed helper so callers get
 *      autocomplete on both the event name and the property shape.
 *      Added for T1-F10 so we stop typoing event names into the funnel.
 *
 * Never blocks the app. A failed fetch (network, bad key, CORS) is
 * logged via `logger.warn` but swallowed — analytics is not a load-
 * bearing dependency.
 */

import { logger } from "@/lib/observability/logger";

// ── Legacy event union (kept for BC) ──

export type AnalyticsEvent =
  | { event: "signup"; properties: { method: "google" | "microsoft" | "credentials" } }
  | { event: "signin"; properties: { method: "google" | "microsoft" | "credentials" } }
  | { event: "activation"; properties: { trigger: string } }
  | { event: "page_view"; properties: { path: string } }
  | { event: "feature_used"; properties: { feature: string; action: string } }
  | { event: "chat_query"; properties: { queryLength: number; threadId?: string } }
  | { event: "email_generated"; properties: { type: "cold" | "follow_up" | "reply" } }
  | { event: "contact_enriched"; properties: { source: string } }
  | { event: "sequence_created"; properties: { stepCount: number } }
  | { event: "deal_created"; properties: { value?: number; stage: string } }
  | { event: "import_completed"; properties: { type: string; count: number } }
  | { event: "subscription_started"; properties: { plan: string } }
  | { event: "subscription_canceled"; properties: { plan: string; reason?: string } };

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Server-side event capture via PostHog API. Legacy loose API.
 */
export async function captureEvent(
  distinctId: string,
  event: AnalyticsEvent["event"] | KnownEventName,
  properties?: Record<string, unknown>
): Promise<void> {
  if (!POSTHOG_KEY) return;

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: {
          ...properties,
          $lib: "elevay-server",
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    // Analytics must never break the app, but we do want a breadcrumb
    // so a sudden drop in PostHog ingestion has a server-side trail.
    logger.warn("analytics: captureEvent failed", { event, err });
  }
}

/**
 * Identify a user in PostHog (server-side).
 */
export async function identifyUser(
  distinctId: string,
  properties: {
    email?: string;
    name?: string;
    tenantId?: string;
    plan?: string;
    createdAt?: string;
  }
): Promise<void> {
  if (!POSTHOG_KEY) return;

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: "$identify",
        distinct_id: distinctId,
        properties: { $set: properties },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    logger.warn("analytics: identifyUser failed", { err });
  }
}

// ── Typed event map (T1-F10) ──
//
// Every event declared here gets a typed helper `posthogEvents.<name>`
// that forwards to `captureEvent`. The goal is twofold:
//
//   1. Autocomplete — devs see the full list of events and their
//      property shapes in their editor.
//   2. Single source of truth — when we add a new funnel step, the
//      place to declare it is here, not inline at the call site.
//
// The signature for every helper is the same: `(distinctId, props)`.

interface EventCatalog {
  // Landing + marketing
  landing_viewed: { referrer?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string };
  pricing_viewed: { source?: string };
  cta_clicked: { cta: string; location: string };

  // Auth
  signup_started: { method: "google" | "microsoft" | "credentials" };
  signup_completed: { method: "google" | "microsoft" | "credentials"; userId: string };
  signin_started: { method: "google" | "microsoft" | "credentials" };
  signin_completed: { method: "google" | "microsoft" | "credentials"; userId: string };
  signin_failed: { method: "google" | "microsoft" | "credentials"; reason: string };
  password_reset_requested: { ip?: string };
  password_reset_completed: { userId: string };

  // Onboarding
  onboarding_started: { userId: string };
  onboarding_step_completed: {
    step: "welcome" | "connect" | "privacy" | "product" | "icp" | "building" | "ready";
    stepIndex: number;
    /** Milliseconds spent on the step the user just left, measured client-side
     * from the previous `onboarding_step_completed` (or wizard mount for step 1). */
    durationMs?: number;
  };
  onboarding_skipped: { step: string };
  onboarding_resumed: { fromStep: string };
  onboarding_completed: { userId: string; durationMs?: number };
  // ── MONACO-PARITY-03 — 7-phase wizard funnel (server-emitted) ──
  // Sam Blond verbatim: "Onboarding is where Monaco wins or loses."
  // We measure win/loss per phase so per-phase drop-offs surface in
  // PostHog without manual SQL.
  onboarding_v3_phase_submitted: {
    tenantId: string;
    phase: number;
    success: boolean;
    /** Count of Zod validation errors when success=false. */
    validationErrors?: number;
    /** Wall-clock ms since this tenant's onboarding row was created. */
    durationSinceStartMs?: number;
  };
  onboarding_v3_completed: {
    tenantId: string;
    success: boolean;
    /** When success=false: how many hard gates were still failing. */
    failingGatesCount?: number;
    durationMs?: number;
  };
  onboarding_v3_founder_led_clicked: {
    tenantId: string;
    /** Where the upgrade CTA fired from. */
    source: "wizard_header" | "incomplete_banner" | "settings";
  };
  onboarding_email_connected: { provider: "google" | "microsoft" };
  // WS-0 additions — coverage gaps found during the 2026-04-21 onboarding audit.
  /** OAuth round-trip complete and the user has landed back on /home. */
  onboarding_oauth_returned: {
    provider: "google" | "microsoft";
    /** Wall-clock ms from clicking the provider button to landing back. */
    durationMs: number;
  };
  /** AI returned at least one low-confidence ICP field and surfaced a question
   * on the ICP step. Tracked so WS-2 can measure whether the panel is worth
   * making actionable. */
  onboarding_confidence_gaps_shown: { gapCount: number; confidence: number };
  /** User clicked "Build my prospect list" on the ICP step. */
  onboarding_build_tam_triggered: {
    icpIndustriesCount: number;
    icpSizesCount: number;
    icpGeosCount: number;
    icpSenioritiesCount: number;
  };
  /** TAM build completed successfully. Duration is the total build time from
   * trigger to ready-screen render, including scoring + contact discovery. */
  onboarding_build_tam_completed: {
    companiesCreated: number;
    contactsCreated: number;
    durationMs: number;
  };
  /** TAM build failed. errorClass is a short snake_case tag so PostHog can
   * group failures without leaking full error messages. */
  onboarding_build_tam_failed: { errorClass: string; durationMs: number };
  /** Client-side latency for onboarding APIs that are not LLM-traced today
   * (enrich-icp, find-contacts, email-intelligence). Fires on every call. */
  onboarding_api_latency: {
    endpoint: string;
    durationMs: number;
    /** HTTP status. -1 indicates the fetch threw before a response. */
    status: number;
    errorClass?: string;
  };
  // TTFAA (Time-To-First-Agent-Action) per master brief §2.1.1.
  /** Fires server-side in the NextAuth jwt callback the first time a user
   * successfully completes OAuth. Idempotent per tenant via
   * settings.ttfaaSessionId. */
  ttfaa_started: {
    provider: "google" | "microsoft-entra-id";
    sessionCorrelationId: string;
  };
  /** V1 proxy completion event: fires server-side in /api/home/hydrate the
   * first time the hydrated dashboard summary includes >=1 enriched record
   * after onboarding completed. durationMs pairs with ttfaa_started via
   * sessionCorrelationId. */
  ttfaa_completed_v1_proxy: {
    durationMs: number;
    enrichedRecordCount: number;
    sessionCorrelationId: string;
  };

  // Home / dashboard
  home_action_clicked: { action: string; priority: string };
  home_insight_clicked: { insightId: string; severity: string };

  // Chat
  chat_thread_created: { threadId: string };
  chat_message_sent: { threadId: string; queryLength: number };
  chat_card_approved: { entityType: "contact" | "account" | "deal" | "record"; cardKey: string };
  chat_card_dismissed: { entityType: string; cardKey: string };
  chat_card_failed: { entityType: string; status: number | null };

  // Accounts
  accounts_viewed: { count: number };
  accounts_enrich_triggered: { count: number; mode: "single" | "bulk" };
  accounts_score_triggered: { count: number };
  accounts_signals_triggered: { count: number };
  accounts_filtered: { filterKey: string };
  account_created: { manual: boolean };
  account_opened: { accountId: string };

  // Contacts
  contacts_viewed: { count: number };
  contact_created: { manual: boolean; source?: string };
  contacts_bulk_action: { action: string; count: number };
  contacts_merge_completed: { mergedCount: number };

  // Sequences
  sequence_created: { stepCount: number };
  sequence_launched: { sequenceId: string; enrolledCount: number };
  sequence_step_completed: { sequenceId: string; stepIndex: number; sent: number };
  sequence_post_launch_edited: { sequenceId: string; changedField: string };
  sequence_analytics_viewed: { sequenceId: string };

  // Meetings
  meetings_viewed: { count: number };
  meeting_notes_edited: { meetingId: string };
  meeting_followup_sent: { meetingId: string; auto: boolean };
  meeting_transcribed: { meetingId: string; wordCount: number };

  // Opportunities
  opportunities_viewed: { count: number };
  opportunity_created: { value?: number; stage: string };
  opportunity_stage_changed: { opportunityId: string; from: string; to: string; auto: boolean };
  opportunity_health_computed: { opportunityId: string; score: number };
  opportunity_timeline_viewed: { opportunityId: string };

  // Settings
  settings_page_viewed: { section: string };
  gdpr_export_requested: { format: "json" | "csv" };
  gdpr_delete_requested: { userId: string };
  profile_password_updated: { userId: string };

  // Errors / UX
  error_boundary_tripped: { boundary: string; message?: string };
  destructive_confirm_shown: { action: string };
  destructive_confirm_accepted: { action: string };
  destructive_confirm_cancelled: { action: string };
  session_expired: { lastPath?: string };
  offline_detected: Record<string, never>;
  online_recovered: Record<string, never>;

  // Logo rendering fix — tier-hit telemetry
  logo_tier_hit: {
    tier: 1 | 2 | 3 | 4 | 5 | 6;
    domainHashed: string;
    latencyMs: number;
    fromCache: boolean;
  };
  logo_cascade_exhausted: { domainHashed: string };
}

export type KnownEventName = keyof EventCatalog;

type EventHelper<K extends KnownEventName> = (
  distinctId: string,
  properties: EventCatalog[K]
) => Promise<void>;

type EventHelpers = { [K in KnownEventName]: EventHelper<K> };

/**
 * Build the typed event-helper map. Declared as a function (not an
 * object literal) so TypeScript infers the right narrow type per key
 * while keeping a single `captureEvent` forwarder underneath.
 */
function buildHelpers(): EventHelpers {
  const names: KnownEventName[] = [
    "landing_viewed", "pricing_viewed", "cta_clicked",
    "signup_started", "signup_completed", "signin_started",
    "signin_completed", "signin_failed", "password_reset_requested",
    "password_reset_completed",
    "onboarding_started", "onboarding_step_completed",
    "onboarding_skipped", "onboarding_resumed", "onboarding_completed",
    "onboarding_email_connected",
    // WS-0 additions
    "onboarding_oauth_returned", "onboarding_confidence_gaps_shown",
    "onboarding_build_tam_triggered", "onboarding_build_tam_completed",
    "onboarding_build_tam_failed", "onboarding_api_latency",
    "ttfaa_started", "ttfaa_completed_v1_proxy",
    "home_action_clicked", "home_insight_clicked",
    "chat_thread_created", "chat_message_sent", "chat_card_approved",
    "chat_card_dismissed", "chat_card_failed",
    "accounts_viewed", "accounts_enrich_triggered",
    "accounts_score_triggered", "accounts_signals_triggered",
    "accounts_filtered", "account_created", "account_opened",
    "contacts_viewed", "contact_created", "contacts_bulk_action",
    "contacts_merge_completed",
    "sequence_created", "sequence_launched", "sequence_step_completed",
    "sequence_post_launch_edited", "sequence_analytics_viewed",
    "meetings_viewed", "meeting_notes_edited", "meeting_followup_sent",
    "meeting_transcribed",
    "opportunities_viewed", "opportunity_created",
    "opportunity_stage_changed", "opportunity_health_computed",
    "opportunity_timeline_viewed",
    "settings_page_viewed", "gdpr_export_requested",
    "gdpr_delete_requested", "profile_password_updated",
    "error_boundary_tripped", "destructive_confirm_shown",
    "destructive_confirm_accepted", "destructive_confirm_cancelled",
    "session_expired", "offline_detected", "online_recovered",
    "logo_tier_hit", "logo_cascade_exhausted",
  ];

  const helpers = {} as Record<string, (id: string, props: unknown) => Promise<void>>;
  for (const name of names) {
    helpers[name] = (distinctId: string, props: unknown) =>
      captureEvent(distinctId, name, props as Record<string, unknown>);
  }
  return helpers as EventHelpers;
}

export const posthogEvents: EventHelpers = buildHelpers();

/** Exposed for tests and for external consumers that need the catalog. */
export const KNOWN_EVENT_NAMES: readonly KnownEventName[] =
  Object.keys(posthogEvents) as KnownEventName[];
