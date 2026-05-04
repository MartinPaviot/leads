# Lightfield Patterns to Adopt -- Elevay Implementation Guide

Extracted from: API docs (44 endpoints), SDK analysis (v0.6.0-alpha), blog posts (Mar 6 -- May 1 2026), deep teardown (trial account), agentic teardown.

Date: 2026-05-04

---

## 1. API Design Patterns

### 1.1 POST for Updates (not PATCH)

**What Lightfield does:** Both create and update use `POST`. Create is `POST /v1/accounts`, update is `POST /v1/accounts/{id}`. No PATCH method anywhere in the 44-endpoint surface.

**Why it is good:**
- Idempotency is trivial: same `Idempotency-Key` + same payload = same result. PATCH semantics (partial merge) make idempotency ambiguous when different fields are sent with the same key.
- Client simplicity: no need for clients to distinguish between "send the whole object" (PUT) vs "send only changed fields" (PATCH). POST with partial fields means "update only what is included."
- Error surface shrinks: no JSON Merge Patch vs JSON Patch debate, no `Content-Type: application/merge-patch+json` header negotiation.

**Elevay recommendation:** When we build the public API, use POST for both create and update. Internally, our Next.js API routes already use POST for mutations. Keep this convention when exposing `/api/v1/`.

### 1.2 Versioning via Header

**What Lightfield does:** `Lightfield-Version: 2026-03-01` header on every request. Missing header returns 400 with code `version_header`. No version in the URL path.

**Why it is good:**
- URL paths stay clean and stable. `/v1/accounts` never becomes `/v2/accounts`.
- Clients opt into breaking changes explicitly by changing the header value.
- Server can serve multiple versions from the same endpoint, routing internally by header.
- Backward compatibility is per-client, not per-deployment: old integrations keep working until they update their header.

**Elevay recommendation:** Adopt `Elevay-Version: YYYY-MM-DD` header. Version the response shape and validation rules, not the URL. Default to latest version if header is missing during beta; enforce it after GA.

### 1.3 Idempotency Keys

**What Lightfield does:** `Idempotency-Key` header (max 255 chars) on any POST. Keys are scoped to org + operation type, expire after 24h. Failed original requests are not cached (re-attempted). Concurrent duplicate keys return 409.

**Why it is good:**
- Network retries are safe. Mobile clients, webhook deliveries, and agent-initiated writes can retry without creating duplicates.
- The "failed original not cached" rule means transient errors self-heal on retry.
- 24h expiry prevents key storage from growing unbounded.

**Elevay recommendation:** Implement idempotency middleware in our API layer. Store `{key, orgId, operationType, responseHash, createdAt}` in Redis with 24h TTL. Return cached response on key match. Return 409 on concurrent in-flight duplicates. Our Inngest functions already have event-level dedup; extend this pattern to the HTTP layer.

### 1.4 $-Prefixed System Fields

**What Lightfield does:** System-defined fields use `$` prefix (`$name`, `$stage`, `$email`, `$website`). Custom fields use bare slugs (`tier`, `renewalDate`). The prefix is the namespace boundary.

**Why it is good:**
- Zero collision risk between system and custom fields. A user can create a field called `name` without overwriting the system `$name`.
- API consumers can instantly distinguish system vs custom fields by prefix. No metadata lookup needed.
- Schema evolution is safe: adding a new system field never breaks existing custom fields.
- Grep-able: `$` prefix makes system field usage trivially searchable in codebases.

**Elevay recommendation:** Our Drizzle schema uses fixed column names (e.g., `company_name`, `industry`). When we expose the public API, map internal columns to `$`-prefixed field names. Custom fields (when added) use bare slugs. The mapping layer lives between the API handler and the database.

### 1.5 Definitions Endpoints

**What Lightfield does:** `GET /v1/{objectType}/definitions` returns complete schema for any object type -- field definitions (slug, label, valueType, readOnly, typeConfiguration) and relationship definitions (cardinality, objectType).

**Why it is good:**
- Self-describing API. Clients do not need documentation to discover available fields.
- Dynamic UIs can render forms from definitions without hardcoded field lists.
- Custom fields appear in definitions automatically. No separate "custom fields" API needed.
- Select options (with `opt_` prefixed IDs) are returned inline, so clients never hardcode option values.

