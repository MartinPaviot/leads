/**
 * WS-8 — Agent memory aggregator.
 *
 * Pulls everything the agent "knows" about a tenant into a unified
 * view the user can inspect, edit, and export. Backed by existing
 * sources (tenants.settings, trust_events, activities, knowledge
 * entries in settings, tenant agent trace summaries) — no new
 * storage.
 *
 * Categories (brief §3 WS-8):
 *   - inferred-from-website:  company, product, tone, ICP guesses
 *   - inferred-from-inbox:    basic derived facts from imports
 *   - explicit-setting:       guardrails, caps, mailbox mode
 *   - user-provided-knowledge: `knowledge[]` array from settings
 *   - past-conversation-summary: recent AI-generated summaries
 *                             (not fully wired yet — stub for now)
 *   - learned-preference:     trustScore + recent trust_events
 *                             (T2 mitigation in the master brief §8.1)
 */

import { db } from "@/db";
import { trustEvents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";

export type MemoryCategory =
  | "inferred-from-website"
  | "inferred-from-inbox"
  | "explicit-setting"
  | "user-provided-knowledge"
  | "past-conversation-summary"
  | "learned-preference";

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  label: string;
  value: string;
  source: string;
  confidence?: number;
  /** When an entry can be edited (inferred facts, explicit settings,
   *  user knowledge). Summaries and learned-preferences are read-only. */
  editable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── FINDING-010 fix: priority + TTL ─────────────────────────────────
//
// Priority order (highest → lowest). When two memory entries share the
// same `id`, the entry whose category appears earlier in this list wins.
//
//   1. explicit-setting         — user explicitly toggled this
//   2. user-provided-knowledge  — user typed it in
//   3. learned-preference       — derived from user behaviour
//   4. inferred-from-inbox      — inbox-derived facts
//   5. inferred-from-website    — most likely to be stale / wrong
//   6. past-conversation-summary — informational, never conflicts
//
// TTL: inferred categories (inferred-from-website, inferred-from-inbox)
// expire after 12 months. Other categories never expire.
// If an entry has no `createdAt` it is assumed still-valid (settings
// fields don't carry per-field timestamps today).

const CATEGORY_PRIORITY: Record<MemoryCategory, number> = {
  "explicit-setting": 0,
  "user-provided-knowledge": 1,
  "learned-preference": 2,
  "inferred-from-inbox": 3,
  "inferred-from-website": 4,
  "past-conversation-summary": 5,
};

const INFERRED_CATEGORIES: Set<MemoryCategory> = new Set([
  "inferred-from-website",
  "inferred-from-inbox",
]);

const TTL_MS = 12 * 30 * 24 * 60 * 60 * 1000; // ~12 months

/** Remove inferred entries older than 12 months (by `createdAt`). */
function applyTtlFilter(entries: MemoryEntry[], now: Date): MemoryEntry[] {
  const cutoff = now.getTime() - TTL_MS;
  return entries.filter((e) => {
    if (!INFERRED_CATEGORIES.has(e.category)) return true;
    if (!e.createdAt) return true; // no timestamp → keep (cannot determine age)
    return new Date(e.createdAt).getTime() >= cutoff;
  });
}

/**
 * Deduplicate entries by `id`: when multiple entries share the same id
 * (e.g., a user override and a website inference for the same fact),
 * keep only the one with the highest-priority category.
 */
function applyPriorityResolution(entries: MemoryEntry[]): MemoryEntry[] {
  const best = new Map<string, MemoryEntry>();
  for (const entry of entries) {
    const existing = best.get(entry.id);
    if (
      !existing ||
      CATEGORY_PRIORITY[entry.category] < CATEGORY_PRIORITY[existing.category]
    ) {
      best.set(entry.id, entry);
    }
  }
  return Array.from(best.values());
}

export interface MemorySnapshot {
  tenantId: string;
  generatedAt: string;
  entries: MemoryEntry[];
  trustScore: number | null;
  trustEventLog: Array<{
    id: string;
    eventType: string;
    scoreDelta: number;
    newScore: number;
    reason: string | null;
    createdAt: string;
  }>;
  /** Documents the priority order used when resolving conflicts between
   *  categories, and the TTL policy for inferred entries. */
  priorityNote: string;
}

export async function buildMemorySnapshot(
  tenantId: string,
): Promise<MemorySnapshot> {
  const settings = await getTenantSettings(tenantId);
  const entries: MemoryEntry[] = [];

  // ── inferred-from-website ──
  if (settings.onboardingCompanyName) {
    entries.push({
      id: "company-name",
      category: "inferred-from-website",
      label: "Company name",
      value: settings.onboardingCompanyName,
      source: settings.companyDomain ?? "onboarding",
      editable: true,
    });
  }
  if (settings.companyDomain) {
    entries.push({
      id: "domain",
      category: "inferred-from-website",
      label: "Primary domain",
      value: settings.companyDomain,
      source: "signup email",
      editable: true,
    });
  }
  if (settings.productDescription) {
    entries.push({
      id: "product",
      category: "inferred-from-website",
      label: "What you sell",
      value: settings.productDescription,
      source: "LLM inference from website",
      editable: true,
    });
  }
  if (settings.aiTone) {
    entries.push({
      id: "ai-tone",
      category: "inferred-from-website",
      label: "Email tone",
      value: settings.aiTone,
      source: "LLM suggestion / user choice",
      editable: true,
    });
  }
  if (settings.targetIndustries && settings.targetIndustries.length > 0) {
    entries.push({
      id: "target-industries",
      category: "inferred-from-website",
      label: "Target industries",
      value: settings.targetIndustries.join(", "),
      source: "LLM inference from website",
      editable: true,
    });
  }
  if (settings.targetCompanySizes && settings.targetCompanySizes.length > 0) {
    entries.push({
      id: "target-sizes",
      category: "inferred-from-website",
      label: "Target company sizes",
      value: settings.targetCompanySizes.join(", "),
      source: "LLM inference",
      editable: true,
    });
  }
  if (settings.targetGeographies && settings.targetGeographies.length > 0) {
    entries.push({
      id: "target-geos",
      category: "inferred-from-website",
      label: "Target geographies",
      value: settings.targetGeographies.join(", "),
      source: "LLM inference",
      editable: true,
    });
  }

  // ── inferred-from-inbox ──
  if (settings.onboardingFullName) {
    entries.push({
      id: "user-name",
      category: "inferred-from-inbox",
      label: "Your name",
      value: settings.onboardingFullName,
      source: "signup profile",
      editable: true,
    });
  }
  if (settings.onboardingRole) {
    entries.push({
      id: "user-role",
      category: "inferred-from-inbox",
      label: "Your role",
      value: settings.onboardingRole,
      source: "onboarding questionnaire",
      editable: true,
    });
  }
  if (settings.language) {
    entries.push({
      id: "language",
      category: "inferred-from-inbox",
      label: "Language",
      value: settings.language,
      source: "browser locale",
      editable: true,
    });
  }
  if (settings.timezone) {
    entries.push({
      id: "timezone",
      category: "inferred-from-inbox",
      label: "Timezone",
      value: settings.timezone,
      source: "browser",
      editable: true,
    });
  }

  // ── explicit-setting ──
  entries.push({
    id: "approval-mode",
    category: "explicit-setting",
    label: "Approval mode",
    value: settings.agentApprovalMode ?? "review-each",
    source: "Settings → Guardrails",
    editable: false, // edit from the settings page, not the panel
  });
  entries.push({
    id: "sending-mode",
    category: "explicit-setting",
    label: "Sending mode",
    value: settings.sendingMailboxMode ?? "primary-with-caps",
    source: "Settings → Sending infrastructure",
    editable: false,
  });
  entries.push({
    id: "sending-cap",
    category: "explicit-setting",
    label: "Daily primary cap",
    value: String(settings.sendingDailyCapPrimary ?? 20),
    source: "Settings → Sending infrastructure",
    editable: false,
  });
  entries.push({
    id: "llm-cap",
    category: "explicit-setting",
    label: "LLM monthly cap",
    value:
      settings.llmMonthlyCostCapUsd && settings.llmMonthlyCostCapUsd > 0
        ? `$${settings.llmMonthlyCostCapUsd}/mo`
        : "no cap",
    source: "Settings → LLM budget",
    editable: false,
  });

  // ── user-provided-knowledge ──
  if (settings.knowledge && settings.knowledge.length > 0) {
    for (const [i, k] of settings.knowledge.entries()) {
      entries.push({
        id: `knowledge-${i}`,
        category: "user-provided-knowledge",
        label: k.topic,
        value: k.content,
        source: "user chat / notes",
        editable: true,
      });
    }
  }

  // ── learned-preference ──
  const trustEventLog = await db
    .select({
      id: trustEvents.id,
      eventType: trustEvents.eventType,
      scoreDelta: trustEvents.scoreDelta,
      newScore: trustEvents.newScore,
      reason: trustEvents.reason,
      createdAt: trustEvents.createdAt,
    })
    .from(trustEvents)
    .where(eq(trustEvents.tenantId, tenantId))
    .orderBy(desc(trustEvents.createdAt))
    .limit(50);

  entries.push({
    id: "trust-score",
    category: "learned-preference",
    label: "Trust score",
    value: `${((settings.trustScore ?? 0) * 100).toFixed(0)}% (0-100)`,
    source: "derived from your approvals + undos",
    confidence: settings.trustScore ?? 0,
    editable: false,
  });

  // ── FINDING-010: TTL + priority resolution ──
  const now = new Date();
  const filtered = applyTtlFilter(entries, now);
  const resolved = applyPriorityResolution(filtered);

  // Sort by priority (highest-priority category first)
  resolved.sort(
    (a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category],
  );

  return {
    tenantId,
    generatedAt: now.toISOString(),
    entries: resolved,
    trustScore: settings.trustScore ?? 0,
    trustEventLog: trustEventLog.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      scoreDelta: e.scoreDelta,
      newScore: e.newScore,
      reason: e.reason,
      createdAt: (e.createdAt ?? new Date()).toISOString(),
    })),
    priorityNote:
      "Priority (highest first): explicit-setting > user-provided-knowledge > " +
      "learned-preference > inferred-from-inbox > inferred-from-website. " +
      "Inferred entries (inferred-from-website, inferred-from-inbox) expire " +
      "after 12 months when createdAt is present. " +
      "If two entries share the same id, the higher-priority category wins.",
  };
}
