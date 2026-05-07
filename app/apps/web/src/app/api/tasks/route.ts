import { db } from "@/db";
import { tasks, companies, contacts, deals } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { z } from "zod";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(5000).optional(),
  dueDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(200).optional(),
});

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.tenantId, authCtx.tenantId), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt))
      .limit(200);

    // Resolve entity names for linked tasks
    const entityIds = {
      company: new Set<string>(),
      contact: new Set<string>(),
      deal: new Set<string>(),
    };

    for (const task of result) {
      if (task.entityType && task.entityId) {
        const key = task.entityType as keyof typeof entityIds;
        if (key in entityIds) entityIds[key].add(task.entityId);
      }
    }

    const nameMap = new Map<string, string>();

    if (entityIds.company.size > 0) {
      const ids = [...entityIds.company];
      const rows = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(sql`${companies.id} = ANY(${ids})`);
      for (const r of rows) nameMap.set(r.id, r.name);
    }

    if (entityIds.contact.size > 0) {
      const ids = [...entityIds.contact];
      const rows = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(sql`${contacts.id} = ANY(${ids})`);
      for (const r of rows) {
        nameMap.set(r.id, [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown");
      }
    }

    if (entityIds.deal.size > 0) {
      const ids = [...entityIds.deal];
      const rows = await db
        .select({ id: deals.id, name: deals.name })
        .from(deals)
        .where(sql`${deals.id} = ANY(${ids})`);
      for (const r of rows) nameMap.set(r.id, r.name);
    }

    const enriched = result.map((task) => ({
      ...task,
      entityName: task.entityId ? nameMap.get(task.entityId) || null : null,
    }));

    return Response.json({ tasks: enriched });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = createTaskSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid task data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { title, description, dueDate, priority, entityType, entityId } = parsed.data;

    const [task] = await db
      .insert(tasks)
      .values({
        title: title.trim(),
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "medium",
        assigneeId: authCtx.appUserId,
        entityType: entityType || null,
        entityId: entityId || null,
        tenantId: authCtx.tenantId,
      })
      .returning();

    return Response.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return apiError("INTERNAL_ERROR", "Failed to create task");
  }
}