**Elevay recommendation:** Add `GET /api/v1/accounts/definitions`, `GET /api/v1/contacts/definitions`, etc. Generate from Drizzle schema + any future custom field metadata table. Include field types, labels, required flags, and enum options. This also powers our own frontend form generation.

### 1.6 14 Typed Field Values

**What Lightfield does:** Every field has a `valueType` from a fixed enum: TEXT, NUMBER, CHECKBOX, CURRENCY, DATETIME, EMAIL, TELEPHONE, URL, ADDRESS, FULL_NAME, SOCIAL_HANDLE, SINGLE_SELECT, MULTI_SELECT, READONLY_MARKDOWN.

**Why it is good:**
- Strong typing enables per-type validation, rendering, and filtering. An EMAIL field validates format; a TELEPHONE field normalizes to E.164.
- READONLY_MARKDOWN type explicitly marks AI-generated fields as non-writable, preventing clients from overwriting computed values.
- ADDRESS as a structured object (street, city, state, postalCode, country with ISO codes, lat/lng) avoids the "address is a string" problem.
- FULL_NAME as `{firstName, lastName}` prevents the "parse the name string" problem.

**Elevay recommendation:** Define our own value type enum when building the public API. Start with the subset we actually use: TEXT, NUMBER, DATETIME, EMAIL, URL, SINGLE_SELECT, MULTI_SELECT, READONLY_MARKDOWN. Add ADDRESS, TELEPHONE, CURRENCY when needed. Store valueType alongside each field definition.

### 1.7 Entity ID Prefixes

**What Lightfield does:** Every entity ID has a type prefix: `acc_`, `con_`, `opp_`, `mem_`, `opt_`, `ad_`, `rd_`, `av_`, `rv_`.

**Why it is good:**
- Any ID is self-describing. A developer seeing `con_abc123` knows it is a contact without context.
- API errors are more debuggable: passing an account ID to a contact endpoint is immediately obvious.
- Database queries can validate ID format before hitting the DB.

**Elevay recommendation:** We already use UUIDs everywhere. Add a prefix layer: `acc_`, `con_`, `opp_`, `tsk_`, `nte_`, `mtg_`, `mem_`. Store the bare UUID in the database; add/strip prefix in the API serialization layer. This is cosmetic but high-value for developer experience.

---

## 2. Skills System Architecture

### How Lightfield's Skills Work

**Three tiers:**
1. **System Skills** (16+ pre-built, read-only): Find Similar Companies, Build Prospect List, Resurrect Lost Deals, Research & Write Outreach, Map Buying Committee, Find Next Best Action, Extract Buyer Language, Meeting Brief, Post-Meeting Follow-Up, Create/Update Opportunity from Meeting, Draft Proposal, Draft Sales Deck, Qualify Deal, Account Health Score, Generate Pipeline Report, Draft Case Study.
2. **Workspace Skills** (admin-created, shared across team).
3. **User Skills** (personal, for experimentation).

**Key design principle:** "If you've given the same instructions to a new hire three times, that's a Skill." Skills are natural-language task descriptions with steps and constraints, not code. Users teach the agent, they do not program it.

**Execution model:** Skills invoke the full agent toolset (CRM search, record CRUD, email drafting, web research, code execution). Skills reference Knowledge entries for context. The agent follows the Skill's defined steps and constraints.

**Recent additions (Apr-May 2026):**
- Objection Pattern Library (scans 90 days of deal data, groups objections by theme)
- Messaging Gap Identifier (compares objections against public content)
- Objection-Stage-Persona Mapper (cross-references objections against deal stage and contact role)
- Counter-Playbook Generator (extracts successful responses from closed-won deals)
- Onboarding Skill (conducts user interviews, auto-generates Knowledge files)

### Proposed Elevay Equivalent

**Architecture:**
```
skills/
  system/           -- Pre-built, version-controlled in repo
    find-similar.md
    build-prospect-list.md
    meeting-brief.md
    ...
  workspace/         -- Stored in DB, managed by workspace admin
  user/              -- Stored in DB, per-user
```

**Skill definition schema:**
```typescript
interface SkillDefinition {
  id: string;                    // e.g. "find-similar-companies"
  name: string;                  // Human-readable
  scope: "system" | "workspace" | "user";
  description: string;          // What this skill does
  steps: string[];              // Natural language steps
  constraints: string[];        // Guardrails
  requiredKnowledge: string[];  // Knowledge file IDs to inject
  tools: string[];              // Allowed agent tools
  createdBy: string;            // User ID or "system"
}
```

