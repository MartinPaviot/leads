# Lightfield "Agentic Ready" Teardown

*Researched: 2026-05-01*

## What "Agentic Ready" Means for Lightfield

Lightfield positions itself as "the most agentic CRM" through 6 interlocking capabilities that make the platform both an agentic product (AI does work for you) AND an agentic platform (external AI agents can use it as a tool).

---

## The 6 Pillars of Lightfield's Agentic Architecture

### Pillar 1: Skills System
**What it is**: Repeatable workflows users define once and invoke on demand. The agent follows defined steps and constraints consistently.

**Three levels:**
- **System Skills** (platform-maintained, read-only): Find Similar Companies, Build Prospect List, Resurrect Lost Deals, Research & Write Outreach, Map Buying Committee, Find Next Best Action, Extract Buyer Language, Meeting Brief, Post-Meeting Follow-Up, Create/Update Opportunity from Meeting, Draft Proposal, Draft Sales Deck, Qualify Deal, Account Health Score, Generate Pipeline Report, Draft Case Study
- **Workspace Skills** (admin-managed, shared): Custom skills for team processes
- **User Skills** (personal): Individual workflows for testing/customization

**Key design decisions:**
- Skills are teachable, not coded — users describe task/steps/constraints in natural language
- Skills invoke the full agent toolset (search, create, update, email, enrich)
- Skills reference Knowledge for context
- Recently used skills view for quick access
- "If you've given the same instructions to a new hire three times, that's a Skill"

### Pillar 2: Knowledge Layer
**What it is**: Structured context that Skills reference during execution. Stable business information that doesn't change frequently.

**Examples:**
- ICP definition
- Competitive positioning
- Objection handling playbooks
- Product messaging
- Discovery frameworks
- Company context

**Key design decisions:**
- Knowledge is separate from Skills (reusable across many skills)
- Workspace-level and user-level knowledge
- The agent draws on relevant knowledge automatically during skill execution
- "If you keep re-explaining the same company context before each task, that's Knowledge"

### Pillar 3: MCP Server (External Agent Interop)
**What it is**: Model Context Protocol server that exposes Lightfield as a tool for external AI agents (Claude, Cursor, custom agents).

**Capabilities:**
- Read context to answer questions
- Create/update records
- User parity permissions (agent inherits the user's access)
- Authentication via API keys

**Why it matters:** Makes Lightfield a platform, not just a product. Any AI agent in any IDE or tool can use the CRM as a data source and action target.

### Pillar 4: Code Execution
**What it is**: The agent can write Python scripts, execute them in a sandbox, evaluate results, and iterate.

**Architecture:**
- Python execution in sandboxed environment
- Agent plans approach → writes script → runs in sandbox → evaluates → iterates
- Processes thousands of records in seconds using data libraries
- Sub-agent composition (dispatch sub-agents for per-account analysis, aggregate results)
- Outputs: structured reports, visualizations, scorecards, dashboards
- 10x performance improvements on upgraded sandbox

**Use cases:**
- Pipeline analysis across thousands of records
- Custom scoring algorithms
- Sentiment analysis at scale
- Board-ready report generation
- Data transformation and cleanup

### Pillar 5: REST API + SDKs
**What it is**: Public API for programmatic access to CRM data.

**Current state:**
- HTTP endpoints + Python SDK + TypeScript SDK (npm: `lightfield`)
- CRUD on Accounts, Contacts, Opportunities, Tasks
- Members (read-only)
- Custom fields supported on all objects
- Docs at docs.lightfield.app

**Key design principle:** "Every interaction — whether it's a human in the UI, an agent updating an opportunity, or an external system — operates through shared tools, ensuring consistent data structures across all users."

**Activity audit:** Record activity logs identify change sources (API, workflows, agent, human).

### Pillar 6: Agentic Import
**What it is**: CSV import powered by an agent that reads, infers structure, proposes mapping, and executes.

**Flow:**
1. User uploads CSV to chat
2. Agent reads and infers structure (contacts, companies, deals, custom fields)
3. Agent proposes mapping
4. User reviews and confirms
5. Agent executes: creates fields, configures stages, imports records, wires relationships

**Capabilities:**
- 90,000 records/hour
- Automatic deduplication
- Multi-file stitching (separate CSVs for companies, contacts, deals)
- Retry-safe (re-running won't create duplicates)
- Post-import enrichment (email/calendar history, call transcripts)
- Long-running task infrastructure with progress logging and status indicators

---

## Gap Analysis: Elevay vs Lightfield Agentic

| Capability | Lightfield | Elevay | Gap |
|---|---|---|---|
| **System Skills** (pre-built) | 16+ categorized | 25+ skills | ✅ Ahead |
| **Custom Skills Builder** | Users create via NL | Hardcoded only | ❌ Critical gap |
| **Knowledge Layer** | Dedicated system | ICP settings only | ❌ Critical gap |
| **MCP Server** | Full CRUD + auth | Basic implementation | ⚠️ Needs audit |
| **Code Execution** | Python sandbox | None | ❌ Critical gap |
| **REST API** | HTTP + Python + TS SDK | 200+ internal routes | ⚠️ Not public/documented |
| **Agentic Import** | Agent-driven CSV flow | Basic import | ❌ Critical gap |
| **Workflow Builder** | Agent steps + triggers | 11 triggers, 8+ actions | ✅ Comparable |
| **Agent as First-Class User** | Activity audit trail | Partial | ⚠️ Needs improvement |
| **Long-Running Tasks** | Progress + resume | Not implemented | ❌ Gap |

## Implementation Priority (by impact on "agentic ready" positioning)

1. **Custom Skills Builder + Knowledge Layer** — Highest differentiator. Makes the product teachable.
2. **Agentic Import** — First impression feature. Every user imports data.
3. **Code Execution Sandbox** — Power-user feature. Enables pipeline analysis at scale.
4. **Public API Documentation + SDK** — Platform play. External agents need this.
5. **Long-Running Task Infrastructure** — Enables reliable agentic operations.
6. **MCP Server Hardening** — Already exists, needs completeness audit.

---

## Sources

- [Lightfield Homepage](https://lightfield.app/)
- [Agentic Data Import](https://lightfield.app/blog/agentic-data-import-in-lightfield)
- [Code Execution in Lightfield](https://lightfield.app/blog/code-execution-in-lightfield)
- [REST API & Agentic CSV Import](https://lightfield.app/blog/rest-api-agentic-csv-import)
- [Skills and Knowledge, MCP](https://lightfield.app/blog/skills-knowledge-mcp-performance-improvements)
- [Introducing Skills](https://lightfield.app/blog/introducing-skills)
- [How to Use Skills & Knowledge](https://lightfield.app/blog/how-to-skills-knowledge)
- [Introducing the Lightfield API](https://lightfield.app/blog/introducing-the-lightfield-api)
- [Reevo vs Lightfield](https://lightfield.app/blog/reevo-vs-lightfield)
- [SaaStr AI App of the Week: Lightfield](https://www.saastr.com/saastr-ai-app-of-the-week-lightfield-the-ai-native-crm-that-killed-tomes-25-million-users-to-build-something-better/)
