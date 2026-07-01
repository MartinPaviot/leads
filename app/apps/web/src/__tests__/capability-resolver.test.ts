import { describe, it, expect } from "vitest";
import {
  resolveCapabilities,
  ADMIN_ONLY_TOOLS,
  DESTRUCTIVE_TOOLS,
  VIEWER_DENIED_TOOLS,
  isViewerAllowedTool,
} from "@/lib/agents/capability-resolver";

// Build a fake tool registry with the names we care about. Values are
// opaque — the resolver only filters keys.
function fakeRegistry(): Record<string, { name: string }> {
  const names = [
    // basic reads
    "searchCRM",
    "queryContacts",
    "queryAccounts",
    "queryDeals",
    "queryActivities",
    "whoami",
    "listSchema",
    "listAttributeDefinitions",
    // create (non-admin)
    "createContact",
    "createAccount",
    "createDeal",
    "createNote",
    "createTask",
    "createSequence",
    "addSequenceStep",
    "logActivity",
    // update (non-admin)
    "updateContact",
    "updateAccount",
    "updateDeal",
    "updateDealStage",
    "updateTask",
    "completeTask",
    "updateSequence",
    "updateSequenceStep",
    "updateMeetingNotes",
    "updateUserProfile",
    "updateNotificationPreferences",
    "updateMailboxSettings",
    "updateMemberRole",
    // admin-only
    "updateICP",
    "updateWorkspace",
    "updatePrivacySettings",
    "updatePipelineStages",
    "updateCustomFieldSchema",
    "updateCustomSignalDefinitions",
    "updateWorkflows",
    "updateMailCalendarIntegration",
    "createKnowledgeEntry",
    "updateKnowledgeEntry",
    "inviteMember",
    "resendInvite",
    "createCustomObjectType",
    "updateCustomObjectType",
    // destructive
    "mergeContacts",
    "deleteSequenceStep",
    "deleteKnowledgeEntry",
    "removeMailbox",
    "revokeInvite",
    // action
    "sendMeetingFollowUp",
    "bookMeeting",
    "enrollInSequence",
    "launchCampaign",
    "runSequenceAutopilot",
    "unsubscribeContact",
    "addMailbox",
    // intelligence / synthesis
    "getDealCoaching",
    "getAccountIntelligence",
    "analyzePipeline",
    "buildTAM",
    "researchCompetitor",
    "findLeadsByDomain",
  ];
  const r: Record<string, { name: string }> = {};
  for (const n of names) r[n] = { name: n };
  return r;
}

