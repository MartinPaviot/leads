/**
 * Unified permission matrix — the ONE source of truth for role x capability.
 *
 * CLE-12: this module is the single matrix that the three enforcement points
 * (middleware route gating, the chat capability-resolver, and invokePageAction)
 * all READ from instead of each authoring its own role policy. The capability
 * enum is a coarse, role-meaningful vocabulary; `path x method` and `tool name`
 * are DERIVATIONS onto that enum (capabilityForRoute / capabilityForTool /
 * capabilityForPageAction). One vocabulary, three readers, one shared request
 * guard, and a default posture so a new route is covered the day it ships.
 *
 * Pure module on purpose: the only type import is AuthContext (compile-time
 * only), so the matrix can be consulted from the Edge middleware and from a
 * unit test alike. No runtime imports.
 *
 * History: this began as the granular admin/member/viewer permission map
 * consumed only by `requirePermission` on ~59 routes. CLE-12 extends the enum
 * into a superset (every old `requirePermission(role, "<old>")` still compiles
 * and means the same thing) and adds the route/tool/page-action derivations.
 */

import type { AuthContext } from "@/lib/auth/auth-utils";

// ── Capability enum: the SSOT axis. Coarse, role-meaningful verbs on resources.
//    Superset of the pre-CLE-12 Permission union (every existing
//    requirePermission(role, "<old>") keeps its meaning). ──
export type Capability =
  // CRM read/write/delete
  | "contacts:read"
  | "contacts:write"
  | "contacts:delete"
  | "accounts:write" // account create/update (was implicitly member)
  | "companies:delete" // account/company hard paths
  | "deals:read"
  | "deals:write"
  | "deals:delete"
  // outbound + spend (split the "send" verb by who pays)
  | "outbound:send" // member: email / sequence send under own identity
  | "outbound:paid" // ADMIN: anything that spends money (paid send, buy number)
  | "enrichment:run" // member: spends credits (enrich / find-mobile)
  // sequences
  | "sequences:read"
  | "sequences:write"
  | "sequences:delete"
  | "sequences:execute"
  // workspace config
  | "settings:read"
  | "settings:write"
  | "workflows:manage" // admin: mirrors chat updateWorkflows admin-only
  | "knowledge:write" // admin: mirrors create/update/deleteKnowledgeEntry admin-only
  | "billing:manage"
  | "members:read"
  | "members:invite"
  | "members:manage"
  | "mcp:manage";

/**
 * Backwards-compat alias so no legacy call site churns this feature. The 15+
 * existing `requirePermission(role, "<old>")` sites keep compiling because the
 * old `Permission` union is a strict subset of `Capability`.
 */
export type Permission = Capability;

const ALL_CAPABILITIES: Capability[] = [
  "contacts:read",
  "contacts:write",
  "contacts:delete",
  "accounts:write",
  "companies:delete",
  "deals:read",
  "deals:write",
  "deals:delete",
  "outbound:send",
  "outbound:paid",
  "enrichment:run",
  "sequences:read",
  "sequences:write",
  "sequences:delete",
  "sequences:execute",
  "settings:read",
  "settings:write",
  "workflows:manage",
  "knowledge:write",
  "billing:manage",
  "members:read",
  "members:invite",
  "members:manage",
  "mcp:manage",
];

export const ROLE_PERMISSIONS: Record<string, Capability[]> = {
  admin: [...ALL_CAPABILITIES],
  // Members are sellers: full CRM read/write incl. soft-deletes (recoverable
  // since the delete/restore-coherence work), running their OWN outbound
  // (sequences:execute + outbound:send — sending identity stays per-owner),
  // and spending enrichment credits. Admin keeps exclusivity on settings:write,
  // billing, members invite/manage, mcp, workflows, knowledge, and anything
  // that spends real money (outbound:paid).
  member: [
    "contacts:read",
    "contacts:write",
    "contacts:delete",
    "accounts:write",
    "companies:delete",
    "deals:read",
    "deals:write",
    "deals:delete",
    "outbound:send",
    "enrichment:run",
    "sequences:read",
    "sequences:write",
    "sequences:delete",
    "sequences:execute",
    "settings:read",
    "members:read",
    // NOT granted: outbound:paid, settings:write, workflows:manage,
    // knowledge:write, billing:manage, members:invite, members:manage,
    // mcp:manage
  ],
  // Viewers (advisors, investors, coaches) are read-only. Writes are also
  // blocked centrally in the middleware (lib/auth/viewer-guard.ts) and the
  // chat strips mutation tools (lib/agents/capability-resolver.ts).
  viewer: [
    "contacts:read",
    "deals:read",
    "sequences:read",
    "settings:read",
    "members:read",
  ],
};

