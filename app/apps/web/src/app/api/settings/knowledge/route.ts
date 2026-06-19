import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { createHash } from "crypto";
import { embedKnowledgeEntry } from "@/lib/knowledge/retrieval";
import { effectiveStages, sanitizeStages } from "@/lib/knowledge/stages";
import { classifyStages } from "@/lib/knowledge/auto-stage";

const STALENESS_DAYS = 90;

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select()
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.tenantId, authCtx.tenantId),
          eq(knowledgeEntries.isActive, true),
          or(
            eq(knowledgeEntries.scope, "workspace"),
            and(
              eq(knowledgeEntries.scope, "user"),
              eq(knowledgeEntries.createdBy, authCtx.userId)
            )
          )
        )
      )
      .orderBy(desc(knowledgeEntries.updatedAt));

    const now = Date.now();
    const staleMs = STALENESS_DAYS * 24 * 60 * 60 * 1000;

    return Response.json({
      knowledge: rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        content: r.content,
        // Effective consumption stages (stored when curated, else derived).
        stages: effectiveStages(r.stages, r.category, r.title),
        scope: r.scope,
        isEditable:
          r.createdBy === authCtx.userId || authCtx.role === "admin",
        isStale: now - (r.updatedAt?.getTime() ?? 0) > staleMs,
        updatedAt: r.updatedAt?.toISOString(),
        createdAt: r.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch knowledge:", error);
    return Response.json(
      { error: "Failed to fetch knowledge" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, content, category, scope, stages } = body;

    if (!title?.trim() || !content?.trim()) {
      return Response.json(
        { error: "Title and content required" },
        { status: 400 }
      );
    }

    // Categories are USER-CREATABLE: any short label works (the canonical
    // icp/competitors/objections/product/process/context are suggestions,
    // not a gate). Machine routing never depends on the category — the
    // stages do — so a free label costs nothing and reads naturally.
    const cat =
      typeof category === "string" && category.trim()
        ? category.trim().toLowerCase().slice(0, 40)
        : "custom";

    const entryScope = scope === "user" ? "user" : "workspace";
    if (entryScope === "workspace") {
      const adminCheck = requireAdmin(authCtx);
      if (adminCheck) return adminCheck;
    }

    const contentHash = createHash("sha256")
      .update(content.trim())
      .digest("hex");

    // "Write normally": no curated stages on the request → the entry
    // routes itself from its content (fail-soft to category/title derive).
    const curated = sanitizeStages(stages);
    const entryStages =
      curated.length > 0
        ? curated
        : await classifyStages(title.trim(), content.trim(), authCtx.tenantId, cat);

    const [entry] = await db
      .insert(knowledgeEntries)
      .values({
        tenantId: authCtx.tenantId,
        createdBy: authCtx.userId,
        scope: entryScope,
        title: title.trim(),
        category: cat,
        content: content.trim(),
        stages: entryStages,
        contentHash,
      })
      .returning();

    // Async embedding generation (non-blocking)
    embedKnowledgeEntry(
      authCtx.tenantId,
      entry.id,
      entry.title,
      entry.content
    ).catch((e) =>
      console.warn("Knowledge embedding failed (non-blocking):", e)
    );

    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("Failed to add knowledge:", error);
    return Response.json(
      { error: "Failed to add knowledge" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CLE-12 — unified matrix gate on the fresh DB role. Editing knowledge is
  // admin-only (knowledge:write); previously this PUT had NO role gate (only
  // POST did), so any member could edit entries (gap closed, access NARROWED).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { id, title, content, category, stages } = body as {
      id?: string;
      title?: string;
      content?: string;
      category?: string;
      stages?: unknown;
    };

    if (!id) {
      return Response.json({ error: "Entry ID required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.id, id),
          eq(knowledgeEntries.tenantId, authCtx.tenantId)
        )
      )
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }

    if (
      existing.createdBy !== authCtx.userId &&
      authCtx.role !== "admin"
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    // Free-form category (user-creatable label); empty string keeps current.
    if (typeof category === "string" && category.trim()) {
      updates.category = category.trim().toLowerCase().slice(0, 40);
    }
    // Stage curation: an explicit array (even empty = "back to derived").
    if (Array.isArray(stages)) updates.stages = sanitizeStages(stages);

    let contentChanged = false;
    if (content !== undefined) {
      const newHash = createHash("sha256")
        .update(content.trim())
        .digest("hex");
      if (newHash !== existing.contentHash) {
        updates.content = content.trim();
        updates.contentHash = newHash;
        contentChanged = true;
      }
    }

    await db
      .update(knowledgeEntries)
      .set(updates)
      .where(eq(knowledgeEntries.id, id));

    if (contentChanged) {
      embedKnowledgeEntry(
        authCtx.tenantId,
        id,
        (updates.title as string) ?? existing.title,
        (updates.content as string) ?? existing.content
      ).catch((e) =>
        console.warn("Knowledge re-embedding failed (non-blocking):", e)
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update knowledge:", error);
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CLE-12 — unified matrix gate on the fresh DB role. Deleting knowledge is
  // admin-only (knowledge:write); previously this DELETE had NO role gate, so
  // any member could delete entries (gap closed, access NARROWED).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const url = new URL(req.url, "http://localhost");
    const id = url.searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Entry ID required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(knowledgeEntries)
      .where(
        and(
          eq(knowledgeEntries.id, id),
          eq(knowledgeEntries.tenantId, authCtx.tenantId)
        )
      )
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }

    if (
      existing.createdBy !== authCtx.userId &&
      authCtx.role !== "admin"
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete
    await db
      .update(knowledgeEntries)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(knowledgeEntries.id, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete knowledge:", error);
    return Response.json({ error: "Failed to delete" }, { status: 500 });
  }
}
