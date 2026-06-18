/**
 * Per-turn capability resolver for the chat tool registry.
 *
 * Filters buildAllChatTools(ctx) down to the subset allowed by
 * (role, surface, feature flags, destructive-gating). Produces a
 * prompt addendum that seeds the LLM with surface context (which
 * entity the user is viewing, what tools are priority given that
 * surface).
 *
 * Reference: _specs/CHAT-00-coverage-audit/design.md §Taxonomy +
 * _specs/CHAT-01-tool-registry/design.md §Contract between tools.
 * This is the CHAT-02 deliverable from feature_list.json.
 */

import { getToolGroup } from "@/lib/chat/tool-router";
import { capabilityForTool, hasPermission } from "@/lib/auth/permissions";

/**
 * Tools that required role === "admin" BEFORE CLE-12.
 *
 * As of CLE-12 the admin-only verdict is DERIVED from the matrix
 * (`toolAdminOnly` below) — `permissions.ts` is the source of truth, not this
 * Set. The Set is retained ONLY as the expected-value fixture for the keystone
 * parity test (capability-resolver.parity.test.ts), which asserts the derived
 * verdict reproduces this list for every tool (with the single declared
 * INTENTIONAL_DELTA: deleteKnowledgeEntry, now knowledge:write -> admin-only).
 * Do not add new entries here; map the tool in TOOL_CAPABILITY instead.
 */
export const ADMIN_ONLY_TOOLS = new Set<string>([
  // Workspace config
  "updateICP",
  "updateWorkspace",
  "updatePrivacySettings",
  "updatePipelineStages",
  "updateCustomFieldSchema",
  "updateCustomSignalDefinitions",
  "updateWorkflows",
  "updateMailCalendarIntegration",
  // Knowledge base
  "createKnowledgeEntry",
  "updateKnowledgeEntry",
  // Members
  "inviteMember",
  "resendInvite",
  "updateMemberRole",
  // Custom objects
  "createCustomObjectType",
  "updateCustomObjectType",
]);

/**
 * Destructive tools are gated until CHAT-04 (toolCallEvents + undo)
 * ships. Registry may define them (for readiness) but they stay
 * unreachable to the LLM until the destructive-ops flag flips.
 */
export const DESTRUCTIVE_TOOLS = new Set<string>([
  "mergeContacts",
  "deleteSequenceStep",
  "deleteKnowledgeEntry",
  "deleteCustomObjectType",
  "deleteCustomRecord",
  "deleteSavedView",
  "deleteComment",
  "removeMailbox",
  "revokeInvite",
  "deleteContact",
  "deleteAccount",
  "deleteDeal",
]);

/** Surface context that seeds prompt + tool priority. */
export interface SurfaceContext {
  /**
   * What kind of page or channel opened this chat session.
   * - global        : no entity, workspace-wide chat (e.g. /chat page)
   * - contact       : opened from a contact detail page
   * - account       : opened from a company/account detail page
   * - deal          : opened from a deal/opportunity detail page
   * - meeting       : opened from a meeting detail page
   * - list          : opened from a list view (resource in listResource)
   * - slack         : Slack integration
   * - mcp           : external MCP client (ChatGPT/Claude.ai/Cursor/etc.)
   */
  type: "global" | "contact" | "account" | "deal" | "meeting" | "list" | "slack" | "mcp";
  entityId?: string;
  entityName?: string;
  listResource?: string;
}

export interface ResolveInput {
  role: string;
  surface?: SurfaceContext;
  /**
   * Workspace plan tier. Gates premium tools. 'pro' unlocks long-running
   * agents + high-volume bulk ops. Default: 'free'.
   */
  planTier?: "free" | "pro" | "enterprise";
  /**
   * Destructive-op guard. True once CHAT-04 ships undo support.
   * Default false — destructive tools stay hidden even if role/plan
   * would otherwise allow.
   */
  allowDestructive?: boolean;
  /** Arbitrary feature flags (experimentation). */
  featureFlags?: Record<string, boolean>;
}

export interface ResolveOutput<T> {
  /** The filtered tool registry, same shape as input. */
  tools: Record<string, T>;
  /** Prompt addendum to append to the system prompt for surface seeding. */
  surfacePromptAddendum: string;
  /** Names of tools dropped with per-tool reason, for telemetry / debugging. */
  droppedTools: Array<{ name: string; reason: string }>;
  /** Surface descriptor echoed back for telemetry. */
  surface: SurfaceContext;
}

/**
 * Default premium tools gated behind plan tier 'pro' or above. These
 * are recognizable long-running / high-cost operations.
 */
const PRO_TIER_TOOLS = new Set<string>([
  "buildTAM",
  "findLeadsByDomain",
  "researchCompetitor",
  "runSequenceAutopilot",
  "launchCampaign",
]);

