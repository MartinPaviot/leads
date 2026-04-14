import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { logger } from "@/lib/logger";

const postSchema = z.object({
  resource: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  filters: z.array(
    z.object({
      field: z.string().min(1),
      operator: z.string().min(1),
      value: z.any(),
    })
  ),
  sort: z
    .object({
      field: z.string(),
      dir: z.enum(["asc", "desc"]),
    })
    .nullable()
    .optional(),
  columns: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * Saved filter/sort/columns views per user per resource.
 *
 *   GET  /api/views?resource=accounts → { views: [...] }
 *   POST /api/views  body: SavedView → { view }
 *   DELETE /api/views?id=<id>        → { ok: true }
 */

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resource = new URL(req.url).searchParams.get("resource");
  if (!resource) {
    return NextResponse.json({ error: "resource query param required" }, { status: 400 });
  }

  try {
    const rows = await db
      .select()
      .from(savedViews)
      .where(
        and(eq(savedViews.userId, authCtx.userId), eq(savedViews.resource, resource))
      )
      .orderBy(desc(savedViews.updatedAt));
    return NextResponse.json({ views: rows });
  } catch (err) {
    logger.error("views: GET failed", { err });
    return NextResponse.json({ error: "Failed to load views" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { resource, name, filters, sort, columns, isDefault } = parsed.data;

  try {
    // If this view is marked default, unset the flag on siblings so
    // at most one default exists per (user, resource).
    if (isDefault) {
      await db
        .update(savedViews)
        .set({ isDefault: false })
        .where(
          and(
            eq(savedViews.userId, authCtx.userId),
            eq(savedViews.resource, resource)
          )
        );
    }

    const [inserted] = await db
      .insert(savedViews)
      .values({
        userId: authCtx.userId,
        resource,
        name,
        filters: filters as never,
        sort: (sort ?? null) as never,
        columns: (columns ?? null) as never,
        isDefault: Boolean(isDefault),
      })
      .returning();

    return NextResponse.json({ view: inserted });
  } catch (err) {
    logger.error("views: POST failed", { err });
    return NextResponse.json({ error: "Failed to save view" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  try {
    await db
      .delete(savedViews)
      .where(and(eq(savedViews.id, id), eq(savedViews.userId, authCtx.userId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("views: DELETE failed", { err });
    return NextResponse.json({ error: "Failed to delete view" }, { status: 500 });
  }
}