describe("resolveCapabilities", () => {
  it("keeps non-admin, non-destructive tools for a regular member (global surface)", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, { role: "member" });
    expect(res.tools.searchCRM).toBeDefined();
    expect(res.tools.createContact).toBeDefined();
    expect(res.tools.updateContact).toBeDefined();
    expect(res.tools.getDealCoaching).toBeDefined();
    expect(res.surfacePromptAddendum).toBe("");
  });

  it("drops admin-only tools for a member", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, { role: "member" });
    for (const name of ADMIN_ONLY_TOOLS) {
      if (name in registry) expect(res.tools[name]).toBeUndefined();
    }
    const reasons = new Set(res.droppedTools.map((d) => d.reason));
    expect(reasons.has("admin-only")).toBe(true);
  });

  it("keeps admin-only tools for an admin", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, { role: "admin" });
    expect(res.tools.updateICP).toBeDefined();
    expect(res.tools.inviteMember).toBeDefined();
    expect(res.tools.createKnowledgeEntry).toBeDefined();
    expect(res.tools.createCustomObjectType).toBeDefined();
  });

  it("drops destructive tools unless explicitly allowed", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, { role: "admin" });
    for (const name of DESTRUCTIVE_TOOLS) {
      if (name in registry) expect(res.tools[name]).toBeUndefined();
    }
    const res2 = resolveCapabilities(registry, {
      role: "admin",
      allowDestructive: true,
    });
    expect(res2.tools.mergeContacts).toBeDefined();
    expect(res2.tools.deleteSequenceStep).toBeDefined();
  });

  it("gates pro-tier tools on free plan", () => {
    const registry = fakeRegistry();
    const free = resolveCapabilities(registry, { role: "admin", planTier: "free" });
    expect(free.tools.buildTAM).toBeUndefined();
    expect(free.tools.researchCompetitor).toBeUndefined();
    expect(free.tools.findLeadsByDomain).toBeUndefined();
    expect(free.tools.launchCampaign).toBeUndefined();
    expect(free.tools.runSequenceAutopilot).toBeUndefined();

    const pro = resolveCapabilities(registry, { role: "admin", planTier: "pro" });
    expect(pro.tools.buildTAM).toBeDefined();
    expect(pro.tools.researchCompetitor).toBeDefined();
  });

  it("seeds contact surface addendum with entity info", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, {
      role: "member",
      surface: { type: "contact", entityId: "c1", entityName: "Jane Doe" },
    });
    expect(res.surfacePromptAddendum).toContain("Jane Doe");
    expect(res.surfacePromptAddendum).toContain("c1");
    expect(res.surfacePromptAddendum.toLowerCase()).toContain("contact");
  });

  it("seeds deal surface addendum differently than account surface", () => {
    const registry = fakeRegistry();
    const dealRes = resolveCapabilities(registry, {
      role: "member",
      surface: { type: "deal", entityId: "d1" },
    });
    const accountRes = resolveCapabilities(registry, {
      role: "member",
      surface: { type: "account", entityId: "a1" },
    });
    expect(dealRes.surfacePromptAddendum).not.toBe(accountRes.surfacePromptAddendum);
    expect(dealRes.surfacePromptAddendum.toLowerCase()).toContain("deal");
    expect(accountRes.surfacePromptAddendum.toLowerCase()).toContain("account");
  });

  it("disables mutations on slack surface until CHAT-08", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, {
      role: "admin",
      surface: { type: "slack" },
    });
    expect(res.tools.createContact).toBeUndefined();
    expect(res.tools.updateContact).toBeUndefined();
    expect(res.tools.sendMeetingFollowUp).toBeUndefined();
    // Reads still allowed
    expect(res.tools.searchCRM).toBeDefined();
    expect(res.tools.queryContacts).toBeDefined();
    expect(res.tools.getDealCoaching).toBeDefined();
    const slackReasons = res.droppedTools
      .filter((d) => d.reason.startsWith("slack:"))
      .map((d) => d.name);
    expect(slackReasons).toContain("createContact");
  });

  it("list surface addendum mentions the resource", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, {
      role: "member",
      surface: { type: "list", listResource: "deals" },
    });
    expect(res.surfacePromptAddendum).toContain("deals");
    expect(res.surfacePromptAddendum.toLowerCase()).toContain("bulk");
  });

  it("global surface produces empty addendum", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, {
      role: "member",
      surface: { type: "global" },
    });
    expect(res.surfacePromptAddendum).toBe("");
  });

  it("mcp surface addendum advises the external client", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, {
      role: "member",
      surface: { type: "mcp" },
    });
    expect(res.surfacePromptAddendum.toLowerCase()).toContain("mcp");
  });

  it("registry pass-through: tool objects are referentially equal", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, { role: "member" });
    expect(res.tools.searchCRM).toBe(registry.searchCRM);
  });

  it("droppedTools reason coverage: every dropped tool has a reason", () => {
    const registry = fakeRegistry();
    const res = resolveCapabilities(registry, { role: "member" });
    for (const d of res.droppedTools) {
      expect(d.reason).toBeTruthy();
      expect(d.reason.length).toBeGreaterThan(0);
      expect(d.name in registry).toBe(true);
    }
  });
});