/**
 * Tool groups a viewer (read-only role) may use. Group taxonomy comes
 * from the tool-router so there is a single source of truth. Skills are
 * excluded (many spend enrichment credits), memory is excluded (mixed
 * read/write), intelligence is excluded v1 (generateMeetingPrep and
 * executeCode are not provably read-only).
 */
export const VIEWER_ALLOWED_GROUPS = new Set<string>([
  "query",
  "briefing",
  "coaching",
  "schema",
]);

/**
 * Write/outbound tools that live inside otherwise-allowed groups.
 * composeEmail opens the outbound composer; deleteSharedPrompt mutates.
 */
export const VIEWER_DENIED_TOOLS = new Set<string>([
  "composeEmail",
  "deleteSharedPrompt",
]);

/**
 * Tools reachable by viewers even though their group is NOT in
 * VIEWER_ALLOWED_GROUPS, because per-action gating happens downstream.
 * invokePageAction is the gateway to page actions; it refuses mutating/outbound
 * actions for viewers INSIDE the tool via decideAction (CLE-04), so a viewer can
 * still drive read-only page actions (applyFilter, toggleView) and gets a correct
 * per-action reason rather than a blanket "no tools". CLE-12 generalizes this.
 */
export const VIEWER_GATEWAY_TOOLS = new Set<string>([
  "invokePageAction",
]);

/**
 * LEGACY viewer allowlist (pre-CLE-12): a tool must belong to an allowed group
 * AND not be denied by name. Retained ONLY as the parity-test fixture — the
 * live verdict is `toolViewerAllowed` below, derived from the matrix.
 */
export function legacyIsViewerAllowed(name: string): boolean {
  if (VIEWER_DENIED_TOOLS.has(name)) return false;
  if (VIEWER_GATEWAY_TOOLS.has(name)) return true; // CLE-04 — gateway, gated per-action by decideAction
  const group = getToolGroup(name);
  return !!group && VIEWER_ALLOWED_GROUPS.has(group);
}

/**
 * CLE-12 — admin-only verdict DERIVED from the matrix: a tool is admin-only iff
 * the role policy reserves its capability to admin (member lacks it, admin has
 * it). No capability mapping -> not admin-only (read/compute or member-write).
 */
export function toolAdminOnly(name: string): boolean {
  const cap = capabilityForTool(name);
  return !!cap && hasPermission("admin", cap) && !hasPermission("member", cap);
}

/**
 * CLE-12 — viewer verdict DERIVED from the matrix, preserving the two legacy
 * carve-outs: the CLE-04 gateway tool stays reachable, and an UNMAPPED read
 * tool stays viewer-OK via the same group fallback VIEWER_ALLOWED_GROUPS used.
 * A mapped tool's verdict is the matrix's: viewers hold only read capabilities,
 * so any tool mapped to a write/outbound/delete capability is dropped.
 */
export function toolViewerAllowed(name: string): boolean {
  if (VIEWER_GATEWAY_TOOLS.has(name)) return true; // CLE-04 — gated per-action by decideAction
  const cap = capabilityForTool(name);
  if (cap) return hasPermission("viewer", cap); // matrix verdict
  // No mapped capability -> treat as read/compute; keep the group fallback so
  // an unmapped read tool stays viewer-OK exactly as VIEWER_ALLOWED_GROUPS did.
  const group = getToolGroup(name);
  return !!group && VIEWER_ALLOWED_GROUPS.has(group);
}

/**
 * Back-compat export: the live viewer verdict. Existing callers/tests that
 * import `isViewerAllowedTool` keep working and now read the matrix-derived
 * verdict (CLE-12).
 */
export function isViewerAllowedTool(name: string): boolean {
  return toolViewerAllowed(name);
}

const VIEWER_PROMPT_ADDENDUM =
  "\n\n## Read-Only Access\nThis user has the Viewer role: they can read everything (pipeline, records, reports, briefs) but cannot create, update, delete, send, enroll, enrich, or configure anything. If they ask for a change or an outbound action, explain that their Viewer role is read-only and that a workspace member or admin has to do it — then offer the closest read-only help (e.g. a brief, a report, or navigating to the record).";

/**
 * Resolve the capability subset for this turn.
 *
 * Non-destructive: this function is a pure filter on the registry
 * passed in; it doesn't execute any tool. Cheap to run on every turn.
 */