/**
 * Check whether a role grants a specific capability. Unknown role -> false
 * (fail-closed; preserves the pre-CLE-12 behaviour).
 */
export function hasPermission(role: string, capability: Capability): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  return allowed.includes(capability);
}

/**
 * Assert that a role grants a specific capability.
 * Returns a 403 Response if denied, or `null` if the check passes.
 *
 * Usage in route handlers:
 *
 *   const denied = requireCapability(authCtx.role, "contacts:delete");
 *   if (denied) return denied;
 */
export function requireCapability(
  role: string,
  capability: Capability,
): Response | null {
  if (hasPermission(role, capability)) return null;
  return Response.json(
    {
      error: {
        code: "FORBIDDEN",
        message: `Missing permission: ${capability}`,
        requiredPermission: capability,
        requiredCapability: capability,
        currentRole: role,
      },
    },
    { status: 403 },
  );
}

/**
 * Backwards-compat alias: `requirePermission` is the historical name used by
 * the ~59 routes already calling it. It is now `requireCapability` so the two
 * never diverge.
 */
export const requirePermission = requireCapability;

// ──────────────────────────────────────────────────────────────────────────
// Tool -> capability derivation (consumed by capability-resolver.ts).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Explicit map for the MUTATING / ADMIN / OUTBOUND / DELETE chat tools. Pure
 * read/compute tools have NO entry (capabilityForTool returns undefined) and
 * are viewer-allowed by the resolver's group fallback — exactly as the legacy
 * VIEWER_ALLOWED_GROUPS intent. The keystone parity test
 * (capability-resolver.parity.test.ts) asserts the derived admin-only/viewer
 * verdicts reproduce the legacy Sets for EVERY tool, so this map is provably
 * policy-preserving.
 */
export const TOOL_CAPABILITY: Record<string, Capability> = {
  // Workspace config -> settings:write (admin)
  updateICP: "settings:write",
  updateWorkspace: "settings:write",
  updatePrivacySettings: "settings:write",
  updatePipelineStages: "settings:write",
  updateCustomFieldSchema: "settings:write",
  updateCustomSignalDefinitions: "settings:write",
  updateMailCalendarIntegration: "settings:write",
  createCustomObjectType: "settings:write",
  updateCustomObjectType: "settings:write",
  // Workflows -> workflows:manage (admin)
  updateWorkflows: "workflows:manage",
  // Knowledge base -> knowledge:write (admin)
  createKnowledgeEntry: "knowledge:write",
  updateKnowledgeEntry: "knowledge:write",
  deleteKnowledgeEntry: "knowledge:write",
  // Members -> members:invite / members:manage (admin)
  inviteMember: "members:invite",
  resendInvite: "members:invite",
  updateMemberRole: "members:manage",
  // Outbound (member can send under own identity)
  composeEmail: "outbound:send",
  // Deletes / destructive role half (the allowDestructive FLAG is AND-ed
  // separately by the resolver; this is only the *role* half).
  deleteContact: "contacts:delete",
  mergeContacts: "contacts:delete",
  deleteAccount: "companies:delete",
  deleteDeal: "deals:delete",
  deleteSequenceStep: "sequences:delete",
  deleteSharedPrompt: "contacts:delete",
};

/**
 * The capability a chat tool requires, or undefined for pure read/compute
 * tools (which carry no static capability and are viewer-allowed via the
 * resolver's group fallback).
 */
export function capabilityForTool(name: string): Capability | undefined {
  return TOOL_CAPABILITY[name];
}

// ──────────────────────────────────────────────────────────────────────────
// Route (path x method) -> capability derivation (consumed by the middleware
// and the shared request guard).
// ──────────────────────────────────────────────────────────────────────────

type Method = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

interface RouteCapRule {
  /** Matched against the pathname with startsWith. */
  prefix: string;
  /** Capability for POST/PUT/PATCH (write default). */
  write?: Capability;
  /** Capability for DELETE (falls back to `write` when omitted). */
  del?: Capability;
}

/**
 * Prefix-and-method table. `capabilityForRoute` scans for the LONGEST matching
 * prefix so a more specific row (e.g. /api/settings/members) beats the
 * /api/settings catch-all. Order in this array is documentary, not semantic;
 * the longest-prefix rule decides.
 *
 * CONSERVATIVE: every admin-only row maps to a capability the member lacks
 * (settings:write / members:* / mcp:manage / workflows:manage / knowledge:write
 * / billing:manage / outbound:paid). Member-write rows map to capabilities the
 * member HAS, so they are not accidentally caught by the high-risk default-deny.
 */