**Implementation path:**
1. Start with system Skills as markdown files in the repo, loaded into agent system prompt when invoked.
2. Add workspace/user Skills stored in a `skills` Drizzle table.
3. Add a "Create Skill" chat command: user describes a task, agent generates the Skill definition, user confirms.
4. Add a "Recently Used" section in the chat UI for quick skill re-invocation.

**Priority:** HIGH. This is Lightfield's biggest differentiator and our biggest gap. Their Skills system makes the product teachable -- a quality that compounds over time as users invest in customization.

---

## 3. Workflow Engine Architecture

### Lightfield's Workflow Engine

**Trigger types (4):**
| Type | Details |
|------|---------|
| Webhook | HTTP POST from external services, full JSON body available downstream |
| Object Lifecycle | Fires on create/update of Contact, Account, Opportunity, Meeting, Task, Note. Field-level watching for updates. Output includes `_diff` with before/after values |
| Scheduled | Daily/Weekly/Monthly/Cron. IANA timezone-aware with DST handling |
| Manual | Click "Run" in UI with optional JSON payload |

**Step types (5):**
| Type | Details |
|------|---------|
| Object Operations | Create, upsert, find (with filter operators: IS, IS_NOT, CONTAINS, IS_ANY_OF, etc.) |
| HTTP Request | GET/POST/PUT/PATCH/DELETE with custom headers, JSON body, template variables. SSRF-protected |
| Agent Request | Claude-powered step with optional capabilities: entity CRUD, code execution (Python/bash sandbox), web search. Connected MCP servers: Granola, Salesforce, Slack, Airtable |
| Sleep | Pause for specified duration (ms to days) |
| Log | Record messages with resolved template variables |

**Template syntax:** `{{trigger.field}}`, `{{nodeId.field}}`, `{{nodeId.nested.field}}`, `{{trigger._diff.fieldName.before}}` / `.after`

**Execution model:** Sequential. Each step awaits previous completion. Step failure skips subsequent steps and marks workflow failed. Durable execution engine with immutable version snapshots, compare-and-swap concurrency, auto-retry with exponential backoff for transient errors (502/503/504).

**Timeouts:** 60s for AI steps, 30s for external API calls.

### Comparison to Elevay's Inngest-Based Approach

**Elevay's current state:** We use Inngest for background jobs (TAM building, enrichment, scoring model training, webhook processing). Inngest provides durable execution, retries, and step functions natively.

**Where Lightfield's approach is better:**
- Agent step type: Lightfield's workflow engine can invoke Claude as a step with scoped capabilities. Our Inngest functions call LLMs but do not have a standardized "agent step" abstraction.
- Template syntax for data flow between steps: Lightfield uses `{{nodeId.field}}` which is readable. Inngest uses `step.run()` return values which are more powerful but less accessible to non-developers.
- Visual builder: Lightfield has a UI for composing workflows. We have code-only Inngest functions.

**Where Elevay's approach is better:**
- Inngest's step functions are more powerful: parallel steps, fan-out/fan-in, conditional branching via code.
- No 60s timeout constraint on agent steps. Inngest supports long-running steps natively.
- TypeScript-first: our workflows are type-checked at compile time.

**Elevay recommendation:**
1. Keep Inngest as the execution engine. It is strictly more capable.
2. Add a visual workflow builder UI that generates Inngest function code (or a JSON spec that an Inngest function interprets).
3. Add an "Agent Step" abstraction: a standardized Inngest step type that invokes the chat agent with scoped tool access and Knowledge injection.
4. Add `_diff` tracking on record updates: store before/after snapshots in the activity log so workflows can react to specific field changes.

---

## 4. Knowledge Layer Design

### How Lightfield's Knowledge Works

**What it is:** Structured context entries that the agent references during chat and Skill execution. Separate from conversation history and system prompts.

**Two scopes:**
- **Workspace Knowledge** (Settings > Knowledge): Visible to all members. Managed by admins. Examples: ICP definition, competitive positioning, objection handling playbooks, product messaging, discovery frameworks.
- **User Knowledge** (personal): Per-user context.

