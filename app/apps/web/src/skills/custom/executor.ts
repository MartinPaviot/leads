import { db } from "@/db";
import { customSkillTemplates } from "@/db/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import logger from "@/lib/observability/logger";

interface SkillStep {
  order: number;
  instruction: string;
  toolHint?: string;
}

interface SkillConstraint {
  instruction: string;
}

interface SkillParameter {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface CustomSkillInput {
  skillId?: string;
  skillSlug?: string;
  skillName?: string;
  parameters?: Record<string, string>;
  entityContext?: string;
  targetEntityIds?: string[];
}

export interface CustomSkillResult {
  success: boolean;
  output: string;
  skillName: string;
  parametersUsed: Record<string, string>;
  knowledgeUsed: string[];
  durationMs: number;
  error?: string;
}

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function findSkill(
  input: CustomSkillInput,
  tenantId: string,
  userId: string
): Promise<typeof customSkillTemplates.$inferSelect | null> {
  const conditions = [
    eq(customSkillTemplates.tenantId, tenantId),
    eq(customSkillTemplates.isActive, true),
    or(
      eq(customSkillTemplates.scope, "workspace"),
      and(
        eq(customSkillTemplates.scope, "user"),
        eq(customSkillTemplates.createdByUserId, userId)
      )
    ),
  ];

  if (input.skillId) {
    conditions.push(eq(customSkillTemplates.id, input.skillId));
  } else if (input.skillSlug) {
    conditions.push(eq(customSkillTemplates.slug, input.skillSlug));
  }

  const [skill] = await db
    .select()
    .from(customSkillTemplates)
    .where(and(...conditions))
    .limit(1);

  if (skill) return skill;

  // Fuzzy name match as fallback
  if (input.skillName) {
    const [fuzzy] = await db
      .select()
      .from(customSkillTemplates)
      .where(
        and(
          eq(customSkillTemplates.tenantId, tenantId),
          eq(customSkillTemplates.isActive, true),
          sql`LOWER(${customSkillTemplates.name}) LIKE LOWER(${"%" + input.skillName + "%"})`
        )
      )
      .limit(1);
    return fuzzy ?? null;
  }

  return null;
}

export async function executeCustomSkill(
  skill: typeof customSkillTemplates.$inferSelect,
  input: CustomSkillInput,
  tenantId: string,
  userId: string
): Promise<CustomSkillResult> {
  const start = Date.now();
  const model = getLLMModel();
  if (!model) {
    return {
      success: false,
      output: "",
      skillName: skill.name,
      parametersUsed: input.parameters ?? {},
      knowledgeUsed: [],
      durationMs: Date.now() - start,
      error: "No LLM configured",
    };
  }

  try {
    // 1. Retrieve relevant knowledge for this skill
    const steps = (skill.steps as SkillStep[]) ?? [];
    const constraints = (skill.constraints as SkillConstraint[]) ?? [];
    const parameters = (skill.parameters as SkillParameter[]) ?? [];

    const knowledgeQuery = [
      skill.description,
      ...steps.map((s) => s.instruction),
    ].join(" ");

    const knowledgeEntries = await retrieveKnowledge(knowledgeQuery, tenantId, {
      userId,
      limit: 3,
    }).catch(() => []);

    // 2. Validate required parameters
    const params = input.parameters ?? {};
    for (const p of parameters) {
      if (p.required && !params[p.name] && !p.defaultValue) {
        return {
          success: false,
          output: "",
          skillName: skill.name,
          parametersUsed: params,
          knowledgeUsed: [],
          durationMs: Date.now() - start,
          error: `Missing required parameter: ${p.name} (${p.description})`,
        };
      }
      if (!params[p.name] && p.defaultValue) {
        params[p.name] = p.defaultValue;
      }
    }

    // 3. Build skill execution prompt
    const prompt = buildSkillPrompt(skill, steps, constraints, params, knowledgeEntries, input.entityContext);

    // 4. Execute
    const response = await generateText({
      model,
      prompt,
      // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
      maxTokens: 4000,
      temperature: 0.3,
    });

    // 5. Update usage stats (fire-and-forget)
    db.update(customSkillTemplates)
      .set({
        useCount: sql`${customSkillTemplates.useCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customSkillTemplates.id, skill.id))
      .then(() => {})
      .catch(() => {});

    return {
      success: true,
      output: response.text,
      skillName: skill.name,
      parametersUsed: params,
      knowledgeUsed: knowledgeEntries.map((k) => k.title),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Custom skill execution failed", {
      skillId: skill.id,
      error: msg,
    });
    return {
      success: false,
      output: "",
      skillName: skill.name,
      parametersUsed: input.parameters ?? {},
      knowledgeUsed: [],
      durationMs: Date.now() - start,
      error: msg,
    };
  }
}

function buildSkillPrompt(
  skill: typeof customSkillTemplates.$inferSelect,
  steps: SkillStep[],
  constraints: SkillConstraint[],
  params: Record<string, string>,
  knowledge: Array<{ title: string; content: string }>,
  entityContext?: string
): string {
  const sections: string[] = [];

  // Role
  sections.push(
    `You are executing the skill "${skill.name}".`
  );
  sections.push(`Description: ${skill.description}`);

  // Knowledge context
  if (knowledge.length > 0) {
    sections.push("\n## Business Knowledge (use this to ground your work)\n");
    for (const k of knowledge) {
      sections.push(`### ${k.title}\n${k.content}`);
    }
  }

  // Entity context
  if (entityContext) {
    sections.push(`\n## Current Context\n${entityContext}`);
  }

  // Parameters
  if (Object.keys(params).length > 0) {
    sections.push("\n## Parameters");
    for (const [key, value] of Object.entries(params)) {
      sections.push(`- ${key}: ${value}`);
    }
  }

  // Steps
  if (steps.length > 0) {
    sections.push("\n## Steps (follow these in order)");
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    for (const step of sorted) {
      let stepText = `${step.order}. ${step.instruction}`;
      // Substitute parameters in step instructions
      for (const [key, value] of Object.entries(params)) {
        stepText = stepText.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }
      sections.push(stepText);
    }
  } else if (skill.guidelines) {
    sections.push(`\n## Guidelines\n${skill.guidelines}`);
  }

  // Constraints
  if (constraints.length > 0) {
    sections.push("\n## Constraints (you MUST follow these)");
    for (const c of constraints) {
      sections.push(`- ${c.instruction}`);
    }
  }

  // Output format
  if (skill.outputFormat) {
    sections.push(`\n## Output Format\n${skill.outputFormat}`);
  }

  return sections.join("\n");
}

/**
 * List all skills available to a user: system skills + workspace + user custom skills.
 * Sorted by recently used first.
 */
export async function listAvailableSkills(
  tenantId: string,
  userId: string
): Promise<Array<{
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  scope: string;
  isEditable: boolean;
  useCount: number;
  lastUsedAt: string | null;
  hasSteps: boolean;
}>> {
  const skills = await db
    .select()
    .from(customSkillTemplates)
    .where(
      and(
        eq(customSkillTemplates.tenantId, tenantId),
        eq(customSkillTemplates.isActive, true),
        or(
          eq(customSkillTemplates.scope, "workspace"),
          and(
            eq(customSkillTemplates.scope, "user"),
            eq(customSkillTemplates.createdByUserId, userId)
          )
        )
      )
    )
    .orderBy(desc(customSkillTemplates.lastUsedAt));

  return skills.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    category: s.category,
    scope: s.scope,
    isEditable: s.createdByUserId === userId || s.scope === "user",
    useCount: s.useCount,
    lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
    hasSteps: ((s.steps as SkillStep[]) ?? []).length > 0,
  }));
}

/**
 * Fork a skill: create a copy the user can customize.
 */
export async function forkSkill(
  sourceSkillId: string,
  tenantId: string,
  userId: string,
  overrides?: { name?: string; scope?: string }
): Promise<string> {
  const [source] = await db
    .select()
    .from(customSkillTemplates)
    .where(
      and(
        eq(customSkillTemplates.id, sourceSkillId),
        eq(customSkillTemplates.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!source) throw new Error("Source skill not found");

  const newName = overrides?.name ?? `${source.name} (custom)`;
  const newSlug = `${source.slug}-custom-${Date.now()}`;

  const [forked] = await db
    .insert(customSkillTemplates)
    .values({
      tenantId,
      slug: newSlug,
      name: newName,
      category: source.category,
      description: source.description,
      scope: overrides?.scope ?? "user",
      trigger: source.trigger,
      contextRequired: source.contextRequired,
      outputFormat: source.outputFormat,
      guidelines: source.guidelines,
      steps: source.steps,
      constraints: source.constraints,
      parameters: source.parameters,
      examples: source.examples,
      forkedFromId: sourceSkillId,
      createdByUserId: userId,
    })
    .returning();

  return forked.id;
}
