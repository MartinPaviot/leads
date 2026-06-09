import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { customSkillTemplates } from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { listAvailableSkills, forkSkill } from "@/skills/custom/executor";
import { listSkills } from "@/skills/registry";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Custom skills from DB
    const custom = await listAvailableSkills(authCtx.tenantId, authCtx.appUserId);

    // System skills from registry (hardcoded)
    const system = listSkills().map((s) => ({
      id: `system-${s.slug}`,
      slug: s.slug,
      name: s.name,
      description: s.description,
      category: s.category,
      scope: "system" as const,
      isEditable: false,
      useCount: 0,
      lastUsedAt: null,
      hasSteps: false,
    }));

    return Response.json({ skills: [...custom, ...system] });
  } catch (error) {
    console.error("Failed to list skills:", error);
    return Response.json({ error: "Failed to list skills" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      name,
      description,
      category,
      scope,
      steps,
      constraints,
      parameters,
      outputFormat,
      guidelines,
      forkFromId,
    } = body;

    // Fork flow
    if (forkFromId) {
      const id = await forkSkill(
        forkFromId,
        authCtx.tenantId,
        authCtx.appUserId,
        { name, scope }
      );
      return Response.json({ id }, { status: 201 });
    }

    // Create new skill
    if (!name?.trim() || !description?.trim()) {
      return Response.json(
        { error: "Name and description required" },
        { status: 400 }
      );
    }

    if (!steps?.length && !guidelines?.trim()) {
      return Response.json(
        { error: "At least one step or guidelines required" },
        { status: 400 }
      );
    }

    const entryScope = scope === "user" ? "user" : "workspace";
    if (entryScope === "workspace") {
      const adminCheck = requireAdmin(authCtx);
      if (adminCheck) return adminCheck;
    }

    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check slug collision
    const [existing] = await db
      .select({ id: customSkillTemplates.id })
      .from(customSkillTemplates)
      .where(
        and(
          eq(customSkillTemplates.tenantId, authCtx.tenantId),
          eq(customSkillTemplates.slug, slug)
        )
      )
      .limit(1);

    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const [skill] = await db
      .insert(customSkillTemplates)
      .values({
        tenantId: authCtx.tenantId,
        createdByUserId: authCtx.appUserId,
        slug: finalSlug,
        name: name.trim(),
        description: description.trim(),
        category: category || "custom",
        scope: entryScope,
        steps: steps ?? [],
        constraints: constraints ?? [],
        parameters: parameters ?? [],
        outputFormat: outputFormat ?? null,
        guidelines: guidelines?.trim() ?? "",
      })
      .returning();

    return Response.json({ skill }, { status: 201 });
  } catch (error) {
    console.error("Failed to create skill:", error);
    return Response.json({ error: "Failed to create skill" }, { status: 500 });
  }
}
