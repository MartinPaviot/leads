# CLE-12 — Unified permission matrix — Design

> Constitution: `_specs/chat-live-executor/README.md` (§4.5 "Une matrice de permissions partagée par
> middleware + capability-resolver + PAR"). Builds on **CLE-04**
> (`_specs/CLE-04-page-action-tools/design.md` §2.7 `VIEWER_GATEWAY_TOOLS`) and **CLE-10**
> (`_specs/CLE-10-unified-approval-plane/design.md` §2.1 viewer floor; §10 "the full role × action
> matrix is CLE-12"). No frozen README contract is redefined: CLE-12 adds a permission axis that sits
> *beside* `decideAction`'s approval axis; the `decideAction` signature (README §3.5bis) is untouched.

CLE-12 makes `lib/auth/permissions.ts` the one matrix, and turns the three enforcement points from
**authors** of role policy into **consumers** of it. The result: one place to read role × capability,
three derivations onto it, one shared request guard, and a default posture so a new route is covered the
day it ships.

---

## 1. System fit (file:line — three authors today → one SSOT + three readers)

| Enforcement point | Today (author of its own policy) | After CLE-12 (reader of the matrix) |
|---|---|---|
| **Matrix** | `permissions.ts:9-25` `Permission` union; `:46-74` `ROLE_PERMISSIONS`; `:79-83` `hasPermission`; `:94-110` `requirePermission`. Consumed by only **15** routes. | **Extended** capability enum (§2) + same `ROLE_PERMISSIONS` shape. New pure helpers: `requireCapability(role, cap)` (rename-compatible superset of `requirePermission`), `capabilityForRoute(path, method)`, `capabilityForTool(toolName)`. Still pure, zero imports beyond types. |
| **Middleware** | `middleware.ts:147-163` — viewer floor only (`isViewerWriteBlocked`, `viewer-guard.ts:37-46`); **no admin/member distinction** (audit §6). | Viewer floor **unchanged** (runs first). **+** one new derived check: `capabilityForRoute(path, method)` → if the **JWT role** lacks it, 403. No per-route boilerplate — one map lookup (§4, §5.2). |
| **Capability-resolver** | `capability-resolver.ts` — 5 hand-listed Sets: `ADMIN_ONLY_TOOLS` (`:18-38`), `DESTRUCTIVE_TOOLS` (`:45-58`), `PRO_TIER_TOOLS` (`:112-118`), `VIEWER_ALLOWED_GROUPS` (`:127-132`), `VIEWER_DENIED_TOOLS` (`:138-141`) + CLE-04's `VIEWER_GATEWAY_TOOLS`. `isViewerAllowedTool` (`:149-153`), `resolveCapabilities` (`:164-213`). | Admin-only + viewer verdicts **derived** from `capabilityForTool(name)` checked against `ROLE_PERMISSIONS` (§3.3). The Sets become a **thin generated/asserted artifact** (kept for the parity test, §7), not the source of truth. `PRO_TIER_TOOLS` + `allowDestructive` flag gates **retained** as-is (orthogonal axes, §3.3). CLE-04's gateway exception expressed *in the matrix derivation* (AC-9). |
| **PAR (`invokePageAction`)** | CLE-04 `page-actions.ts` — reachable by all roles (gateway, §2.7); only `decideAction` gates per-action (viewer + mutating → refuse, CLE-10 §2.1). | **+** a static capability gate **before** `decideAction`: `capabilityForPageAction(entry)` → `requireCapability(role, cap)`; refuse below-capability (§3.4). Permission-first, then approval. |
| **Route handlers** | 59/346 call `requireAdmin` / `requirePermission` ad hoc. | **+** shared `requireCapabilityForRequest(authCtx, req)` (§3.5) — one call, reads the **fresh DB role**, same map as the middleware. Applied to the highest-risk routes now; default posture covers the rest (§5). |

CLE-12 stops at: the enum is extended, the three maps/derivations exist and are tested for parity, the
shared helper exists and is applied to the high-risk write routes, the middleware enforces admin/member
from the map, `invokePageAction` consults the matrix before `decideAction`, and the default posture +
checklist are in place. It does **not** rip-and-replace the 59 existing checks, flip `allowDestructive`,
or touch tenant isolation.

---

## 2. The unified matrix shape (`permissions.ts`)

The capability enum **extends** the existing `Permission` union (superset → every current call still
compiles). `ROLE_PERMISSIONS` keeps its exact shape (`Record<string, Capability[]>`).

```ts
// ── Capability enum: the SSOT axis. Coarse, role-meaningful verbs on resources.
//    Superset of the pre-CLE-12 Permission union (permissions.ts:9-25) — every
//    existing requirePermission(role, "<old>") keeps its meaning. ──
export type Capability =
  // CRM read/write/delete (existing)
  | "contacts:read" | "contacts:write" | "contacts:delete"
  | "accounts:write"            // NEW — account create/update (was implicit member)
  | "companies:delete"          // existing (account/company hard paths)
  | "deals:read" | "deals:write" | "deals:delete"
  // outbound + spend (NEW — split the "send" verb by who pays)
  | "outbound:send"             // member: email / sequence send under own identity
  | "outbound:paid"             // ADMIN: anything that spends money (paid send, buy number)
  | "enrichment:run"            // member: spends credits (enrich / find-mobile)
  // sequences (existing)
  | "sequences:read" | "sequences:write" | "sequences:execute"
  // workspace config (existing + NEW)
  | "settings:read" | "settings:write"
  | "workflows:manage"          // NEW (admin) — mirrors chat updateWorkflows admin-only
  | "knowledge:write"           // NEW (admin) — mirrors create/updateKnowledgeEntry admin-only
  | "billing:manage"
  | "members:read"              // NEW
  | "members:invite" | "members:manage"
  | "mcp:manage";

// Backwards-compat alias so no call site churns this feature.
export type Permission = Capability;

const ALL_CAPABILITIES: Capability[] = [ /* every member above */ ];

export const ROLE_PERMISSIONS: Record<string, Capability[]> = {
  admin: [...ALL_CAPABILITIES],
  member: [
    "contacts:read", "contacts:write", "contacts:delete",
    "accounts:write", "companies:delete",
    "deals:read", "deals:write", "deals:delete",
    "outbound:send", "enrichment:run",
    "sequences:read", "sequences:write", "sequences:execute",
    "settings:read", "members:read",
    // NOT granted: outbound:paid, settings:write, workflows:manage,
    // knowledge:write, billing:manage, members:invite, members:manage, mcp:manage
  ],
  viewer: [
    "contacts:read", "deals:read", "sequences:read", "settings:read", "members:read",
  ],
};

// hasPermission unchanged in spirit (permissions.ts:79-83): unknown role → false.
export function hasPermission(role: string, cap: Capability): boolean {
  return ROLE_PERMISSIONS[role]?.includes(cap) ?? false;
}

// requireCapability = the existing requirePermission (permissions.ts:94-110),
// renamed; `requirePermission` is re-exported as an alias so the 15 call sites
// and any future caller keep compiling.
export function requireCapability(role: string, cap: Capability): Response | null { /* as :94-110 */ }
export const requirePermission = requireCapability;
```

**Why a coarse enum (not one capability per route or per tool).** A route map of 346 entries and a tool
map of 158 entries would *re-create* the drift problem at a finer grain. The enum is the small, stable
vocabulary both maps point at; adding a route or a tool means assigning it to an existing capability,
not inventing a new permission. This is the same "declare onto a stable surface" inversion the whole CLE
initiative is built on (README §1.1).

**Member granted `outbound:send` but not `outbound:paid`.** This is the load-bearing new split: a member
can send under their own identity (`sequences:execute` already implied this, `permissions.ts:52-64`
comment) but cannot spend money (buy a Twilio number, trigger a paid send). It mirrors `decideAction`'s
`cost:"money"` → always-confirm floor (CLE-10 §2.1 arm 1) on the *permission* axis: members are
*refused* paid actions outright, admins get them (still confirmed by `decideAction`). The two axes
agree in direction; CLE-12 makes the permission half explicit.

---

## 3. How each enforcement point consumes the matrix

### 3.1 Middleware (viewer floor unchanged; admin/member derived)

`middleware.ts:147-163` keeps the viewer block **first and byte-identical**, then adds the derived
admin/member gate using the **JWT role** (no DB read on the edge path — AC-6, EC-1):

```ts
// (after the viewer gate at :152-163, before `return NextResponse.next()` at :165)
// Admin/member gate, derived from the matrix (CLE-12). JWT role only — the API
// layer re-checks with the fresh DB role via requireCapabilityForRequest (EC-1).
const cap = capabilityForRoute(pathname, req.method); // §4 — undefined if unmapped+default-member
if (cap && !hasPermission(sessionRole ?? "member", cap)) {
  return NextResponse.json(
    { error: { code: "FORBIDDEN", message: `Missing capability: ${cap}`,
               requiredCapability: cap, currentRole: sessionRole ?? null } },
    { status: 403 },
  );
}
```

`capabilityForRoute` returns `undefined` for SAFE_METHOD requests and for unmapped paths under the
`default-member` posture (so members pass, the viewer floor already handled viewers); it returns a
capability for mapped writes and for unmapped writes under a `default-deny` prefix (§4, §5.1). The gate
runs **only** in the authenticated, non-public region (after `isPublic` `:132` and `!req.auth?.user`
`:143`), so Twilio/Inngest/webhooks (EC-5) are never gated.

### 3.2 `requireCapabilityForRequest` (the shared route guard) — §3.5

### 3.3 Capability-resolver: derive admin-only/viewer from the matrix

**Before** (`capability-resolver.ts:149-153`, `:177-213` — the Sets are the source of truth):
```ts
export function isViewerAllowedTool(name: string): boolean {
  if (VIEWER_DENIED_TOOLS.has(name)) return false;
  if (VIEWER_GATEWAY_TOOLS.has(name)) return true;       // CLE-04
  const group = getToolGroup(name);
  return !!group && VIEWER_ALLOWED_GROUPS.has(group);
}
// resolveCapabilities loop:
if (isViewer && !isViewerAllowedTool(name)) { drop("viewer:read-only"); continue; }
if (ADMIN_ONLY_TOOLS.has(name) && !isAdmin) { drop("admin-only"); continue; }
if (DESTRUCTIVE_TOOLS.has(name) && !allowDestructive) { drop("destructive-gated"); continue; }
if (PRO_TIER_TOOLS.has(name) && planTier === "free") { drop("plan-gated"); continue; }
```

**After** — one tool→capability map drives the role decisions; `allowDestructive` and `PRO_TIER_TOOLS`
stay as orthogonal flag gates (they are *not* role policy):
```ts
// lib/auth/permissions.ts — the tool→capability derivation (pure).
// READ-class tools (no entry) → no static capability → viewer-allowed by default,
// which preserves the "query/briefing/coaching/schema groups are viewer-OK" intent
// once cross-checked with the group (kept as the fallback, below).
export function capabilityForTool(name: string): Capability | undefined {
  return TOOL_CAPABILITY[name]; // explicit map for mutating/admin/outbound tools
}

// capability-resolver.ts — verdicts DERIVED, not hand-listed.
function toolAdminOnly(name: string): boolean {
  const cap = capabilityForTool(name);
  // admin-only iff some role policy reserves the cap to admin: member lacks it but admin has it.
  return !!cap && hasPermission("admin", cap) && !hasPermission("member", cap);
}
function toolViewerAllowed(name: string): boolean {
  if (VIEWER_GATEWAY_TOOLS.has(name)) return true;          // CLE-04 exception, expressed here (AC-9)
  const cap = capabilityForTool(name);
  if (cap) return hasPermission("viewer", cap);             // matrix verdict
  // No mapped capability → treat as read/compute; keep the group fallback so an
  // unmapped read tool stays viewer-OK exactly as VIEWER_ALLOWED_GROUPS did.
  const group = getToolGroup(name);
  return !!group && VIEWER_ALLOWED_GROUPS.has(group);
}

// resolveCapabilities loop (role half derived; flag gates unchanged):
if (isViewer && !toolViewerAllowed(name)) { drop("viewer:read-only"); continue; }
if (toolAdminOnly(name) && !isAdmin)      { drop("admin-only"); continue; }
if (DESTRUCTIVE_TOOLS.has(name) && !allowDestructive) { drop("destructive-gated"); continue; }
if (PRO_TIER_TOOLS.has(name) && planTier === "free")  { drop("plan-gated:pro-required"); continue; }
```

`TOOL_CAPABILITY` (in `permissions.ts`) maps the **mutating/admin/outbound** tools to capabilities —
e.g. `updateICP`/`updateWorkspace`/`updatePipelineStages`/`updateWorkflows` → `workflows:manage` or
`settings:write`; `createKnowledgeEntry`/`updateKnowledgeEntry`/`deleteKnowledgeEntry` →
`knowledge:write`; `inviteMember`/`resendInvite` → `members:invite`; `updateMemberRole` →
`members:manage`; `createCustomObjectType`/`updateCustomObjectType` → `settings:write`;
`deleteContact`→`contacts:delete`; `deleteAccount`→`companies:delete`; `deleteDeal`→`deals:delete`;
`composeEmail`→`outbound:send`; `mergeContacts`→`contacts:delete`. The **parity test (§7)** asserts
`toolAdminOnly`/`toolViewerAllowed` reproduce the legacy `ADMIN_ONLY_TOOLS` / viewer verdicts for every
tool — so the migration is provably policy-preserving (AC-8). The Sets are retained **only** as the
parity test's expected-value fixture; `permissions.ts` becomes the source.

> **Destructive vs delete-capability are two gates, AND-ed (AC-10).** A delete tool maps to a `*:delete`
> capability (role gate) **and** sits in `DESTRUCTIVE_TOOLS` (the `allowDestructive` flag gate, off in
> prod, `route.ts:614`). Both must pass. CLE-12 derives the *role* half from the matrix and leaves the
> *flag* half exactly where CHAT-02/CLE-11 own it. A member with `contacts:delete` still cannot reach
> `deleteContact` in chat until `allowDestructive` flips — unchanged.

### 3.4 `invokePageAction`: matrix gate before `decideAction`

CLE-04's `page-actions.ts` (design §2.3) currently goes straight to `decideAction`. CLE-12 inserts the
**static permission check first** (permission, then approval — EC-7):

```ts
// page-actions.ts, inside invokePageAction.execute, AFTER schema validation,
// BEFORE the decideAction call (CLE-04 design §2.3):
const requiredCap = capabilityForPageAction(entry); // §4 — derived from manifest metadata
if (requiredCap && !hasPermission(role, requiredCap)) {
  return { error: `Cannot run "${actionId}": your role (${role}) lacks "${requiredCap}".` };
  // no _uiDirective key → client dispatches nothing (CLE-04 §2.3 wire-level guarantee)
}
// ...then the existing decideAction call (CLE-10) for the dynamic approval disposition.
```

`capabilityForPageAction(entry)` derives the capability from the **manifest metadata** (CLE-03
`PageActionManifestEntry`: `mutating`, `outbound`, `cost`, plus the action id namespace), e.g.
`cost:"money"`→`outbound:paid`; `outbound:true`→`outbound:send`; `mutating && id.startsWith("accounts.")`
→`accounts:write`; `mutating && reversible:false`→ the `*:delete` family by namespace; pure-read → no
capability (reachable, then `decideAction` says execute). This is why CLE-04's gateway exception holds:
`invokePageAction` stays reachable; a *read-only* action passes the matrix (no cap) and `decideAction`
executes it even for a viewer (CLE-04 AC-5). A **member** invoking an `outbound:paid` action is now
refused by the matrix even though `decideAction` alone would have said `confirm` — the new, correct
behaviour (AC-11). The viewer + mutating case is refused by *both* the matrix (no `*:write` for viewer)
and `decideAction` (CLE-10 viewer floor) — defence in depth, same verdict.

### 3.5 The shared route guard `requireCapabilityForRequest`

```ts
// lib/auth/permissions.ts (or a thin lib/auth/route-guard.ts re-exporting from here).
import type { AuthContext } from "@/lib/auth/auth-utils";

/**
 * The ONE write-route guard. Resolves the capability for this request's
 * path × method from the SAME map the middleware uses (capabilityForRoute, §4),
 * then checks it against the caller's FRESH DB role (authCtx.role — overlaid in
 * auth-utils.ts:60-72, NOT the possibly-stale JWT). Returns a 403 Response to
 * reject, or null to proceed. One call replaces bespoke requireAdmin /
 * requirePermission lines and CANNOT drift from the middleware verdict, because
 * both read capabilityForRoute.
 *
 * Fail-closed: unmapped path under a default-deny prefix → deny; unknown role →
 * deny (hasPermission false). default-member prefix + unmapped → null (the viewer
 * floor in middleware already handled viewers; members proceed).
 */
export function requireCapabilityForRequest(
  authCtx: Pick<AuthContext, "role">,
  req: { method: string; nextUrl?: { pathname: string }; url?: string },
): Response | null {
  const pathname = req.nextUrl?.pathname ?? new URL(req.url!).pathname;
  const cap = capabilityForRoute(pathname, req.method);
  if (!cap) return null;                       // SAFE_METHOD or default-member unmapped
  return requireCapability(authCtx.role, cap); // 403 Response or null
}
```

Usage in a high-risk handler (replaces the bespoke line; `withAuthRLS` already resolved the fresh role):
```ts
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const denied = requireCapabilityForRequest(authCtx, req); // CLE-12
    if (denied) return denied;
    // ... handler ...
  });
}
```

This is **fresh-role-authoritative** (closes EC-1's stale-JWT window: the middleware is the cheap edge
line on the JWT; the route guard is the authoritative line on the DB role). It is **additive** to the 59
existing checks — those keep working; new high-risk routes adopt the one-liner.

---

## 4. The `path × method → capability` map

A pure, prefix-and-method table in `permissions.ts` (longest-prefix-wins; method buckets). Shape:

```ts
type Method = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RouteCapRule {
  prefix: string;                  // matched with startsWith on pathname
  // capability per write-method; SAFE methods (GET/HEAD/OPTIONS) never gated here.
  write?: Capability;              // POST/PUT/PATCH default
  del?: Capability;                // DELETE override (often *:delete)
}

// Highest-risk first ROWS are longest/most-specific; capabilityForRoute scans
// for the longest matching prefix so /api/settings/members/* beats /api/settings/*.
const ROUTE_CAPABILITY_RULES: RouteCapRule[] = [
  // ── ADMIN-ONLY surfaces (member must be rejected — the gap the middleware has today) ──
  { prefix: "/api/settings/members", write: "members:invite",  del: "members:manage" },
  { prefix: "/api/settings/autonomy", write: "settings:write" },
  { prefix: "/api/settings/mail-calendar", write: "settings:write" },
  { prefix: "/api/settings/data-model",  write: "settings:write" },
  { prefix: "/api/settings/custom-signals", write: "settings:write" },
  { prefix: "/api/settings/compliance", write: "settings:write" },
  { prefix: "/api/settings/icp",         write: "settings:write" },
  { prefix: "/api/settings/knowledge",   write: "knowledge:write" },
  { prefix: "/api/settings",             write: "settings:write" },   // catch-all settings write = admin
  { prefix: "/api/mcp",                  write: "mcp:manage", del: "mcp:manage" },
  { prefix: "/api/billing",              write: "billing:manage" },
  { prefix: "/api/admin",                write: "settings:write", del: "settings:write" }, // belt+braces (routes also requireAdmin)
  { prefix: "/api/workflows",            write: "workflows:manage", del: "workflows:manage" },
  { prefix: "/api/calls/buy-number",     write: "outbound:paid" },    // spends money → admin
  // ── MEMBER write surfaces (explicit so they are not accidentally default-deny) ──
  { prefix: "/api/emails/send",          write: "outbound:send" },
  { prefix: "/api/sequences",            write: "sequences:write",   del: "sequences:delete" },
  { prefix: "/api/meetings",             write: "deals:write" },      // notes/follow-up = member
  { prefix: "/api/contacts",             write: "contacts:write",    del: "contacts:delete" },
  { prefix: "/api/accounts",             write: "accounts:write",    del: "companies:delete" },
  { prefix: "/api/opportunities",        write: "deals:write",       del: "deals:delete" },
  { prefix: "/api/deals",                write: "deals:write",       del: "deals:delete" },
  { prefix: "/api/score-contacts",       write: "contacts:write" },
  { prefix: "/api/enrich",               write: "enrichment:run" },
];

export function capabilityForRoute(pathname: string, method: string): Capability | undefined {
  const m = method.toUpperCase() as Method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return undefined; // never gated here (EC-6)
  // longest-prefix-wins
  let best: RouteCapRule | undefined;
  for (const rule of ROUTE_CAPABILITY_RULES) {
    if (pathname.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) best = rule;
  }
  if (best) return m === "DELETE" ? (best.del ?? best.write) : best.write;
  return DEFAULT_POSTURE(pathname); // §5.1 — default-member (undefined) or default-deny (a capability)
}
```

The **same map** feeds `capabilityForPageAction` only indirectly: page actions derive from manifest
metadata (§3.4), not paths, because a page action is not an HTTP route. The two derivations share the
capability **enum** and are reconciled by the cross-map test (§7, EC-8).

---

## 5. Rollout, default posture, and the long-tail checklist

### 5.1 Default posture (the heart of the "don't edit 346 routes" decision)

`DEFAULT_POSTURE(pathname)` resolves an **unmapped write** route:

- **`default-member`** (returns `undefined` → middleware passes member, viewer already blocked) for the
  broad, low-risk CRM surface. This is **safe** because (a) the viewer floor still blocks every viewer
  write (unchanged), and (b) the *existing* posture for these routes is *already* member-open (audit §6:
  "everyday CRM writes are member-open") — so `default-member` is **not a regression**, it is the status
  quo made explicit.
- **`default-deny`** (returns a capability the role must hold, e.g. `settings:write`) for a small set of
  **high-risk path prefixes** that should be admin even if a new route is dropped in without a rule:
  `/api/settings`, `/api/admin`, `/api/billing`, `/api/mcp`, `/api/workflows`. So a *new* settings route
  is admin-gated the moment it exists, before anyone adds a rule.

```ts
const HIGH_RISK_DEFAULT_DENY: ReadonlyArray<[string, Capability]> = [
  ["/api/settings", "settings:write"], ["/api/admin", "settings:write"],
  ["/api/billing", "billing:manage"], ["/api/mcp", "mcp:manage"],
  ["/api/workflows", "workflows:manage"],
];
function DEFAULT_POSTURE(pathname: string): Capability | undefined {
  for (const [prefix, cap] of HIGH_RISK_DEFAULT_DENY) if (pathname.startsWith(prefix)) return cap;
  return undefined; // default-member: viewer floor handles viewers; members proceed
}
```

This is the **explicit security tradeoff** (§8): the broad CRM surface defaults to *member-open*
(matching today), while the dangerous surfaces default to *admin-deny*. We do **not** default the whole
app to deny — that would 403 hundreds of working member flows on day one and is the wrong risk (it would
break the product to chase a theoretical gap on routes that are already member-open). We **do** default
the money/config/identity surfaces to deny, because those are where an unmapped route is actually
dangerous.

### 5.2 Where the middleware gate is inserted

In `middleware.ts`, **after** the viewer block (`:152-163`) and **before** `return NextResponse.next()`
(`:165`) — inside the authenticated, non-public region (past `isPublic` `:132` and the `!req.auth?.user`
redirect `:143`). So: public/self-auth routes (Twilio, Inngest, webhooks, pixel — `:45-109`, EC-5) are
never gated; the rate-limit and auth gates run first; the viewer floor runs first; then the admin/member
capability gate. JWT role only (no DB read on the edge — AC-6); the route guard re-checks fresh (EC-1).

### 5.3 Rollout sequence (what ships in this feature)

1. **Matrix + helpers + maps** (`permissions.ts`): enum, `ROLE_PERMISSIONS`, `requireCapability`(+alias),
   `capabilityForRoute`, `capabilityForTool`, `capabilityForPageAction`, `requireCapabilityForRequest`,
   `DEFAULT_POSTURE`. Pure, fully unit-tested.
2. **Capability-resolver** migrated to derive verdicts (§3.3) + the **parity test** (the keystone).
3. **Middleware** admin/member gate added (§3.1, §5.2); viewer test re-run unchanged.
4. **`invokePageAction`** matrix-before-decideAction gate (§3.4).
5. **Apply `requireCapabilityForRequest` to the highest-risk write routes** (the ones the middleware now
   also covers, belt-and-braces with the fresh role):
   - **Members**: `/api/settings/members/invite`, `/api/settings/members/invites`, member role-change.
   - **Settings/config**: `/api/settings/icp`, `/api/settings/autonomy`, `/api/settings/mail-calendar`,
     `/api/settings/data-model`, `/api/settings/custom-signals`, `/api/settings/compliance`,
     `/api/settings/knowledge`, `/api/mcp/*`.
   - **Sends / enroll**: `/api/emails/send`, `/api/sequences/[id]/enroll`,
     `/api/sequences/drafts/bulk-approve`, `/api/sequences/[id]/autopilot`,
     `/api/meetings/[id]/notes/send-follow-up`.
   - **Money**: `/api/calls/buy-number` (and any paid-send chokepoint) → `outbound:paid` (admin).
   - **Deletes**: `/api/contacts/[id]` DELETE, `/api/accounts/[id]` DELETE (already
     `companies:delete`), `/api/deals|opportunities/[id]` DELETE, `/api/gdpr/delete` → admin.
   These are the rows in §4's map and the §7 route-rejection test targets.
6. **Default posture** wired so the ~287 unmapped routes are covered without per-route edits.

### 5.4 The long-tail checklist (closing the 2-point completeness gap incrementally)

Recorded in this design (and to be tracked in the feature's PR description / `spec-issues.md` if
extended). **Do not** claim these are done in CLE-12; they are the path to 10/10:

- [ ] Sweep the remaining `/api/settings/*` sub-routes and add explicit map rows (most are caught by the
      `/api/settings` catch-all = `settings:write` today; verify none should be member).
- [ ] Audit the 46 `requireAdmin` call sites: each should either map cleanly to `settings:write`/an
      admin capability via the route map (then the bespoke line is redundant and can be dropped in a
      follow-up) or be a genuine exception to document.
- [ ] Audit the 15 `requirePermission` call sites for capability drift against the new enum.
- [ ] Add map rows for `/api/proposals`, `/api/tasks`, `/api/knowledge` (user-facing) vs
      `/api/settings/knowledge` (admin) — confirm the member/admin split per resource.
- [ ] Decide member-vs-admin for `/api/import/*` (bulk insert) and `/api/tam/*` (TAM build — pro-gated
      but role?).
- [ ] Replace the legacy `requireAdmin`/`requirePermission` lines with `requireCapabilityForRequest`
      where the map now covers them (one-by-one, each with a test) — converging on a single guard.
- [ ] Consider promoting `default-member` → `default-deny` for additional prefixes as coverage grows
      (the safe direction), once the explicit member rows are comprehensive enough not to break flows.

---

## 6. The orthogonality boundary (permission vs approval vs isolation vs assignment)

CLE-12 is one axis among four; keeping them separate is a design requirement (and the audit's whole
"three parallel systems" complaint is *about* conflation):

- **Permission (CLE-12):** may this **role** do this **kind** of thing at all? → `ROLE_PERMISSIONS`.
- **Approval (CLE-10 `decideAction`):** does this action need a **card right now** (mode × metadata ×
  confidence)? → orthogonal. A member *may* send (permission) but the send still *confirms* (approval).
  Order: **permission first, approval second** (§3.4). `decideAction`'s signature (README §3.5bis) is
  **not** touched; CLE-12 adds a check *around* it, not *inside* it.
- **Isolation (out of scope):** may this **tenant** see this **row**? → app-layer `WHERE tenant_id` +
  RLS 0074. Untouched (requirements §6, eval step 9).
- **Assignment (out of scope):** who **is** admin/member/viewer (incl. **founder-never-admin**,
  `project_workspace-roles.md`)? → the membership system. CLE-12 **reads** `authCtx.role`; it never
  derives role from "is creator" and never writes a role. The matrix governs `role × capability`, never
  `user → role` — so the founder-never-admin backfill (creators must be `admin`) is unaffected: a
  founder is `admin` by assignment, and the matrix then grants admins everything (EC-4).

---

## 7. Failure handling (fail-closed)

| Failure | Where caught | Outcome |
|---|---|---|
| Unknown / legacy role | `hasPermission` `?? false` (permissions.ts:80-82) | every capability denied; reads still pass (SAFE_METHOD / viewer-floor allowlist) → effectively read-only, not locked out (EC-2). |
| Route not in map, high-risk prefix | `DEFAULT_POSTURE` → returns a capability | `default-deny`: member 403, admin pass (EC-3). |
| Route not in map, ordinary prefix | `DEFAULT_POSTURE` → `undefined` | `default-member`: middleware passes member (viewer already blocked) — status quo (EC-3, §5.1). |
| Stale JWT admin, demoted in DB | middleware passes on JWT; route guard reads fresh role | `requireCapabilityForRequest` 403s with the fresh member role — authoritative (EC-1). |
| Malformed JWT role (undefined) | middleware `sessionRole ?? "member"`; guard `hasPermission(undefined→false)` | treated as member at the edge (still blocked from admin caps), denied everything unknown at the route — fail-closed (AC-14). |
| Public/self-auth route | gate runs only after `isPublic`/auth region (§5.2) | never gated → Twilio/Inngest/webhooks unaffected (EC-5). |
| Page action below capability | `invokePageAction` matrix gate before `decideAction` (§3.4) | `{ error }`, no `_uiDirective`, `decideAction` not consulted (AC-11, EC-7). |
| SAFE method on a write path | `capabilityForRoute` returns `undefined` for GET/HEAD/OPTIONS | not gated (reads always allowed; EC-6). |
| Tool map ≠ route map on a shared verb | cross-map consistency test (§7 below) | caught at CI, not in prod (EC-8). |

**Fail-safe direction throughout**: every defaulting path resolves to deny-or-more-restriction on the
dangerous surfaces and to status-quo-member on the broad CRM surface — never to *more* permissive than
today on any path.

---

## 8. Security tradeoff (stated explicitly)

CLE-12 ships a **hybrid default posture**, not blanket default-deny, and this is a deliberate,
documented risk decision:

- **What we gain now.** (1) The middleware finally distinguishes admin from member (today it does not,
  audit §6) — members are systemically blocked from settings/members/billing/mcp/money. (2) One matrix
  drives all three points; the parity test proves the chat resolver's policy is identical to before
  (plumbing changed, not policy). (3) `invokePageAction` cannot let a member spend money or a viewer
  mutate, on any path. (4) New high-risk routes (`/api/settings`, `/api/admin`, `/api/billing`,
  `/api/mcp`, `/api/workflows`) are admin-gated **by default**, the day they ship.
- **What we knowingly defer.** The ~287 ordinary write routes not in the map default to **member-open**
  (the existing posture), gated only by the viewer floor. A member can still reach any member-open CRM
  write whether or not it has a rule. We are **not** closing every route to a least-privilege per-route
  capability in this one feature — that is the long tail (§5.4), and forcing it now would 403 working
  flows (wrong risk: breaking the product to chase a gap on routes that are *already* member-open and
  carry no money/config/identity blast radius).
- **Why this is the right cut.** The dangerous surface (money, config, members, MCP, deletes) is closed
  *and* defaults closed. The benign surface (CRM read/write a member already had) defaults open, exactly
  as today, but now *explicitly and auditably*, with a single helper and checklist to tighten
  incrementally. The viewer floor — the one systemic guarantee that already existed — is preserved
  byte-for-byte. This matches CLAUDE.md "boil lakes, flag oceans": the matrix + helper + high-risk
  coverage is the boilable lake; per-route least-privilege across 346 routes with zero flow breakage is
  the ocean, flagged not swallowed. Completeness 8/10 (`feature_list.json`), the 2-point gap being this
  tradeoff.

---

## 9. Test strategy (vitest; pure logic + thin role-minting integration)

- **`permissions.matrix.test.ts`** — `hasPermission` truth table: full capability enum ×
  `{admin, member, viewer, "owner"(legacy), undefined}`. admin = all; viewer = read set; member = CRM
  set **without** `outbound:paid`/`settings:write`/`members:*`/`mcp:manage`/`workflows:manage`/
  `knowledge:write`; unknown = none (AC-1/AC-2/AC-14). **Compile-time**: `Permission` alias equals
  `Capability` (a `satisfies`/type-equality assertion so the 15 legacy call sites can't break).
- **`capability-resolver.parity.test.ts` (THE KEYSTONE — required).** For **every** tool name in a
  representative `buildAllChatTools(ctx)` registry: assert `toolAdminOnly(name) === ADMIN_ONLY_TOOLS.has(
  name)` and `toolViewerAllowed(name) === legacyIsViewerAllowed(name)` (the pre-CLE-12 `:149-153`
  function captured as a fixture). Any tool where the two differ must appear in an explicit
  `INTENTIONAL_DELTAS` allow-list with a comment; the test asserts the delta set is exactly the declared
  one (AC-7/AC-8). Also assert `toolViewerAllowed("invokePageAction") === true` (CLE-04 gateway
  preserved, AC-9) and that destructive tools still need `allowDestructive` (AC-10: a member with the
  delete capability but `allowDestructive:false` → tool dropped `destructive-gated`).
- **`route-capability.test.ts` (required: high-risk route rejects member when matrix says admin).**
  Table over `capabilityForRoute(path, method)`:
  - `POST /api/settings/members/invite` → `members:invite`; member → `requireCapabilityForRequest` 403;
    admin → null. Same for `/api/settings/autonomy` (`settings:write`), `/api/mcp/x` (`mcp:manage`),
    `/api/calls/buy-number` (`outbound:paid`), `DELETE /api/contacts/[id]` (`contacts:delete`).
  - `POST /api/contacts` → `contacts:write`; member → null; viewer → (middleware floor blocks first;
    guard would also block since viewer lacks `contacts:write`).
  - `GET /api/settings/icp` → `undefined` (SAFE_METHOD) → guard returns null (read allowed, EC-6).
  - Unmapped `POST /api/foo/bar` → `undefined` (default-member) → member null; unmapped
    `POST /api/settings/brand-new` → `settings:write` (default-deny prefix) → member 403, admin null
    (AC-12/EC-3).
- **`middleware-capability.test.ts`** — exercise the extracted gate logic (the `capabilityForRoute` +
  `hasPermission` branch from §3.1, factored into a testable pure fn): stale **admin** JWT on
  `/api/settings/members/invite` passes the edge (JWT-only), then assert the **route guard** with a
  **member** fresh role 403s (EC-1). Viewer write → still blocked by `isViewerWriteBlocked` **before**
  the capability gate (AC-3). Public path (`/api/inngest`) → gate not reached (EC-5).
- **`page-action-permission.test.ts`** — extend CLE-04's `page-actions.tools.test.ts`:
  member + `sequences.launch` (`outbound:true, cost:"money"` → `outbound:paid`) → `{ error }` naming
  `outbound:paid`, **no `_uiDirective`**, `decideAction` **not** called (spy) (AC-11/EC-7);
  member + `accounts.applyFilter` (read) → passes matrix → `decideAction` executes (CLE-04 behaviour
  intact); viewer + read action → reachable (AC-9).
- **`cross-map-consistency.test.ts` (EC-8)** — for the verbs that exist as both a tool and a route,
  assert the same capability: `createContact`↔`POST /api/contacts`→`contacts:write`;
  `deleteContact`↔`DELETE /api/contacts/[id]`→`contacts:delete`; `inviteMember`↔
  `POST /api/settings/members/invite`→`members:invite`; `composeEmail`/`outbound`↔`POST /api/emails/send`
  →`outbound:send`.
- **Out-of-scope proof (eval step 9; `regression.sh` grep)** — assert `git diff` touches **no**
  `withTenantTx` / `WHERE tenant_id` / `db/migrations` / RLS file, and **no** membership-write logic.
- **Hygiene** — `tsc --noEmit` 0 errors; `regression.sh` green; grep guard that no role→capability
  literal (`role === "admin"` deciding a capability, `=== "viewer"` write rules) exists outside
  `permissions.ts` and `viewer-guard.ts` (the two sanctioned homes); the 59 legacy
  `requireAdmin`/`requirePermission` sites still compile and 403 the same roles (additive migration).

Coverage target: 100% of new branches in `permissions.ts` (every helper, the longest-prefix scan, the
default posture) and the resolver derivation. The keystone parity test is the gate: if the matrix-derived
verdict ever diverges from the legacy Sets without an entry in `INTENTIONAL_DELTAS`, CI fails.