**Key design decisions:**
1. Knowledge is separate from Skills. A single Knowledge entry (e.g., "ICP definition") can be referenced by multiple Skills (e.g., "Build Prospect List", "Qualify Deal", "Account Health Score").
2. Knowledge entries are topic + content pairs. The agent draws on relevant Knowledge automatically during execution based on semantic relevance to the current task.
3. Knowledge files can be uploaded via API with `purpose: knowledge_user` or `purpose: knowledge_workspace` on the File resource.
4. The Onboarding Skill auto-generates Knowledge from user interviews.

**UI (from teardown):**
- Settings > Knowledge: "Give Lightfield additional context on your business. This context will be included in AI requests for everyone."
- Each entry: Topic (text) + Content (text) + Save/Remove buttons.
- Simple, flat list. No folders, no tags, no versioning.

### Proposed Elevay Equivalent

**Architecture:**
```typescript
// Drizzle table
export const knowledge = pgTable("knowledge", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id"),  // null = workspace-level
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  scope: text("scope").notNull(),  // "workspace" | "user"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});
```

**Agent integration:**
1. Before every chat completion, query Knowledge entries for the user's workspace.
2. Inject relevant entries into the system prompt as structured context blocks.
3. Use embedding-based retrieval to select the most relevant entries (not all entries, to avoid context bloat).
4. When a Skill specifies `requiredKnowledge`, always inject those entries regardless of semantic relevance.

**Migration path from current state:** We currently have ICP settings in onboarding. These become the first Knowledge entries, auto-created during onboarding. The Knowledge system generalizes what ICP settings do today.

**Priority:** HIGH. Knowledge + Skills together make the product teachable. Knowledge alone is a weekend of work (simple CRUD + injection into prompts). The compounding value comes from Skills referencing Knowledge.

---

## 5. MCP Server Strategy

### What Lightfield Exposes

**Server:** `https://mcp.lightfield.app/mcp`
**Transport:** Streamable HTTP with OAuth 2.1
**Tools (5):**

| Tool | Description |
|------|-------------|
| `get_current_user` | User identity (name, email, role) |
| `search_lightfield_api_docs` | Browse API endpoints and resources |
| `get_lightfield_api_details` | Detailed endpoint documentation |
| `read_from_lightfield` | Retrieve workspace data |
| `write_to_lightfield` | Create or modify workspace records |

**Connected MCP servers (in Workflows):** Granola, Salesforce, Slack, Airtable.

**Setup for Claude Code:** `claude mcp add --transport http lightfield https://mcp.lightfield.app/mcp` then `/mcp` to complete OAuth.

### Analysis

Lightfield's MCP server is thin -- 5 generic tools wrapping CRUD. Two of the five tools are documentation search, which is unusual (most MCP servers do not include their own docs as tools). This suggests they are still iterating on tool design.

The real value is the concept, not the implementation: any external AI agent (Claude Desktop, Cursor, custom agents) can use Lightfield as a data source and action target. This turns the CRM into a platform.

### How Elevay Should Design Ours

**Tool design (more granular than Lightfield):**

| Tool | Description |
|------|-------------|
| `get_current_user` | Identity + permissions |
| `list_accounts` | Search/filter accounts with pagination |
| `get_account` | Single account with related data |
| `create_account` | Create with enrichment trigger |
| `update_account` | Update fields |
| `list_contacts` | Search/filter contacts |
| `get_contact` | Single contact with related data |
| `create_contact` | Create with enrichment |
| `list_opportunities` | Search/filter deals |
| `get_opportunity` | Single deal with related data |
| `create_task` | Create task with assignment |
| `search_crm` | Full-text search across all entities |
| `get_signals` | Signals for an account/contact |
| `get_score` | ML score breakdown for a lead |
| `invoke_skill` | Run a named Skill |
| `add_knowledge` | Add a Knowledge entry |

**Rationale for more tools:** Per-entity tools are easier for external agents to discover and use. A generic `read_from_lightfield` requires the agent to know the internal query language. `list_accounts` with explicit filter parameters is self-documenting.

**Authentication:** OAuth 2.1 with PKCE, scoped to workspace + user permissions. API keys as fallback for headless integrations.

**Transport:** Streamable HTTP (same as Lightfield). This is the standard that Claude Desktop and Claude Code support.

**Priority:** MEDIUM. The MCP server is a platform play. It matters when external agents exist that want to use Elevay. Build it after the core product is solid, but architect the API layer now to support it later.

---

## 6. Model-Agnostic Strategy

### What Lightfield Does

