import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { notes, companies, contacts, deals } from "@/db/schema";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import { ingestEpisode } from "@/lib/ai/context-graph";
import { apiError } from "@/lib/infra/api-errors";
import { z } from "zod";

const createNoteSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().min(1, "Content is required").max(50000),
  entityType: z.string().max(50).default("general"),
  entityId: z.string().max(200).default(""),
});

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allNotes = await db
      .select()
      .from(notes)
      .where(and(eq(notes.tenantId, authCtx.tenantId), isNull(notes.deletedAt)))
      .orderBy(desc(notes.createdAt))
      .limit(200);

    // Resolve entity names for linked notes
    const entityIds = {
      company: new Set<string>(),
      contact: new Set<string>(),
      deal: new Set<string>(),
    };

    for (const note of allNotes) {
      if (note.entityType && note.entityId) {
        const key = note.entityType as keyof typeof entityIds;
        if (key in entityIds) entityIds[key].add(note.entityId);
      }
    }

    const nameMap = new Map<string, string>();

    if (entityIds.company.size > 0) {
      const ids = [...entityIds.company];
      const rows = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(and(inArray(companies.id, ids), eq(companies.tenantId, authCtx.tenantId)));
      for (const r of rows) nameMap.set(r.id, r.name);
    }

    if (entityIds.contact.size > 0) {
      const ids = [...entityIds.contact];
      const rows = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(inArray(contacts.id, ids), eq(contacts.tenantId, authCtx.tenantId)));
      for (const r of rows) {
        nameMap.set(r.id, [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown");
      }
    }

    if (entityIds.deal.size > 0) {
      const ids = [...entityIds.deal];
      const rows = await db
        .select({ id: deals.id, name: deals.name })
        .from(deals)
        .where(and(inArray(deals.id, ids), eq(deals.tenantId, authCtx.tenantId)));
      for (const r of rows) nameMap.set(r.id, r.name);
    }

    const enriched = allNotes.map((note) => ({
      ...note,
      entityName: note.entityId ? nameMap.get(note.entityId) || null : null,
    }));

    return Response.json({ notes: enriched });
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return Response.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = createNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid note data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { title, content, entityType, entityId } = parsed.data;

    const [note] = await db
      .insert(notes)
      .values({
        tenantId: authCtx.tenantId,
        authorId: authCtx.appUserId,
        title: title?.trim() || null,
        content: content.trim(),
        entityType: entityType || "general",
        entityId: entityId || "",
      })
      .returning();

    // Ingest into context graph (async, non-blocking)
    if (content.trim().length > 20) {
      const graphContent = `Note: ${title || "Untitled"}\n\n${content.trim().slice(0, 3000)}`;
      ingestEpisode(authCtx.tenantId, graphContent, "note", note.id)
        .catch((e) => console.warn("notes: ingestEpisode failed (non-blocking)", e));
    }

    return Response.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Failed to create note:", error);
    return Response.json({ error: "Failed to create note" }, { status: 500 });
  }
}
