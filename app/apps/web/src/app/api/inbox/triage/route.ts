import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { inboxTriage } from "@/db/schema";
import { z } from "zod";

/**
 * POST /api/inbox/triage — the three triage verbs.
 * Body: { conversationKey, action: "done" | "snooze" | "reopen", snoozeUntil? }
 * One upsert per verb; reopen-on-new-inbound is computed at read time
 * (lib/inbox/conversations.ts), so no other writes exist.
 */

const triageSchema = z.object({
  conversationKey: z.string().min(1).max(512),
  action: z.enum(["done", "snooze", "reopen"]),
  snoozeUntil: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof triageSchema>;
  try {
    parsed = triageSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message || "Validation failed" }, { status: 422 });
    }
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date();
  let status: string;
  let doneAt: Date | null = null;
  let snoozedUntil: Date | null = null;

  if (parsed.action === "done") {
    status = "done";
    doneAt = now;
  } else if (parsed.action === "snooze") {
    if (!parsed.snoozeUntil) {
      return Response.json({ error: "snoozeUntil required for snooze" }, { status: 422 });
    }
    snoozedUntil = new Date(parsed.snoozeUntil);
    if (snoozedUntil.getTime() <= now.getTime()) {
      return Response.json({ error: "snoozeUntil must be in the future" }, { status: 422 });
    }
    status = "snoozed";
  } else {
    status = "open";
  }

  try {
    const [row] = await db
      .insert(inboxTriage)
      .values({
        tenantId: authCtx.tenantId,
        conversationKey: parsed.conversationKey,
        status,
        doneAt,
        snoozedUntil,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [inboxTriage.tenantId, inboxTriage.conversationKey],
        set: { status, doneAt, snoozedUntil, updatedAt: now },
      })
      .returning();

    return Response.json({ triage: row });
  } catch (error) {
    console.error("Failed to update inbox triage:", error);
    return Response.json({ error: "Failed to update inbox triage" }, { status: 500 });
  }
}
