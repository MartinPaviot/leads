import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { customSignals } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { generateCustomSignalPlan } from "@/lib/custom-signals/generator";
import { inngest } from "@/inngest/client";
import { z } from "zod";
import type { CustomSignalPlan } from "@/lib/custom-signals/types";

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().min(3).max(600),
  colorIndex: z.number().int().min(0).max(15).optional(),
});

/** GET /api/custom-signals — list active custom signals for the
 * current tenant. Ordered by creation date so the UI column order is
 * stable regardless of partial completion of backfills. */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(customSignals)
    .where(
      and(
        eq(customSignals.tenantId, authCtx.tenantId),
        eq(customSignals.isActive, true),
      ),
    )
    .orderBy(desc(customSignals.createdAt));

  return Response.json({
    signals: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      colorIndex: r.colorIndex,
      backfilledAt: r.backfilledAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/** POST /api/custom-signals — create a new custom signal, generate
 * its detection plan via LLM, and kick off a backfill. Returns the
 * created row immediately; the backfill runs async via Inngest.
 *
 * Admin-gated because custom signals appear globally in the tenant's
 * accounts table and re-running the backfill consumes LLM credits. */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const rl = await checkRateLimit("llm", authCtx.userId);
  if (rl) return rl;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, description, colorIndex } = parsed.data;

  // Duplicate-name guard: the unique index will also reject, but
  // catching here gives a nicer error message.
  const [existing] = await db
    .select({ id: customSignals.id })
    .from(customSignals)
    .where(
      and(
        eq(customSignals.tenantId, authCtx.tenantId),
        eq(customSignals.name, name),
      ),
    )
    .limit(1);
  if (existing) {
    return Response.json(
      { error: `A signal named "${name}" already exists.` },
      { status: 409 },
    );
  }

  // Generate plan via LLM. If this fails we still create the signal
  // with an empty plan — the user can edit later to re-generate.
  let plan: CustomSignalPlan;
  try {
    plan = await generateCustomSignalPlan({
      tenantId: authCtx.tenantId,
      name,
      description,
    });
  } catch (err) {
    console.warn("[custom-signals] plan generation failed", err);
    plan = { keywords: [], urlPatterns: [], judgePrompt: "" };
  }

  const [row] = await db
    .insert(customSignals)
    .values({
      tenantId: authCtx.tenantId,
      name,
      description,
      plan,
      colorIndex: colorIndex ?? null,
      createdByUserId: authCtx.userId,
    })
    .returning();

  // Kick off backfill in the background. The UI banner shows
  // "Backfilling…" until the function writes `backfilledAt`.
  await inngest
    .send({
      name: "custom-signal/backfill",
      data: {
        tenantId: authCtx.tenantId,
        signalId: row.id,
      },
    })
    .catch((err) => {
      // Non-fatal — user can kick off a manual retry from the UI.
      console.warn("[custom-signals] inngest dispatch failed", err);
    });

  return Response.json({
    signal: {
      id: row.id,
      name: row.name,
      description: row.description,
      colorIndex: row.colorIndex,
      backfilledAt: null,
      createdAt: row.createdAt.toISOString(),
      plan: row.plan as CustomSignalPlan,
    },
  });
}