Lightfield supports multiple models in a user-facing selector:
- Claude Opus 4.7 (added Apr 17, 2026)
- Claude Opus 4.6 (added Feb 6, 2026)
- GPT 5.5 (added Apr 24, 2026)
- GPT 5.4 (added Mar 6, 2026)
- Gemini 3 Pro (referenced in pricing page)

Users pick their preferred model per workspace or per chat.

### Should Elevay Do This?

**Arguments for:**
- Enterprise buyers have model mandates (e.g., "we only use Azure OpenAI").
- Model competition benefits us: if Claude 4.8 is better next month, we can adopt it immediately.
- Reduces vendor lock-in risk.

**Arguments against:**
- Every model has different tool-calling conventions, system prompt interpretations, and failure modes. Supporting N models means testing N times.
- Our Skills, Knowledge injection, and scoring prompts are tuned for Claude. Switching models degrades quality unless we maintain per-model prompt variants.
- For a startup doing founder-led sales, model choice is noise. They want results, not model selectors.

**Elevay recommendation:** NO for now. Use Claude exclusively. Build the abstraction layer (model parameter in chat completions) but do not expose it to users. Revisit when:
1. An enterprise prospect requires a specific model.
2. A non-Claude model demonstrably outperforms Claude on our specific tasks (scoring, enrichment, email drafting).

The abstraction should exist in code (a `ModelProvider` interface) so switching is a config change, not a rewrite. But the UI should not offer a model picker.

---

## 7. Privacy-Aware Meetings

### What Lightfield Does

**Access levels:**
- `FULL`: Complete meeting content (transcript, notes, summary) visible.
- `METADATA`: Only title, date, attendees visible. Content redacted.

**Privacy settings:** Per-meeting `$privacySetting` field. Set to `FULL` or `METADATA` on creation.

**Per-caller redaction:** When retrieving a meeting via API, the response includes an `accessLevel` field that reflects the caller's resolved access. If the caller does not have full access, content fields are omitted.

**Use case:** Sensitive meetings (HR, legal, board) where the CRM should know the meeting happened (for activity tracking) but not expose the content to all team members.

### Worth Implementing?

**Yes, but not now.** This matters for:
- Multi-user workspaces where not everyone should see every meeting.
- Compliance-sensitive industries (healthcare with HIPAA, legal with privilege).
- Founder-led sales typically involves a single user, so privacy between team members is not a day-one concern.

**Elevay recommendation:** Add a `privacyLevel` column to the meetings table now (default: `FULL`). Do not build the access resolution logic until we support multi-user workspaces. The column costs nothing and avoids a migration later.

---

## 8. Auto-Enrichment Triggers

### How Lightfield Does It

**Account enrichment:** Providing `$website` on account create triggers automatic background enrichment. The enrichment populates: industry, headcount, revenue, funding, LinkedIn, social handles, `$howTheyMakeMoney` (AI-generated), `$accountStatus` (AI-generated).

**Contact enrichment:** Creating a contact triggers automatic background enrichment. Populates: job title, company, LinkedIn, phone.

**Meeting auto-create:** `autoCreateRecords: true` on meeting create auto-creates Account and Contact records for external attendees who do not yet exist in the CRM.

**Enrichment quality (from our testing):** ~20% accuracy for LinkedIn matching, ~40% for industry, ~30% for revenue/headcount. GulfTech example: domain `gulftech.sa` matched to a Saudi food processing company instead of the tech company. This is a known weakness.

### Comparison to Elevay's Waterfall

**Elevay's current approach:** Waterfall enrichment system in `app/apps/web/src/lib/providers/company-enrichment/`. Multiple providers tried in priority order. Saturation check: stops when industry + description + (employeeCount OR sizeRange) are all present. First non-null value wins for scalar fields. Provenance tracking per field.

**Where Lightfield is better:**
- Auto-trigger on creation: no manual "enrich" step needed. Our TAM builder does this for batch, but individual account creation does not auto-enrich.
- AI-generated fields (`$howTheyMakeMoney`) go beyond raw enrichment data. They synthesize the enrichment into actionable context.

**Where Elevay is better:**
- Waterfall with saturation check is more sophisticated than Lightfield's single-provider approach.
- Provenance tracking (which provider contributed which field) gives transparency that Lightfield lacks.
- Our enrichment accuracy should be better due to multi-provider cross-validation.

