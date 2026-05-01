# Custom Skills Builder — Requirements

## User Story

**As a** founder using Elevay,
**I want to** create my own reusable Skills from natural language descriptions,
**so that** the AI agent follows my exact process every time without me re-explaining it.

## Context

Lightfield's key "agentic ready" differentiator: users define Skills (task + steps + constraints) in natural language. The agent executes them consistently. Three levels: System (platform), Workspace (admin-shared), User (personal).

Elevay already has 25+ hardcoded skills in `src/skills/`. This feature adds user-created custom skills that leverage the same runner infrastructure but are defined in the database, not in code.

## Acceptance Criteria

### AC-1: Create a custom skill via settings UI
**GIVEN** the user navigates to Settings > Skills
**WHEN** they click "Create Skill" and fill in name, description, steps (natural language), constraints, and category
**THEN** the skill is saved to the database with scope "user" (personal) or "workspace" (admin only)
**AND** the skill appears in the skills list immediately

### AC-2: Invoke custom skill from chat
**GIVEN** a user has created a custom skill named "Qualify Inbound Lead"
**WHEN** they type "run Qualify Inbound Lead on contact X" in chat
**THEN** the agent detects the skill invocation, loads the skill definition, and executes the steps using available chat tools
**AND** the agent follows the constraints defined in the skill

### AC-3: Skills reference Knowledge
**GIVEN** a custom skill has step "Use our ICP criteria to qualify"
**AND** there is a Knowledge entry with topic "ICP Criteria" containing the company's ICP definition
**WHEN** the skill executes
**THEN** the agent retrieves and uses the relevant Knowledge content as context for that step

### AC-4: Skill scoping and permissions
**GIVEN** an admin creates a workspace-level skill
**WHEN** any team member opens their skills list
**THEN** they see the workspace skill alongside their personal skills and system skills
**AND** only admins can edit/delete workspace skills
**AND** each user can only edit/delete their own personal skills

### AC-5: Skill parameters
**GIVEN** a skill definition includes parameter placeholders like {{account_name}} or {{contact_email}}
**WHEN** the user invokes the skill
**THEN** the agent prompts for or extracts the required parameters from context
**AND** substitutes them into the skill steps before execution

### AC-6: Recently used skills
**GIVEN** a user has run skills in the past
**WHEN** they open the skills panel or type "/" in chat
**THEN** recently used skills appear at the top for quick access

### AC-7: Pre-built skill library
**GIVEN** the existing 25+ hardcoded skills
**WHEN** a user views the skills list
**THEN** system skills appear as read-only with a "System" badge
**AND** their definitions are visible but not editable

## Edge Cases

- Skill with no steps → reject at creation with validation error
- Skill name collision → append "(2)" suffix automatically
- Skill references a tool the user doesn't have access to (e.g., Pro-tier tool) → fail gracefully with explanation
- Skill with circular step references → detect and reject
- Maximum 50 custom skills per user, 100 per workspace
- Skill step that produces no output → agent reports "Step produced no results" and continues
