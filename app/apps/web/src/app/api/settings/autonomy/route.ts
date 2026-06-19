import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import { autonomyConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildDefaultConfig } from "@/lib/campaign-engine/autonomy-defaults";
import { getTrustScore } from "@/lib/campaign-engine/trust-score";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";
import {
  deriveApprovalModeFromLevel,
  resolveEffectiveMode,
  HIGH_CONFIDENCE_THRESHOLDS,
  type GuardedAction,
} from "@/lib/guardrails/approval-mode";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";
import {
  buildEffectiveThresholdMap,
  requiredTrustForLevel,
  HARD_EXCLUDED_ACTIONS,
  STRATEGIC_RELAXED_THRESHOLDS,
} from "@/lib/guardrails/level-behavior";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(autonomyConfig)
    .where(eq(autonomyConfig.tenantId, authCtx.tenantId))
    .limit(1);

  const config = row
    ? { level: row.level, permissions: row.permissions, guardrails: row.guardrails, brand: row.brand }
    : buildDefaultConfig();

  const trustScore = await getTrustScore(authCtx.tenantId);

  // CLE-16 §5.3 / AC-20 — observability read surface. Per-action current-vs-static
  // threshold so the autonomy page can show "asks above 60% (learned, was 75%)".
  // Read-only derivation via the SAME builder the background callers inject, so
  // the displayed bar matches the enforced bar (excluded → ceiling, etc.).
  const settings = await getTenantSettings(authCtx.tenantId);
  const learned = settings.learnedThresholds ?? {};
  const { relaxThresholds } = resolveEffectiveMode({
    settings,
    level: row?.level as AutonomyLevel | undefined,
    trustOverall: trustScore.overall,
  });
  const effective = buildEffectiveThresholdMap({ learned, relaxThresholds });
  const thresholds: Record<
    string,
    { static: number; current: number; source: "static" | "learned" | "relaxed"; excluded: boolean }
  > = {};
  for (const action of Object.keys(HIGH_CONFIDENCE_THRESHOLDS) as GuardedAction[]) {
    const excluded = HARD_EXCLUDED_ACTIONS.has(action);
    let source: "static" | "learned" | "relaxed" = "static";
    if (!excluded) {
      if (relaxThresholds && STRATEGIC_RELAXED_THRESHOLDS[action] !== undefined) source = "relaxed";
      else if (learned[action] !== undefined) source = "learned";
    }
    thresholds[action] = {
      static: HIGH_CONFIDENCE_THRESHOLDS[action],
      current: effective[action],
      source,
      excluded,
    };
  }

  return Response.json({ config, trustScore, thresholds });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CLE-12 — unified matrix gate on the fresh DB role. Autonomy config is
  // admin-only (settings:write); previously this PUT had NO role gate, so any
  // member could change workspace autonomy (gap closed, access NARROWED).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  const body = await req.json();
  const { level, permissions, guardrails, brand } = body;

  // Load existing first so the gate can tell a change from a no-op (downgrades
  // and re-saving the same level are never gated — EC-6).
  const [existing] = await db
    .select()
    .from(autonomyConfig)
    .where(eq(autonomyConfig.tenantId, authCtx.tenantId))
    .limit(1);

  // CLE-16 §4.2/§4.3 — generalized server-side trust gate. A level whose
  // required trust floor exceeds the live gate score (systemTrustScore.overall)
  // is refused with 403. Floors: copilot 0 / guided 50 / autonomous 65 /
  // strategic 80 (mirrors suggestedLevel + the pre-existing strategic-80 rule,
  // unchanged for strategic). Only RAISING above an unearned floor is refused;
  // a downgrade (floor <= current trust) always passes. The gate is in the
  // route — the only server write path for the level — so a forged curl / a UI
  // that wrongly enables the button is still refused (AC-12).
  if (level && level !== existing?.level) {
    const floor = requiredTrustForLevel(level as AutonomyLevel);
    if (floor > 0) {
      const gateScore = await getTrustScore(authCtx.tenantId);
      if (gateScore.overall < floor) {
        return Response.json(
          {
            error: `Trust score must be >= ${floor} to enable ${level} mode`,
            currentScore: gateScore.overall,
            requiredScore: floor,
          },
          { status: 403 },
        );
      }
    }
  }

  // Validate guardrails
  if (guardrails) {
    if (guardrails.maxEmailsPerDay !== undefined && guardrails.maxEmailsPerDay < 0) {
      return Response.json({ error: "maxEmailsPerDay cannot be negative" }, { status: 400 });
    }
    if (guardrails.maxNewProspectsPerWeek !== undefined && guardrails.maxNewProspectsPerWeek < 0) {
      return Response.json({ error: "maxNewProspectsPerWeek cannot be negative" }, { status: 400 });
    }
  }

  // `existing` was loaded above for the gate.
  const defaultConfig = buildDefaultConfig(level || existing?.level || "copilot");

  const merged = {
    tenantId: authCtx.tenantId,
    level: level || existing?.level || "copilot",
    permissions: { ...(existing?.permissions as object || defaultConfig.permissions), ...permissions },
    guardrails: { ...(existing?.guardrails as object || defaultConfig.guardrails), ...guardrails },
    brand: { ...(existing?.brand as object || defaultConfig.brand), ...brand },
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(autonomyConfig).set(merged).where(eq(autonomyConfig.tenantId, authCtx.tenantId));
  } else {
    await db.insert(autonomyConfig).values(merged);
  }

  const trustScore = await getTrustScore(authCtx.tenantId);

  // CLE-10 §4.3 — write-side sync: level is the user-facing control; the canonical
  // ApprovalModeV2 is DERIVED from it and cached into tenant_settings.agentApprovalMode
  // so even a row-less background reader (which uses readApprovalMode, not the autonomy
  // row) sees the new posture. The user-facing toggle is now load-bearing (req AC-14).
  const { mode: derivedApprovalMode } = deriveApprovalModeFromLevel(
    merged.level as AutonomyLevel,
    trustScore.overall,
  );
  await updateTenantSettings(authCtx.tenantId, { agentApprovalMode: derivedApprovalMode });

  return Response.json({
    config: merged,
    trustScore: trustScore.overall,
    levelChangeApplied: !!level && level !== existing?.level,
  });
}