// Regression: 2026-07-01 live CHAT-08 MCP OAuth verification found 4
// delete-prefixed tools (deleteSharedPrompt/deleteWorkflow/
// deleteAccountList/deleteSearchMonitor) present in the REAL registry but
// missing from DESTRUCTIVE_TOOLS — every other test above uses a synthetic
// fakeRegistry() fixture, which can never catch this class of drift because
// it only ever contains names someone remembered to list. This suite uses
// the real buildAllChatTools registry instead, so a newly-added delete/merge
// tool that isn't also added to DESTRUCTIVE_TOOLS fails CI immediately.
describe("resolveCapabilities — DESTRUCTIVE_TOOLS matches the real registry", () => {
  it("every delete/merge-prefixed tool in the real registry is in DESTRUCTIVE_TOOLS", async () => {
    const { buildAllChatTools } = await import("@/lib/chat/tools");
    const fakeCtx = {
      tenantId: "t1",
      userId: "u1",
      authCtx: { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as any,
      settings: {} as any,
      agentApprovalMode: "auto" as any,
    };
    const registry = buildAllChatTools(fakeCtx);
    const destructiveByName = Object.keys(registry).filter((name) => /^(delete|merge)/.test(name));
    // Sanity: this must find tools, otherwise the assertion below is vacuous.
    expect(destructiveByName.length).toBeGreaterThan(0);

    const missing = destructiveByName.filter((name) => !DESTRUCTIVE_TOOLS.has(name));
    expect(missing, `delete/merge tool(s) missing from DESTRUCTIVE_TOOLS: ${missing.join(", ")}`).toEqual([]);
  });

  it("real registry: no delete/merge tool is reachable over MCP (allowDestructive hard-coded false)", async () => {
    const { buildAllChatTools } = await import("@/lib/chat/tools");
    const fakeCtx = {
      tenantId: "t1",
      userId: "u1",
      authCtx: { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as any,
      settings: {} as any,
      agentApprovalMode: "auto" as any,
    };
    const registry = buildAllChatTools(fakeCtx);
    const res = resolveCapabilities(registry, { role: "admin", surface: { type: "mcp" }, allowDestructive: false });
    const stillReachable = Object.keys(res.tools).filter((name) => /^(delete|merge)/.test(name));
    expect(stillReachable, `delete/merge tool(s) still reachable over MCP: ${stillReachable.join(", ")}`).toEqual([]);
  });
});

describe("resolveCapabilities — viewer (read-only role)", () => {
  function viewerRegistry(): Record<string, { name: string }> {
    const names = [
      // query group — allowed
      "searchCRM",
      "queryContacts",
      "queryAccounts",
      "queryDeals",
      "whoami",
      "openRecord",
      "openListView",
      "querySequences",
      "getMailboxHealth",
      "queryProposals",
      // query group but write/outbound — denied by name
      "composeEmail",
      "deleteSharedPrompt",
      // briefing — allowed
      "briefAllDeals",
      "briefDeal",
      "getCompanyBrain",
      // coaching — allowed
      "getCoachingInsights",
      "searchExactWords",
      // schema — allowed
      "listSchema",
      "listAttributeDefinitions",
      // intelligence / skills / memory / mutations — dropped
      "getDealCoaching",
      "executeCode",
      "enrichContact",
      "buildTAM",
      "rememberContext",
      "exploreGraph",
      "createContact",
      "updateDeal",
      "draftEmail",
      "enrollInSequence",
      "bookMeeting",
      // unknown tool (no group mapping)
      "someBrandNewTool",
    ];
    const r: Record<string, { name: string }> = {};
    for (const n of names) r[n] = { name: n };
    return r;
  }

  it("keeps only query/briefing/coaching/schema reads", () => {
    const res = resolveCapabilities(viewerRegistry(), { role: "viewer" });
    const kept = Object.keys(res.tools).sort();
    expect(kept).toEqual(
      [
        "searchCRM",
        "queryContacts",
        "queryAccounts",
        "queryDeals",
        "whoami",
        "openRecord",
        "openListView",
        "querySequences",
        "getMailboxHealth",
        "queryProposals",
        "briefAllDeals",
        "briefDeal",
        "getCompanyBrain",
        "getCoachingInsights",
        "searchExactWords",
        "listSchema",
        "listAttributeDefinitions",
      ].sort(),
    );
  });

  it("drops composeEmail and deleteSharedPrompt even though they live in the query group", () => {
    const res = resolveCapabilities(viewerRegistry(), { role: "viewer" });
    for (const name of VIEWER_DENIED_TOOLS) {
      expect(res.tools[name]).toBeUndefined();
    }
    expect(isViewerAllowedTool("composeEmail")).toBe(false);
    // sanity: a member still gets composeEmail (query group passes through)
    const member = resolveCapabilities(viewerRegistry(), { role: "member" });
    expect(member.tools.composeEmail).toBeDefined();
  });

  it("drops unknown tools for viewers (fail-closed) but keeps them for members (fail-open)", () => {
    const viewer = resolveCapabilities(viewerRegistry(), { role: "viewer" });
    expect(viewer.tools.someBrandNewTool).toBeUndefined();
    const member = resolveCapabilities(viewerRegistry(), { role: "member" });
    expect(member.tools.someBrandNewTool).toBeDefined();
  });

  it("tags every viewer drop with the viewer:read-only reason", () => {
    const res = resolveCapabilities(viewerRegistry(), { role: "viewer" });
    const viewerDrops = res.droppedTools.filter((d) => d.reason === "viewer:read-only");
    expect(viewerDrops.map((d) => d.name)).toContain("createContact");
    expect(viewerDrops.map((d) => d.name)).toContain("composeEmail");
    expect(viewerDrops.map((d) => d.name)).toContain("someBrandNewTool");
  });

  it("appends the read-only prompt addendum for viewers only", () => {
    const viewer = resolveCapabilities(viewerRegistry(), { role: "viewer" });
    expect(viewer.surfacePromptAddendum).toContain("Read-Only Access");
    const member = resolveCapabilities(viewerRegistry(), { role: "member" });
    expect(member.surfacePromptAddendum).not.toContain("Read-Only Access");
  });

  it("composes with surface addenda (viewer on a contact page gets both)", () => {
    const res = resolveCapabilities(viewerRegistry(), {
      role: "viewer",
      surface: { type: "contact", entityId: "c1", entityName: "Jane Doe" },
    });
    expect(res.surfacePromptAddendum).toContain("Jane Doe");
    expect(res.surfacePromptAddendum).toContain("Read-Only Access");
  });
});
