# SETTINGS-V2: Requirements

## User Story
As a founder, I want a comprehensive settings page that lets me configure my workspace, manage knowledge, control AI behavior, and customize my pipeline so the product adapts to my business.

## Acceptance Criteria

### AC1: Settings navigation
GIVEN the Settings page
WHEN it loads
THEN I see a left sidebar with Account and Workspace sections

### AC2: Profile settings
GIVEN the Profile section
WHEN I view it
THEN I see my name, email (readonly), and can update my profile

### AC3: Structured Knowledge Base
GIVEN the Knowledge section
WHEN I add a knowledge topic
THEN I can enter a Topic title and Content body
AND the AI includes this context in all requests

### AC4: Multiple knowledge topics
GIVEN the Knowledge section
WHEN I click "Add knowledge"
THEN a new Topic/Content pair appears
AND I can add unlimited topics

### AC5: Remove knowledge topic
GIVEN a knowledge topic
WHEN I click "Remove"
THEN the topic is deleted

### AC6: Agent permissions
GIVEN the Agent section
WHEN I change the approval mode
THEN I can choose "Ask every time" or "Auto-run"

### AC7: Workspace General
GIVEN the General section
WHEN I view it
THEN I see workspace name (editable) and company domains (exclusion list)

### AC8: Members
GIVEN the Members section
WHEN I invite a member
THEN I enter their email and select a role (Admin/Member)

### AC9: Opportunity stage descriptions
GIVEN the Opportunity stages section
WHEN I add descriptions to stages
THEN each stage has a name and description that the AI uses for auto-progression

### AC10: Pipeline stages editable
GIVEN the Opportunity stages section
WHEN I edit stage names or add new stages
THEN the pipeline reflects the changes

### AC11: Notifications preferences
GIVEN the Notifications section
WHEN I toggle notification types
THEN I can enable/disable email and in-app notifications per type

### AC12: Settings persistence
GIVEN any settings change
WHEN I save
THEN the change persists across sessions (stored in database)

## Edge Cases
- Empty knowledge topic → don't save
- Duplicate domain in exclusion list → skip
- Last admin tries to change role → prevent
- Stage name empty → don't save