**Elevay recommendation:**
1. Add auto-enrichment trigger on account create: when a user creates an account with a domain, fire an Inngest event to run the waterfall. Already done for TAM; wire it to the single-create path.
2. Add auto-enrichment trigger on contact create: similar Inngest event to enrich contact data.
3. Add AI-generated summary fields: after enrichment completes, run an LLM pass to generate `howTheyMakeMoney` and `accountSummary` from the enriched data. Store as read-only computed fields.
4. Add `autoCreateRecords` behavior on meeting sync: when a calendar meeting includes an external attendee email, check if a contact exists. If not, create the contact and attempt to match/create the account from the email domain.

---

## 9. Custom Objects

### Lightfield's Approach

**What they have (as of Apr 24, 2026, Pro tier only):**
- Admins create custom object types via UI.
- Custom objects come preconfigured with relationships to notes, tasks, files.
- Can establish custom relationships with other object types (accounts, contacts, etc.).
- Agent Data Model Tools: the agent reads existing schema and suggests draft data model changes during import or on demand.

**What they do NOT have:**
- No custom object CRUD via API (UI only).
- No custom field creation via API (read definitions only).

### Tradeoffs: Flexible vs Fixed Schema

**Flexible (Lightfield approach):**
- Pros: Adapts to any business process. Users can model their specific domain (e.g., "Products", "Territories", "Partners").
- Cons: Query performance degrades with dynamic schemas. UI complexity increases. Schema drift across workspaces makes cross-customer analytics harder.

