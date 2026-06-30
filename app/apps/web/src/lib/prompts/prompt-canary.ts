/**
 * Canary deployment for prompt changes.
 *
 * When a new prompt version is created, it starts at 0% traffic.
 * The canary percentage is stored in agentPromptVersions.canaryPercent.
 * Traffic is routed based on a hash of the tenant ID so the same
 * tenant always gets the same version (consistent hashing).
 *
 * Lifecycle:
 * 1. New prompt version created with isActive=true, canaryPercent=10
 * 2. The "stable" version has canaryPercent=0 (or omitted) and isActive=true
 * 3. getActivePromptVersion() hashes the tenantId to a 0-99 bucket
 * 4. If bucket < canaryPercent, serve the canary; otherwise serve stable
 * 5. Gradually increase canaryPercent (10 -> 25 -> 50 -> 100) as eval scores hold
 * 6. At 100%, deactivate the old version — canary becomes the new stable
 */

import { db } from "@/db";
import { agentPromptVersions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import logger from "../observability/logger";

// ── Consistent Hashing ─────────────────────────────────────────

/**
 * Deterministic hash of a string to a number in [0, 99].
 * Uses FNV-1a (fast, well-distributed, no crypto overhead).
 * The same tenantId always maps to the same bucket, so a tenant
 * sees the same prompt version across requests.
 */
export function hashToBucket(input: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // multiply and keep as uint32
  }
  return hash % 100;
}

// ── Core API ───────────────────────────────────────────────────

export interface PromptVersionResult {
  version: number;
  content: string;
  isCanary: boolean;
  versionId: string;
}

/**
 * Get the active prompt version for an agent, routing traffic via
 * consistent hashing when a canary version exists.
 *
 * Decision logic:
 * 1. Find all active versions for the agent (isActive = true)
 * 2. If there's only one, return it (isCanary = false)
 * 3. If there are two, the one with canaryPercent > 0 is the canary
 * 4. Hash the tenantId to a bucket [0-99]
 * 5. If bucket < canaryPercent, serve canary; otherwise serve stable
 *
 * Returns null if no active version exists (caller should use default prompt).
 */
export async function getActivePromptVersion(
  agentId: string,
  tenantId: string,
): Promise<PromptVersionResult | null> {
  const activeVersions = await db.select()
    .from(agentPromptVersions)
    .where(and(
      eq(agentPromptVersions.agentId, agentId),
      eq(agentPromptVersions.isActive, true),
    ))
    .orderBy(desc(agentPromptVersions.version))
    .limit(3); // at most 2 active (stable + canary), 3 for safety

  if (activeVersions.length === 0) return null;

  // Single active version -- no canary routing needed
  if (activeVersions.length === 1) {
    const v = activeVersions[0];
    return {
      version: v.version,
      content: v.systemPrompt,
      isCanary: false,
      versionId: v.id,
    };
  }

  // Two active versions -- find stable vs canary
  // The canary is the one with canaryPercent > 0
  const canary = activeVersions.find((v) => v.canaryPercent > 0);
  const stable = activeVersions.find((v) => v.canaryPercent === 0) || activeVersions[0];

  if (!canary) {
    // Both have canaryPercent=0 -- shouldn't happen, serve newest
    const v = activeVersions[0];
    return {
      version: v.version,
      content: v.systemPrompt,
      isCanary: false,
      versionId: v.id,
    };
  }

  // Route based on tenant hash
  const bucket = hashToBucket(tenantId);
  const serveCanary = bucket < canary.canaryPercent;

  const chosen = serveCanary ? canary : stable;

  if (serveCanary) {
    logger.info("[PROMPT-CANARY] Serving canary version", {
      agentId,
      tenantId: tenantId.slice(0, 8) + "...",
      bucket,
      canaryPercent: canary.canaryPercent,
      version: canary.version,
    });
  }

  return {
    version: chosen.version,
    content: chosen.systemPrompt,
    isCanary: serveCanary,
    versionId: chosen.id,
  };
}

/**
 * Set the canary traffic percentage for a prompt version.
 * Use this to gradually roll out a new prompt:
 *   setCanaryPercent(versionId, 10)  -> 10% of tenants see it
 *   setCanaryPercent(versionId, 50)  -> 50%
 *   setCanaryPercent(versionId, 100) -> full rollout
 *
 * At 100%, you should also deactivate the old stable version.
 */
export async function setCanaryPercent(
  versionId: string,
  percent: number,
): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  await db.update(agentPromptVersions)
    .set({ canaryPercent: clamped })
    .where(eq(agentPromptVersions.id, versionId));

  logger.info("[PROMPT-CANARY] Updated canary percent", {
    versionId,
    percent: clamped,
  });
}

/**
 * Promote a canary to stable: set its canaryPercent to 0 (it becomes
 * the new baseline) and deactivate all other versions for the agent.
 */
export async function promoteCanary(versionId: string): Promise<void> {
  const [version] = await db.select()
    .from(agentPromptVersions)
    .where(eq(agentPromptVersions.id, versionId))
    .limit(1);

  if (!version) return;

  // Deactivate all other versions for this agent
  await db.update(agentPromptVersions)
    .set({ isActive: false })
    .where(and(
      eq(agentPromptVersions.agentId, version.agentId),
      eq(agentPromptVersions.isActive, true),
    ));

  // Activate this version as the new stable
  await db.update(agentPromptVersions)
    .set({ isActive: true, canaryPercent: 0 })
    .where(eq(agentPromptVersions.id, versionId));

  logger.info("[PROMPT-CANARY] Promoted canary to stable", {
    agentId: version.agentId,
    version: version.version,
  });
}

/**
 * Roll a canary back: deactivate it so `getActivePromptVersion` falls
 * back to the stable version. Used when the canary's eval score has
 * regressed below stable. Setting canaryPercent=0 alone is NOT enough —
 * with two active versions both at 0%, routing would still serve the
 * newest — so the canary must be made inactive.
 */
export async function rollbackCanary(versionId: string): Promise<void> {
  await db.update(agentPromptVersions)
    .set({ isActive: false, canaryPercent: 0 })
    .where(eq(agentPromptVersions.id, versionId));

  logger.info("[PROMPT-CANARY] Rolled back canary", { versionId });
}
