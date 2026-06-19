import { z } from "zod";
import {
  findSkill,
  executeCustomSkill,
  listAvailableSkills,
  forkSkill as forkSkillImpl,
} from "@/skills/custom/executor";
import { makeTool, type ToolContext } from "./context";

/**
 * Chat bridge to user-authored CUSTOM skills (DB-backed, Settings > Skills),
 * as opposed to the hardcoded built-in skills wrapped by buildSkillsTools.
 *
 * The chat system prompt has long advertised runCustomSkill/listCustomSkills/
 * forkSkill, and tool-router + orchestrator map them (group "skills"), but the
 * tools themselves were never built — they were phantom references. CLE-02
 * makes them real, delegating to the already-tenant-scoped executor
 * (skills/custom/executor.ts). No raw `db` access here: tenant scoping lives in
 * the executor, so there is exactly one implementation to audit.
 *
 * Forward-compat: forkSkill's role gate is local (mirrors the REST route);
 * CLE-10 will route it through the unified decideAction.
 */
export function buildCustomSkillTools(ctx: ToolContext) {
  const RunInput = z
    .object({
      skillId: z.string().optional().describe("Exact custom-skill id (preferred)"),
      skillSlug: z.string().optional().describe("Skill slug"),
      skillName: z.string().optional().describe("Fuzzy skill name (fallback resolution)"),
      parameters: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Parameter values for the skill; keys are the skill's declared parameter names"),
      entityContext: z.string().optional().describe("Free-text context about the current record/entity"),
      targetEntityIds: z.array(z.string()).optional().describe("Optional related entity ids (forward-compat)"),
    })
    .refine((v) => v.skillId || v.skillSlug || v.skillName, {
      message: "Provide one of skillId, skillSlug, or skillName",
    });

  const ForkInput = z.object({
    sourceSkillId: z.string().describe("Id of the skill to copy"),
    name: z.string().optional().describe("Name for the new copy (default: '<source> (custom)')"),
    scope: z.enum(["user", "workspace"]).optional().describe("Visibility of the copy; default 'user'"),
  });

  return {
    listCustomSkills: makeTool({
      description:
        "List the user's saved CUSTOM skills (reusable workflows they created in Settings), " +
        "scoped to this workspace and user. Returns name, slug, description, scope, and usage. " +
        "Use when the user asks 'what skills do I have', 'list my playbooks', or before running one. " +
        "This is for user-created skills only — built-in capabilities have their own dedicated tools.",
      inputSchema: z.object({}),
      execute: async () => {
        const skills = await listAvailableSkills(ctx.tenantId, ctx.userId);
        return { skills, count: skills.length };
      },
    }),

    runCustomSkill: makeTool({
      description:
        "Run one of the user's saved CUSTOM skills by id, slug, or name, grounded in the workspace's " +
        "business knowledge. Returns the skill's text output. Resolve the skill first with listCustomSkills " +
        "if unsure of the id. Note: a custom skill produces a written result; it does not itself call other tools.",
      inputSchema: RunInput,
      execute: async (input) => {
        // Executor expects Record<string,string>; coerce scalar values.
        const parameters = input.parameters
          ? Object.fromEntries(Object.entries(input.parameters).map(([k, v]) => [k, String(v)]))
          : undefined;
        const skill = await findSkill(
          { skillId: input.skillId, skillSlug: input.skillSlug, skillName: input.skillName },
          ctx.tenantId,
          ctx.userId,
        );
        if (!skill) {
          const crit = input.skillId ?? input.skillSlug ?? input.skillName ?? "(none)";
          return { success: false, error: `No matching custom skill found for "${crit}"` };
        }
        return executeCustomSkill(skill, { ...input, parameters }, ctx.tenantId, ctx.userId);
      },
    }),

    forkSkill: makeTool({
      description:
        "Create the user's own editable copy of a skill so they can customize it. Writes a new skill. " +
        "Workspace-scoped copies require admin; user-scoped copies are personal. Use when the user says " +
        "'fork this skill', 'make my own version', or 'copy and let me tweak it'.",
      inputSchema: ForkInput,
      execute: async (input) => {
        const scope = input.scope ?? "user";
        const role = ctx.authCtx.role; // "admin" | "member" | "viewer"
        // Write gate — mirrors the REST route (workspace create requires admin).
        // CLE-10 will fold this into decideAction.
        if (role === "viewer") {
          return { ok: false, error: "Viewers cannot fork skills" };
        }
        if (scope === "workspace" && role !== "admin") {
          return { ok: false, error: "Only admins can fork a workspace-scoped skill" };
        }
        try {
          const newSkillId = await forkSkillImpl(input.sourceSkillId, ctx.tenantId, ctx.userId, {
            name: input.name,
            scope,
          });
          return { ok: true, newSkillId, name: input.name ?? null };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, error: msg };
        }
      },
    }),
  };
}
