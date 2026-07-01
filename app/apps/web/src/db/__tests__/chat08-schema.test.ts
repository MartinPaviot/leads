import { describe, it, expect } from "vitest";
import { slackInstallations, pendingSlackApprovals } from "@/db/schema/slack";
import { agentTraces } from "@/db/schema/intelligence";

/**
 * CHAT-08 Part A schema (slack_installations, pending_slack_approvals) +
 * the agentTraces surface-attribution columns. Matching idempotent SQL is
 * drizzle/0109_chat08_slack_and_mcp_traces.sql.
 */
describe("CHAT-08 schema — new tables + columns", () => {
  it("slack_installations: key columns present", () => {
    expect(slackInstallations.id).toBeDefined();
    expect(slackInstallations.tenantId).toBeDefined();
    expect(slackInstallations.slackTeamId).toBeDefined();
    expect(slackInstallations.botTokenEncrypted).toBeDefined();
    expect(slackInstallations.installedByUserId).toBeDefined();
    expect(slackInstallations.status).toBeDefined();
  });

  it("pending_slack_approvals: key columns present", () => {
    expect(pendingSlackApprovals.id).toBeDefined();
    expect(pendingSlackApprovals.tenantId).toBeDefined();
    expect(pendingSlackApprovals.toolName).toBeDefined();
    expect(pendingSlackApprovals.args).toBeDefined();
    expect(pendingSlackApprovals.slackChannelId).toBeDefined();
    expect(pendingSlackApprovals.slackMessageTs).toBeDefined();
    expect(pendingSlackApprovals.status).toBeDefined();
    expect(pendingSlackApprovals.expiresAt).toBeDefined();
  });

  it("agent_traces: surface_type + mcp_client columns present (fixes a pre-existing gap — see design.md)", () => {
    expect(agentTraces.surfaceType).toBeDefined();
    expect(agentTraces.mcpClient).toBeDefined();
  });
});
