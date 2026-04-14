import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { logger } from "@/lib/logger";

/**
 * Per-user, per-resource key/value preferences.
 *
 *   GET  /api/user-preferences?resource=accounts
 *     → { preferences: Record<string, unknown> } (all keys for this user + resource)
 *
 *   PUT  /api/user-preferences
 *     body: { resource: string, key: string, value: unknown }
 *     → { ok: true }
 */

const putSchema = z.object({
  resource: z.string().min(1).max(64),
  key: z.string().min(1).max(128),
  value: z.unknown(),
});

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource");
  if (!resource) {
    return NextResponse.json({ error: "resource query param required" }, { status: 400 });
  }

  try {
    const rows = await db
      .select({ key: userPreferences.key, value: userPreferences.value })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, authCtx.userId),
          eq(userPreferences.resource, resource)
        )
      );

    const preferences: Record<string, unknown> = {};
    for (const r of rows) preferences[r.key] = r.value;
    return NextResponse.json({ preferences });
  } catch (err) {
    logger.error("user-preferences: GET failed", { err });
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { resource, key, value } = parsed.data;

  try {
    // Upsert — the unique index (user_id, resource, key) makes this safe.
    const [existing] = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, authCtx.userId),
          eq(userPreferences.resource, resource),
          eq(userPreferences.key, key)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(userPreferences)
        .set({ value: value as never, updatedAt: new Date() })
        .where(eq(userPreferences.id, existing.id));
    } else {
      await db.insert(userPreferences).values({
        userId: authCtx.userId,
        resource,
        key,
        value: value as never,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("user-preferences: PUT failed", { err });
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }
}