const ROUTE_CAPABILITY_RULES: readonly RouteCapRule[] = [
  // ── ADMIN-ONLY surfaces (member must be rejected — the gap the middleware
  //    has today). ──
  { prefix: "/api/settings/members", write: "members:invite", del: "members:manage" },
  { prefix: "/api/settings/autonomy", write: "settings:write" },
  { prefix: "/api/settings/mail-calendar", write: "settings:write" },
  { prefix: "/api/settings/data-model", write: "settings:write" },
  { prefix: "/api/settings/custom-signals", write: "settings:write" },
  { prefix: "/api/settings/compliance", write: "settings:write" },
  { prefix: "/api/settings/icp", write: "settings:write" },
  { prefix: "/api/settings/knowledge", write: "knowledge:write" },
  { prefix: "/api/settings", write: "settings:write" }, // catch-all settings write = admin
  { prefix: "/api/mcp", write: "mcp:manage", del: "mcp:manage" },
  { prefix: "/api/billing", write: "billing:manage" },
  // belt-and-braces: /api/admin routes also call requireAdmin themselves.
  { prefix: "/api/admin", write: "settings:write", del: "settings:write" },
  { prefix: "/api/workflows", write: "workflows:manage", del: "workflows:manage" },
  // Workspace-wide GDPR data purge -> admin (destructive, whole-tenant scope).
  { prefix: "/api/gdpr", write: "settings:write", del: "settings:write" },
  // Spends money -> admin. Provisioning/releasing a Twilio number.
  { prefix: "/api/calls/numbers", write: "outbound:paid", del: "outbound:paid" },
  { prefix: "/api/calls/buy-number", write: "outbound:paid" },
  // ── MEMBER write surfaces (explicit so they are not accidentally
  //    default-deny under a high-risk prefix). ──
  { prefix: "/api/emails/send", write: "outbound:send" },
  // Connect/reconnect YOUR OWN LinkedIn seat = member self-serve (spend is gated
  // by the per-tenant seat cap, not the role). Explicit so it isn't caught by a
  // future high-risk default-deny; viewers (no outbound:send) still can't connect.
  // NOTE scoped to /connect only — the public Unipile webhooks under
  // /api/linkedin/unipile/* are token-verified and must NOT require a session.
  { prefix: "/api/linkedin/connect", write: "outbound:send" },
  { prefix: "/api/sequences", write: "sequences:write", del: "sequences:delete" },
  { prefix: "/api/meetings", write: "deals:write" }, // notes / follow-up = member
  { prefix: "/api/contacts", write: "contacts:write", del: "contacts:delete" },
  { prefix: "/api/accounts", write: "accounts:write", del: "companies:delete" },
  { prefix: "/api/opportunities", write: "deals:write", del: "deals:delete" },
  { prefix: "/api/deals", write: "deals:write", del: "deals:delete" },
  { prefix: "/api/score-contacts", write: "contacts:write" },
  { prefix: "/api/enrich", write: "enrichment:run" },
];

/**
 * High-risk path prefixes that DEFAULT to deny (require an admin capability)
 * even when no explicit rule matches — so a NEW settings/admin/billing/mcp/
 * workflows route is admin-gated the moment it ships, before anyone adds a row.
 * The broad CRM surface defaults to member-open (undefined) instead, matching
 * the pre-CLE-12 posture (the viewer floor still blocks every viewer write).
 */
const HIGH_RISK_DEFAULT_DENY: ReadonlyArray<[string, Capability]> = [
  ["/api/settings", "settings:write"],
  ["/api/admin", "settings:write"],
  ["/api/billing", "billing:manage"],
  ["/api/mcp", "mcp:manage"],
  ["/api/workflows", "workflows:manage"],
];

/**
 * Resolve an UNMAPPED write route:
 *  - high-risk prefix  -> returns a capability (default-deny: member 403, admin pass)
 *  - everything else   -> undefined (default-member: member passes, viewer
 *                         already blocked by the middleware viewer floor)
 */
function defaultPosture(pathname: string): Capability | undefined {
  for (const [prefix, cap] of HIGH_RISK_DEFAULT_DENY) {
    if (pathname.startsWith(prefix)) return cap;
  }
  return undefined;
}

