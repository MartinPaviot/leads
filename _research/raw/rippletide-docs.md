# Rippletide Platform Documentation
**Captured**: 2026-03-31

## Overview
Rippletide provides an "authority layer that validates, constrains, or blocks agent actions at runtime."

Three core pillars:
1. **Eval CLI** — Automated testing: spots hallucinations by fact-checking outputs, identifies missing sources
2. **Context Graph** — Persistent memory: facts, decisions, preferences, entity relationships across conversations
3. **Decision Runtime (Hypergraph)** — Deterministic reasoning engine: <1% hallucination rates, full traceability

---

## 1. Agent Evaluation (Eval)

### Core Purpose
Tests AI agents before deployment. Evaluates responses against expected answers, detects hallucinations, gives pass/fail report.

### Four-Step Process
1. **Define Q&A pairs** — via qanda.json, Pinecone, or PostgreSQL
2. **Send questions** — Rippletide sends each question to agent endpoint
3. **Compare responses** — checks factual accuracy, hallucinations, completeness
4. **Review results** — summary metrics + dashboard at trust.rippletide.com

### Evaluation Criteria
- **Factual accuracy** — does response match expected facts?
- **Hallucination detection** — contains info absent from knowledge base?
- **Completeness** — covers all key points?

### Report Structure
Each evaluation produces:
- Label: pass/fail
- Justification text
- Per-fact accuracy tagging (correct vs hallucinated)

### Access Methods
- **CLI** — interactive terminal, real-time progress, templates
- **API** — separate eval server, x-api-key auth (distinct from SDK API at agent.rippletide.com/api/sdk)

### API Endpoints (from llms.txt)
- Agent management: create, list, get, update, delete agents
- Agent config: create/delete/get knowledge entries and guardrails
- Knowledge import: from URL or PDF upload
- Sessions: create, messages, hallucination check, quick-chat
- Test prompts: CRUD + run tests
- Test results: get, reset
- Optimization: create/manage items, generate QA pairs from facts

---

## 2. Context Graph (MCP)

### Core Concept
Persistent memory for AI agents across conversations. "Without it, your agent forgets everything between sessions."

### Architecture
1. AI Assistant (Cursor, Claude, etc.) calls memory tools
2. MCP (Model Context Protocol) transport
3. Context Graph API handles reads/writes
4. Agent's Context Graph stores entities, memories, relationships

Each agent gets isolated context graph — no memory leakage between projects.

### 7 MCP Tools

**remember(content, category, entities?, confidence?, sourceText?)**
- Categories: fact, preference, intent, decision, context
- Persists information to graph

**recall(query, limit?)**
- Searches stored memories by keyword
- Default limit: 10
- "Always recall() before answering fact-based questions"

**get_context(entity_name)**
- Retrieves complete entity details
- Returns all memories, relations, attributes

**list_entities(type?)**
- Types: Person, Organization, Product, Amount, Date, Location, Concept, Decision, Action
- Enumerates known entities

**relate(source, target, relation_type)**
- Types: works_at, wants, has, is_a, related_to, caused, approved, declined, lives_in, resulted_in, mentioned_with
- Creates entities automatically if they don't exist

**invalidate(memory_id, reason?)**
- Marks memories as outdated
- Excluded from future recall but history preserved

**switch_agent(agent_id)**
- Redirects tool calls to another agent's graph

### 4 Read-Only Resources
- `graph://entities` — complete entity inventory
- `graph://memories` — active (non-invalidated) memories
- `graph://relations` — current relationship mappings
- `graph://stats` — graph metrics and counts

### Configuration
- Hosted: `https://mcp.rippletide.com/mcp?agentId=YOUR_ID`
- Self-hosted: configurable backend URL, transport, port, host, log level
- Transport modes: stdio (subprocess) or HTTP (standalone)
- For Claude Code: add to `.mcp.json` at project root

### Setup Steps
1. Get Agent ID from trust.rippletide.com playground (terminal icon)
2. Add to MCP config: `{"type": "http", "url": "https://mcp.rippletide.com/mcp?agentId=YOUR_ID"}`
3. Add system prompt instructions for tool usage
4. Verify: 7 tools + 4 resources available

---

## 3. Decision Runtime (Hypergraph)

### Core Concept
Deterministic reasoning engine. LLM handles language, deterministic engine manages all decisions.
- <1% hallucination rate
- Full explainability on every answer
- Every decision traces to specific knowledge node

### Four Building Blocks
1. **Q&A Pairs** — foundation of agent knowledge
2. **Tags** — topic-based labels for organization + retrieval
3. **Actions** — operations beyond answering (tickets, returns, escalation)
4. **State Predicates** — rules for conversation flow and transitions

### When to Use
- Guaranteed accuracy needed
- Full traceability required
- Engine-level guardrails (not prompt-based)
- Customer-facing: support, sales, onboarding

---

## 4. Coding Agents Integration

### Problem Solved
CLAUDE.md rules consume context window + team silos. Rippletide stores standards in centralized Context Graph.

### Features
- **Setup**: single command auth, repo scan, rule selection, hook install
- **Rule-guided coding**: rules auto-injected, violations blocked pre-execution
- **Rule management**: add/edit/delete with natural language
- **Rule sharing**: distribute via email + OTP
- **Planning**: plans auto-reviewed against rules

### Technical Implementation
Hooks in `.claude/hooks/`:
- `fetch-rules.sh` (UserPromptSubmit): queries backend, injects relevant rules
- `check-code.sh` (PreToolUse): validates code before edit/write

### Connect Command
`npx rippletide-code` → 5 steps:
1. Email auth + OTP verification
2. Repository scan (languages, CLAUDE.md, structure)
3. Rule generation (from sessions + stack + defaults)
4. Rule selection (interactive)
5. Hook installation (.claude/ directory)

### Files Created
- `.claude/hooks/` — shell scripts for rules, checking, management
- `.claude/settings.json` + `settings.local.json` — hook config
- `.claude/commands/` — command definitions (/plan)
- `CLAUDE.md` — auto-generated instructions
- `.rippletide/selected-rules.md` — chosen rules

---

## 5. SDK API Reference
Base: `https://agent.rippletide.com/api/sdk`

### Agent API
- CRUD agents, summaries, user input collections

### Chat API
- Send messages, get runs, detailed run data

### Q&A API
- CRUD Q&A pairs, list by workspace or agent

### Actions API
- CRUD actions per agent

### Guardrails API
- CRUD guardrails, per-agent or global

### Tool Calls API
- Add/get tool calls, format answers, guardrail variables, test tools

---

## 6. Trust Platform
Dashboard at trust.rippletide.com for evaluating, building, deploying agents.

### Integrations
- **Amazon Bedrock**: bring knowledge bases into Rippletide
- **MCP**: create agent and integrate into any MCP client in <2 minutes

---

## Key URLs
- Docs: https://docs.rippletide.com
- Trust platform: https://trust.rippletide.com
- MCP endpoint: https://mcp.rippletide.com/mcp?agentId=AGENT_ID
- SDK API: https://agent.rippletide.com/api/sdk
- Eval API: separate server, x-api-key auth
