# Custom Skills Builder — Design

## System Fit

This feature extends the existing skill infrastructure (`src/skills/`) to support user-defined skills stored in the database. The hardcoded skills continue to work as "system" skills. Custom skills are executed by the same AI agent (chat route) but with dynamic prompts constructed from the skill definition.

## Data Model

### New table: `custom_skills`

```sql
CREATE TABLE custom_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_by UUID NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'workspace')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  steps JSONB NOT NULL DEFAULT '[]',
  constraints JSONB DEFAULT '[]',
  parameters JSONB DEFAULT '[]',
  output_format TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_custom_skills_tenant ON custom_skills(tenant_id);
CREATE INDEX idx_custom_skills_scope ON custom_skills(tenant_id, scope);
CREATE INDEX idx_custom_skills_created_by ON custom_skills(created_by);
```

### Steps schema (JSONB)

```typescript
interface SkillStep {
  order: number;
  instruction: string; // Natural language instruction
  toolHint?: string;   // Optional: suggest which tool to use
}
```

### Parameters schema (JSONB)

```typescript
interface SkillParameter {
  name: string;       // e.g., "account_name"
  description: string;
  required: boolean;
  defaultValue?: string;
}
```

### Constraints schema (JSONB)

```typescript
interface SkillConstraint {
  instruction: string; // e.g., "Never mention competitor pricing"
}
```

## API Contracts

### `GET /api/settings/skills`
Returns all skills visible to the current user (system + workspace + user).

Response:
```json
{
  "skills": [
    {
      "id": "uuid",
      "name": "Qualify Inbound Lead",
      "slug": "qualify-inbound-lead",
      "description": "...",
      "category": "custom",
      "scope": "user|workspace|system",
      "steps": [...],
      "constraints": [...],
      "parameters": [...],
      "isEditable": true,
      "useCount": 12,
      "lastUsedAt": "2026-05-01T..."
    }
  ]
}
```

### `POST /api/settings/skills`
Create a new custom skill.

Body:
```json
{
  "name": "Qualify Inbound Lead",
  "description": "Qualify an inbound lead using our ICP criteria",
  "scope": "user",
  "category": "scoring",
  "steps": [
    { "order": 1, "instruction": "Look up the contact and their company" },
    { "order": 2, "instruction": "Check if they match our ICP criteria from Knowledge" },
    { "order": 3, "instruction": "Score them 1-10 with reasoning" }
  ],
  "constraints": [
    { "instruction": "Always check company size and industry" }
  ],
  "parameters": [
    { "name": "contact_email", "description": "Email of the lead to qualify", "required": true }
  ],
  "outputFormat": "Score (1-10) with bullet-point reasoning"
}
```

### `PUT /api/settings/skills/[id]`
Update an existing custom skill (owner or admin only).

### `DELETE /api/settings/skills/[id]`
Delete a custom skill (owner or admin only).

### `POST /api/skills/custom/[slug]`
Execute a custom skill. Used by the chat agent internally.

Body:
```json
{
  "parameters": { "contact_email": "john@acme.com" },
  "context": { "chatThreadId": "..." }
}
```

## Data Flow

```
User creates skill in UI
  → POST /api/settings/skills
  → Insert into custom_skills table
  → Slug generated from name

User types "run Qualify Inbound Lead on john@acme.com" in chat
  → Chat route receives message
  → Tool router detects skill invocation pattern
  → Loads custom skill by name/slug match
  → Constructs dynamic system prompt from skill definition:
    - Steps as numbered instructions
    - Constraints as rules
    - Knowledge entries injected as context (via embedding search on skill description + step text)
    - Parameters extracted from user message or prompted
  → Agent executes using available tools
  → Results streamed back to chat
  → Increment use_count, update last_used_at
```

## Integration with Existing Skill Infrastructure

The `listSkills()` function in `registry.ts` is extended to also query the database for custom skills. Custom skills are wrapped in a `SkillDefinition`-compatible interface where the `handler` is a generic "execute via LLM" function that:

1. Builds a prompt from the skill's steps/constraints/parameters
2. Retrieves relevant Knowledge entries
3. Calls the chat agent with the constructed prompt and available tools
4. Returns structured output

## Failure Handling

- If a step fails, the agent reports which step failed and why, then continues to the next step (unless the constraint says "stop on failure")
- If the skill references a tool the user lacks access to, the capability resolver blocks it and the agent explains the limitation
- Skill execution has a 120-second timeout (same as chat)
- Failed executions are logged with error details for debugging

## Security

- Custom skills can only use tools the user already has access to (enforced by capability resolver)
- Skill definitions are sanitized for prompt injection (steps/constraints are treated as user instructions, not system-level)
- Workspace skills are admin-only for write operations
- Rate limit: 10 skill executions per minute per user
