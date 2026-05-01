# Custom Skills Builder — Tasks

## Task 1: Database migration for custom_skills table
- Add `custom_skills` table to Drizzle schema (`db/schema.ts`)
- Create migration with `npx drizzle-kit generate`
- Run migration
- **Verify**: `SELECT * FROM custom_skills` returns empty result set
- **Test**: schema validation test for new table

## Task 2: Custom skills CRUD API
- Create `src/app/api/settings/skills/route.ts` (GET, POST)
- Create `src/app/api/settings/skills/[id]/route.ts` (PUT, DELETE)
- GET: return system skills (from registry) + workspace skills + user skills
- POST: create with slug generation, validation, scope enforcement
- PUT: owner/admin check, update fields
- DELETE: owner/admin check, soft delete via is_active=false
- **Verify**: curl/test all 4 endpoints
- **Test**: unit tests for CRUD operations, permission checks, validation

## Task 3: Custom skill executor
- Create `src/skills/custom-executor.ts`
- Build dynamic prompt from skill definition (steps, constraints, parameters, knowledge)
- Integrate with Knowledge API to fetch relevant entries
- Call chat agent with constructed prompt + filtered tools
- Return structured SkillResult
- **Verify**: execute a test skill via API and check output
- **Test**: unit test for prompt construction, knowledge injection, parameter substitution

## Task 4: Chat tool router integration
- Update `src/lib/chat/tool-router.ts` to detect skill invocation patterns ("run X", "execute X", skill name mentions)
- Add `runCustomSkill` tool to the skills tool category
- Load matching custom skill from DB when detected
- Pass to custom executor
- **Verify**: type "run [skill name]" in chat and verify execution
- **Test**: intent detection tests for various invocation patterns

## Task 5: Skills settings page UI
- Create `src/app/(dashboard)/settings/skills/page.tsx`
- List all skills (system + workspace + user) grouped by scope
- System skills: read-only with "System" badge
- Create skill form: name, description, steps (ordered list with drag-to-reorder), constraints, parameters, output format, scope selector
- Edit/delete for owned skills
- Recently used section at the top
- **Verify**: create, edit, delete a skill through the UI
- **Test**: component rendering tests

## Task 6: Skill invocation from chat panel
- Add skill picker to chat input (button or "/" command)
- Show recently used skills first, then all available
- On select, pre-fill chat with "Run [skill name]" + parameter prompts
- **Verify**: invoke a skill from chat picker and see results
- **Test**: interaction test for skill picker

## Task 7: Usage tracking and analytics
- Increment use_count and update last_used_at on each execution
- Add skill execution to activity audit trail (source: "skill")
- **Verify**: run a skill 3 times, check use_count = 3
- **Test**: counter increment test

## Task 8: Limits and validation
- Enforce 50 custom skills per user, 100 per workspace
- Validate: name required, at least 1 step, slug uniqueness
- Name collision handling: auto-suffix
- Step count limit: max 20 steps per skill
- **Verify**: try to create skill #51 and get rejection
- **Test**: validation edge case tests
