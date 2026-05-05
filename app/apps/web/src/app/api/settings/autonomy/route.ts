import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { autonomyConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildDefaultConfig } from "@/lib/campaign-engine/autonomy-defaults";
import { getTrustScore } from "@/lib/campaign-engine/trust-score";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";

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

  return Response.json({ config, trustScore });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { level, permissions, guardrails, brand } = body;

  // Validate level upgrade against trust score
  if (level === "strategic") {
    const trustScore = await getTrustScore(authCtx.tenantId);
    if (trustScore.overall < 80) {
      return Response.json(
        { error: "Trust score must be >= 80 to enable Strategic mode", currentScore: trustScore.overall },
        { status: 403 }
      );
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

  // Load existing or create defaults
  const [existing] = await db
    .select()
    .from(autonomyConfig)
    .where(eq(autonomyConfig.tenantId, authCtx.tenantId))
    .limit(1);

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

  return Response.json({
    config: merged,
    trustScore: trustScore.overall,
    levelChangeApplied: !!level && level !== existing?.level,
  });
}