/**
 * The capability a request requires, or undefined when the gate should pass it
 * through (SAFE method, or an unmapped non-high-risk write under the
 * default-member posture). Longest-prefix-wins; DELETE uses `del ?? write`.
 */
export function capabilityForRoute(
  pathname: string,
  method: string,
): Capability | undefined {
  const m = method.toUpperCase() as Method;
  if (SAFE_METHODS.has(m)) return undefined; // reads are never gated here (EC-6)

  let best: RouteCapRule | undefined;
  for (const rule of ROUTE_CAPABILITY_RULES) {
    if (
      pathname.startsWith(rule.prefix) &&
      (!best || rule.prefix.length > best.prefix.length)
    ) {
      best = rule;
    }
  }
  if (best) return m === "DELETE" ? best.del ?? best.write : best.write;
  return defaultPosture(pathname); // default-member (undefined) or default-deny
}

/**
 * The ONE write-route guard. Resolves the capability for this request's
 * path x method from the SAME map the middleware uses (capabilityForRoute),
 * then checks it against the caller's FRESH DB role (authCtx.role — overlaid in
 * auth-utils, NOT the possibly-stale JWT). Returns a 403 Response to reject, or
 * null to proceed. One call replaces bespoke requireAdmin / requirePermission
 * lines and CANNOT drift from the middleware verdict, because both read
 * capabilityForRoute.
 *
 * Fail-closed: unmapped path under a high-risk prefix -> deny; unknown role ->
 * deny (hasPermission false). default-member prefix + unmapped -> null (the
 * viewer floor in middleware already handled viewers; members proceed).
 */
export function requireCapabilityForRequest(
  authCtx: Pick<AuthContext, "role">,
  req: { method: string; nextUrl?: { pathname: string }; url?: string },
): Response | null {
  const pathname =
    req.nextUrl?.pathname ?? new URL(req.url ?? "http://localhost").pathname;
  const cap = capabilityForRoute(pathname, req.method);
  if (!cap) return null; // SAFE method or default-member unmapped
  return requireCapability(authCtx.role, cap);
}

// ──────────────────────────────────────────────────────────────────────────
// Page-action (manifest metadata) -> capability derivation (consumed by
// invokePageAction, alongside decideAction's approval verdict).
// ──────────────────────────────────────────────────────────────────────────

/** Manifest metadata subset needed to derive a page action's capability. */
export interface PageActionCapInput {
  id: string;
  mutating: boolean;
  outbound?: boolean;
  cost?: "free" | "credits" | "money";
  reversible?: boolean;
}

/** Map a namespaced page-action id (`<surface>.<verb>`) to its CRM resource. */
function namespaceWriteCapability(id: string): Capability {
  if (id.startsWith("contacts.")) return "contacts:write";
  if (id.startsWith("accounts.") || id.startsWith("companies.")) return "accounts:write";
  if (id.startsWith("opportunities.") || id.startsWith("deals.")) return "deals:write";
  if (id.startsWith("sequences.")) return "sequences:write";
  // Unknown namespace -> the safest CRM write capability the matrix still
  // gates a viewer out of (members hold it; viewers do not). Fail-closed
  // toward "needs a member", never toward "anyone".
  return "contacts:write";
}

/** Map a namespaced page-action id to its `*:delete` family capability. */
function namespaceDeleteCapability(id: string): Capability {
  if (id.startsWith("contacts.")) return "contacts:delete";
  if (id.startsWith("accounts.") || id.startsWith("companies.")) return "companies:delete";
  if (id.startsWith("opportunities.") || id.startsWith("deals.")) return "deals:delete";
  if (id.startsWith("sequences.")) return "sequences:delete";
  return "contacts:delete";
}

/**
 * The capability a page action requires, or undefined for a pure-read action
 * (which is reachable; decideAction then decides whether it executes — CLE-04
 * gateway behaviour preserved).
 *
 * Precedence (most restrictive first): cost:money -> outbound:paid (admin);
 * outbound -> outbound:send (member); mutating && reversible===false -> the
 * `*:delete` family by namespace; mutating (generic) -> `*:write` by namespace;
 * pure read -> undefined.
 */
export function capabilityForPageAction(
  entry: PageActionCapInput,
): Capability | undefined {
  if (entry.cost === "money") return "outbound:paid";
  if (entry.outbound === true) return "outbound:send";
  if (!entry.mutating) return undefined;
  if (entry.reversible === false) return namespaceDeleteCapability(entry.id);
  return namespaceWriteCapability(entry.id);
}
