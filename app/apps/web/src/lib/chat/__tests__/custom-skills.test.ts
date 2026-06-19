/**
 * CLE-02 — custom-skill chat bridge.
 *
 * Verifies runCustomSkill/listCustomSkills/forkSkill delegate to the
 * tenant-scoped executor, forward ctx.tenantId/ctx.userId (never tool input),
 * coerce scalar params to strings, and gate fork by role. The executor is
 * mocked so no DB/LLM is touched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { findSkillMock, executeMock, listMock, forkMock } = vi.hoisted(() => ({
  findSkillMock: vi.fn(),
  executeMock: vi.fn(),
  listMock: vi.fn(),
  forkMock: vi.fn(),
}));

// context.ts makeTool wraps tools via `tool()` from "ai"; identity-mock it to
// dodge the local @ai-sdk/provider resolver flake (CI fine).
vi.mock("ai", () => ({ tool: (cfg: unknown) => cfg }));

vi.mock("@/skills/custom/executor", () => ({
  findSkill: findSkillMock,
  executeCustomSkill: executeMock,
  listAvailableSkills: listMock,
  forkSkill: forkMock,
}));

const { buildCustomSkillTools } = await import("@/lib/chat/tools/custom-skills");
import type { ToolContext } from "@/lib/chat/tools/context";

function makeCtx(role: "admin" | "member" | "viewer"): ToolContext {
  return {
    tenantId: "t1",
    userId: "u1",
    authCtx: { role, appUserId: "u1", tenantId: "t1" },
    settings: {},
    agentApprovalMode: "review-each",
  } as unknown as ToolContext;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(tool: any, input: unknown) {
  return (tool.execute as (i: unknown, o?: unknown) => Promise<unknown>)(input, {});
}

beforeEach(() => {
  findSkillMock.mockReset();
  executeMock.mockReset();
  listMock.mockReset();
  forkMock.mockReset();
});

describe("listCustomSkills", () => {
  it("forwards tenant+user and returns the list with a count", async () => {
    listMock.mockResolvedValue([{ id: "s1", name: "Romand inbound" }]);
    const tools = buildCustomSkillTools(makeCtx("member"));
    const res = (await run(tools.listCustomSkills, {})) as { skills: unknown[]; count: number };
    expect(listMock).toHaveBeenCalledWith("t1", "u1");
    expect(res.count).toBe(1);
    expect(res.skills).toHaveLength(1);
  });
});

describe("runCustomSkill", () => {
  it("returns a structured error when no skill resolves (no execute)", async () => {
    findSkillMock.mockResolvedValue(null);
    const tools = buildCustomSkillTools(makeCtx("member"));
    const res = (await run(tools.runCustomSkill, { skillName: "nope" })) as { success: boolean; error: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/No matching custom skill found/);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("coerces scalar parameters to strings and forwards the executor result", async () => {
    findSkillMock.mockResolvedValue({ id: "s1", name: "Skill" });
    executeMock.mockResolvedValue({ success: true, output: "done", skillName: "Skill" });
    const tools = buildCustomSkillTools(makeCtx("member"));
    const res = (await run(tools.runCustomSkill, {
      skillId: "s1",
      parameters: { a: 1, b: "x", c: true },
    })) as { success: boolean; output: string };

    expect(findSkillMock).toHaveBeenCalledWith({ skillId: "s1", skillSlug: undefined, skillName: undefined }, "t1", "u1");
    const [, fwdInput, fwdTenant, fwdUser] = executeMock.mock.calls[0];
    expect(fwdInput.parameters).toEqual({ a: "1", b: "x", c: "true" });
    expect(fwdTenant).toBe("t1");
    expect(fwdUser).toBe("u1");
    expect(res.success).toBe(true);
    expect(res.output).toBe("done");
  });
});

describe("forkSkill (write gate)", () => {
  it("member + user scope forks and returns the new id", async () => {
    forkMock.mockResolvedValue("new-1");
    const tools = buildCustomSkillTools(makeCtx("member"));
    const res = (await run(tools.forkSkill, { sourceSkillId: "s1" })) as { ok: boolean; newSkillId: string };
    expect(forkMock).toHaveBeenCalledWith("s1", "t1", "u1", { name: undefined, scope: "user" });
    expect(res.ok).toBe(true);
    expect(res.newSkillId).toBe("new-1");
  });

  it("member + workspace scope is refused without writing", async () => {
    const tools = buildCustomSkillTools(makeCtx("member"));
    const res = (await run(tools.forkSkill, { sourceSkillId: "s1", scope: "workspace" })) as { ok: boolean };
    expect(res.ok).toBe(false);
    expect(forkMock).not.toHaveBeenCalled();
  });

  it("admin may fork a workspace-scoped skill", async () => {
    forkMock.mockResolvedValue("ws-1");
    const tools = buildCustomSkillTools(makeCtx("admin"));
    const res = (await run(tools.forkSkill, { sourceSkillId: "s1", scope: "workspace" })) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(forkMock).toHaveBeenCalledTimes(1);
  });

  it("viewer is refused without writing", async () => {
    const tools = buildCustomSkillTools(makeCtx("viewer"));
    const res = (await run(tools.forkSkill, { sourceSkillId: "s1" })) as { ok: boolean };
    expect(res.ok).toBe(false);
    expect(forkMock).not.toHaveBeenCalled();
  });

  it("surfaces an executor throw as a structured error", async () => {
    forkMock.mockRejectedValue(new Error("Source skill not found"));
    const tools = buildCustomSkillTools(makeCtx("member"));
    const res = (await run(tools.forkSkill, { sourceSkillId: "missing" })) as { ok: boolean; error: string };
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Source skill not found");
  });
});
