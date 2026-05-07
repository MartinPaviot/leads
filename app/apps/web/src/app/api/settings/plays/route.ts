import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { customSkillTemplates } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const plays = await db
    .select()
    .from(customSkillTemplates)
    .where(eq(customSkillTemplates.tenantId, authCtx.tenantId))
    .orderBy(desc(customSkillTemplates.updatedAt));

  return Response.json({ plays });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, category, description, guidelines, trigger, examples } = body;

  if (!name || !category || !guidelines) {
    return Response.json({ error: "name, category, and guidelines are required" }, { status: 400 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const [created] = await db
    .insert(customSkillTemplates)
    .values({
      tenantId: authCtx.tenantId,
      slug,
      name,
      category,
      description: description || "",
      guidelines,
      trigger: trigger || null,
      examples: examples ? JSON.parse(typeof examples === "string" ? examples : JSON.stringify(examples)) : null,
      createdByUserId: authCtx.appUserId,
    })
    .returning();

  return Response.json({ play: created }, { status: 201 });
}
