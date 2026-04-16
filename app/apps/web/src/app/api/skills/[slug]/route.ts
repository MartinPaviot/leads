import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { getSkill, listSkills } from "@/skills/registry";
import { registerAllSkills } from "@/skills/register-all";
import { runSkill } from "@/skills/runner";

// Register all skills on first import
registerAllSkills();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const skill = getSkill(slug);
  if (!skill) {
    return NextResponse.json(
      { error: `Skill "${slug}" not found`, available: listSkills().map((s) => s.slug) },
      { status: 404 },
    );
  }

  const body = await req.json();
  const result = await runSkill(skill, body.input, {
    tenantId: authCtx.tenantId,
    dryRun: body.dryRun ?? true,
  });

  return NextResponse.json(result);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  // Special case: list all skills
  if (slug === "list") {
    registerAllSkills();
    const skills = listSkills().map((s) => ({
      slug: s.slug,
      name: s.name,
      category: s.category,
      description: s.description,
      costEstimate: s.costEstimate,
    }));
    return NextResponse.json({ skills, total: skills.length });
  }

  registerAllSkills();
  const skill = getSkill(slug);
  if (!skill) {
    return NextResponse.json({ error: `Skill "${slug}" not found` }, { status: 404 });
  }

  return NextResponse.json({
    slug: skill.slug,
    name: skill.name,
    category: skill.category,
    description: skill.description,
    costEstimate: skill.costEstimate,
  });
}