export function resolveCapabilities<T>(
  allTools: Record<string, T>,
  input: ResolveInput
): ResolveOutput<T> {
  const surface: SurfaceContext = input.surface || { type: "global" };
  const isAdmin = input.role === "admin";
  const isViewer = input.role === "viewer";
  const allowDestructive = input.allowDestructive === true;
  const planTier = input.planTier || "free";

  const filtered: Record<string, T> = {};
  const dropped: Array<{ name: string; reason: string }> = [];

  for (const [name, tool] of Object.entries(allTools)) {
    // Viewer first: read-only allowlist beats every other rule (matrix-derived).
    if (isViewer && !toolViewerAllowed(name)) {
      dropped.push({ name, reason: "viewer:read-only" });
      continue;
    }
    // Admin-only verdict DERIVED from the matrix (CLE-12), not the legacy Set.
    if (toolAdminOnly(name) && !isAdmin) {
      dropped.push({ name, reason: "admin-only" });
      continue;
    }
    if (DESTRUCTIVE_TOOLS.has(name) && !allowDestructive) {
      dropped.push({ name, reason: "destructive-gated" });
      continue;
    }
    if (PRO_TIER_TOOLS.has(name) && planTier === "free") {
      dropped.push({ name, reason: "plan-gated:pro-required" });
      continue;
    }
    // Surface-specific exclusions: Slack is read-only write-restricted
    // until CHAT-08 ships the interactive-approval layer. Mark all
    // mutation-side tools as dropped when surface=slack for safety.
    if (surface.type === "slack" && isMutationTool(name)) {
      dropped.push({ name, reason: "slack:write-ops-deferred-to-CHAT-08" });
      continue;
    }
    filtered[name] = tool;
  }

  return {
    tools: filtered,
    surfacePromptAddendum:
      buildSurfacePromptAddendum(surface) +
      (isViewer ? VIEWER_PROMPT_ADDENDUM : ""),
    droppedTools: dropped,
    surface,
  };
}

/**
 * Heuristic: a tool is a "mutation" if its name prefix is create/
 * update/upsert/bulk/add/remove/send/log/enroll/book/launch/invite/
 * resend/toggle. Matches the taxonomy in design.md.
 */
function isMutationTool(name: string): boolean {
  return /^(create|update|upsert|bulk|add|remove|delete|merge|send|log|enroll|book|launch|invite|resend|toggle|set|run|execute)/i.test(
    name
  );
}

function buildSurfacePromptAddendum(surface: SurfaceContext): string {
  switch (surface.type) {
    case "global":
      return "";
    case "contact":
      return `\n\n## Active Surface: Contact\nThe user is currently viewing a specific contact${
        surface.entityName ? ` ("${surface.entityName}")` : ""
      }${
        surface.entityId ? ` (id: ${surface.entityId})` : ""
      }. Prefer contact-scoped tools: updateContact, queryActivities with entityType="contact", createNote/logActivity on this contact, draftEmail/generateFollowUpEmail to this contact. When the user says "him/her/they/them", resolve to this contact.`;
    case "account":
      return `\n\n## Active Surface: Account\nThe user is currently viewing a specific account/company${
        surface.entityName ? ` ("${surface.entityName}")` : ""
      }${
        surface.entityId ? ` (id: ${surface.entityId})` : ""
      }. Prefer account-scoped tools: updateAccount, getAccountIntelligence, generateMeetingPrep with accountId, updateAccountLifecycle, queryActivities with entityType="company" and entityId=<this account>, createNote on this account. When the user says "this company/them", resolve to this account.`;
    case "deal":
      return `\n\n## Active Surface: Deal\nThe user is currently viewing a specific deal/opportunity${
        surface.entityName ? ` ("${surface.entityName}")` : ""
      }${
        surface.entityId ? ` (id: ${surface.entityId})` : ""
      }. Prefer deal-scoped tools: updateDeal (supersedes updateDealStage), getDealCoaching, autoProgressDeal, queryActivities with entityType="deal", createNote on this deal. When the user says "this deal/it", resolve to this deal.`;
    case "meeting":
      return `\n\n## Active Surface: Meeting\nThe user is currently viewing a specific meeting${
        surface.entityId ? ` (id: ${surface.entityId})` : ""
      }. Prefer meeting-scoped tools: getCallRecording, updateMeetingNotes, sendMeetingFollowUp. When the user says "this meeting/call", resolve to this meeting.`;
    case "list":
      return `\n\n## Active Surface: List View\nThe user is currently viewing a list of ${surface.listResource || "records"}. Prefer bulk and filter tools: bulkUpdateContacts, bulkUpdateDeals, createSavedView, runBasicReport scoped to ${
        surface.listResource || "the current resource"
      }.`;
    case "slack":
      return `\n\n## Active Surface: Slack\nThis session is running in a Slack channel or DM. Keep answers concise (Slack formatting). Write operations are temporarily disabled on Slack (pending CHAT-08 interactive-approval support) — if the user asks to create/update/send, explain that they need to open the LeadSens app or ⌘K to confirm.`;
    case "mcp":
      return `\n\n## Active Surface: External MCP Client\nThis session is coming from an external MCP client (Claude Desktop / ChatGPT / Cursor). Respect the client's UX — minimize large tool payloads, prefer paginated reads, always include entity ids so the client can link back.`;
  }
}