**Fixed (Elevay's current approach):**
- Pros: Optimized queries. Consistent data model. Simpler codebase. Type-safe with Drizzle.
- Cons: Cannot model domain-specific entities. Users with unusual workflows hit walls.

**Elevay recommendation:** Stay with fixed schema for core entities (accounts, contacts, opportunities, tasks, meetings, notes). Add a lightweight `custom_fields` JSONB column on each core entity for user-defined fields. Do NOT build full custom objects yet.

**Implementation:**
```typescript
// Add to each entity table
customFields: jsonb("custom_fields").$type<Record<string, unknown>>().default({}),
```

**Custom field metadata:**
```typescript
export const customFieldDefs = pgTable("custom_field_defs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  entityType: text("entity_type").notNull(),  // "account" | "contact" | "opportunity"
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  valueType: text("value_type").notNull(),    // TEXT, NUMBER, SINGLE_SELECT, etc.
  typeConfiguration: jsonb("type_configuration"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

This gives us Lightfield's custom fields without the complexity of custom objects. The definitions endpoint returns both system fields and custom field defs. Revisit full custom objects when a paying customer requests them.

---

## 10. Lightfield's Weaknesses to Exploit

### 10.1 No DELETE Endpoint

**The gap:** No DELETE method documented for any resource across all 44 endpoints. You cannot programmatically delete an account, contact, opportunity, task, note, meeting, or list via API.

**How to exploit:** Elevay's API should support DELETE from day one. For integrations that sync data bidirectionally (e.g., deleting a contact in the source system should delete it in the CRM), DELETE is essential. Lightfield users who need cleanup must use the UI or their bulk delete feature (which is also limited to accounts + opportunities).

**Implementation:** Add `DELETE /api/v1/{entityType}/{id}` with soft-delete (set `deletedAt` timestamp, exclude from queries by default, hard-delete after 30 days). Return 204 No Content on success.

### 10.2 No Bulk Operations

**The gap:** No batch create/update/delete endpoints. Max 25 records per page for reads. To create 1,000 contacts, you make 1,000 sequential POST requests.

**How to exploit:** Elevay should offer:
- `POST /api/v1/contacts/batch` accepting an array of up to 1,000 records.
- `POST /api/v1/contacts/batch-update` for bulk field updates with filter criteria.
- Page sizes up to 100 (or 250) for list endpoints.
- Cursor-based pagination for stable iteration over large datasets.

Lightfield's 25/page cap means syncing 10,000 records requires 400 sequential API calls. With 100/page and cursor pagination, Elevay needs 100 calls. With a bulk endpoint, it needs 10 calls.

### 10.3 No Search API

**The gap:** Full-text search is only available via the chat agent or basic field filtering on list endpoints. The API has no `POST /v1/search` endpoint for cross-entity full-text search.

**How to exploit:** Elevay should expose `GET /api/v1/search?q=term&types=accounts,contacts` that searches across all entity types using our existing search infrastructure. This is table stakes for integrations that need to find records by keyword.

### 10.4 No Activity/Audit Log API

**The gap:** The UI shows an activity feed on each record ("Martin Paviot created the note...", "Lightfield set About their business...") but there is no API endpoint to read activity logs programmatically.

**How to exploit:** `GET /api/v1/activities?accountId=xxx&limit=50` returning timestamped, attributed change events. This is critical for compliance, debugging, and building external dashboards.

### 10.5 Enrichment Accuracy ~20-40%

**The gap (from our testing):**
- LinkedIn matching: ~20% accuracy. GulfTech matched to a Saudi food processing company. TechFlow matched to a UK company instead of French. NovaTech matched to a large enterprise instead of a seed startup.
- Industry: ~40% accuracy.
- Revenue/headcount: ~30% accuracy.

**How to exploit:** Our waterfall enrichment with multi-provider cross-validation should produce significantly better accuracy. Measure and publish accuracy metrics. If we can demonstrate 70%+ accuracy vs their 20-40%, this is a concrete competitive claim.

**Specific improvements:**
- Use domain + name + country for matching (Lightfield appears to use domain only).
- Cross-validate enrichment across providers before committing.
- Flag low-confidence enrichments for human review instead of silently committing wrong data.
- Never overwrite user-provided data with enrichment data (Lightfield appears to do this in some cases).

### 10.6 Note Content Recall Failure

**The gap (from our testing, Query 21):** The agent found note titles but failed to read note content. When asked about a specific note, it could identify that the note existed but could not retrieve its body text.

**How to exploit:** Ensure our chat agent can always retrieve full content for any entity it references. This means:
- Full note content in the agent's context when a note is mentioned.
- Embedding-based retrieval that indexes note content, not just titles.
- Test this explicitly in our eval suite.

### 10.7 Growth Tier Feature Gating

**The gap:** Features Lightfield gates behind their custom-priced Growth tier overlap heavily with Elevay's core value proposition:
- Account scoring
- Automated sequencing
- Email deliverability
- Warm intro paths

**How to exploit:** Offer these features at our base tier. Lightfield's $79/user/mo Startup tier does not include scoring or sequences. If Elevay offers ML scoring + email sequences at a comparable price point, we directly undercut their Growth tier pricing.

**Positioning:** "Everything Lightfield charges enterprise prices for, Elevay includes from day one." Specifically:
- ML lead scoring (our scoring model trainer already exists).
- Signal-based prioritization (our signal detectors already exist).
- Email sequences (our sequence/campaign system already exists).

### 10.8 No Webhook Registration API

**The gap:** Webhooks are only configurable through the Workflow builder UI. There is no `POST /v1/webhooks` endpoint to register webhook subscriptions programmatically.

**How to exploit:** `POST /api/v1/webhooks` with event type filtering, URL, secret for signature verification, and retry policy. This is essential for any integration that needs real-time event delivery without polling.

---

## Summary: Implementation Priority

| # | Pattern | Effort | Impact | Priority |
|---|---------|--------|--------|----------|
| 1 | Skills System | Large | Critical differentiator | P0 |
| 2 | Knowledge Layer | Small | Enables Skills, teachability | P0 |
| 3 | Auto-enrichment on create | Small | Zero-friction data entry | P1 |
| 4 | AI-generated summary fields | Medium | Intelligence layer | P1 |
| 5 | $-prefixed system fields | Small | API clarity | P1 (when building public API) |
| 6 | Definitions endpoints | Small | Self-describing API | P1 (when building public API) |
| 7 | Idempotency keys | Medium | Reliability | P1 (when building public API) |
| 8 | Custom fields (JSONB) | Medium | Extensibility without custom objects | P2 |
| 9 | Bulk API endpoints | Medium | Competitive advantage over Lightfield | P2 |
| 10 | MCP Server | Large | Platform play | P2 |
| 11 | Entity ID prefixes | Small | Developer experience | P2 |
| 12 | Version header | Small | API evolution | P2 |
| 13 | Visual workflow builder | Large | Accessibility | P3 |
| 14 | Privacy-aware meetings | Small (column only) | Future-proofing | P3 |
| 15 | Model-agnostic abstraction | Medium | Code only, no UI | P3 |
| 16 | Full custom objects | Large | Low demand signal | P4 |
