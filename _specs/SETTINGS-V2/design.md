# SETTINGS-V2: Design

## System Fit
Settings V2 replaces the single-page settings with a multi-section layout matching Lightfield's information architecture. Key additions: structured knowledge base, workspace management, member invites, stage descriptions, notifications.

## Data Model

### tenant_settings table (or extend tenants.settings JSONB)
Use existing `tenants.settings` JSONB field to store:
```typescript
{
  knowledge: Array<{ id: string; topic: string; content: string }>;
  companyDomains: string[];
  notifications: {
    chatMessage: { email: boolean; inApp: boolean };
    taskDue: { email: boolean; inApp: boolean };
    taskAssigned: { email: boolean; inApp: boolean };
    meetingReady: { email: boolean; inApp: boolean };
  };
  agentApprovalMode: "ask" | "auto";
  pipelineStages: Array<{ id: string; name: string; description: string; category: "in_progress" | "done" }>;
}
```

No schema migration needed — uses existing JSONB.

## API Contracts

### GET /api/settings/workspace — Get all workspace settings
### PUT /api/settings/workspace — Update workspace settings
### GET /api/settings/knowledge — Get knowledge topics
### POST /api/settings/knowledge — Add knowledge topic
### DELETE /api/settings/knowledge/[id] — Remove knowledge topic
### GET /api/settings/stages — Get pipeline stages with descriptions
### PUT /api/settings/stages — Update stages
### GET /api/settings/notifications — Get notification preferences
### PUT /api/settings/notifications — Update notification preferences

## UI Structure

Settings page with left sidebar:

**Account**
- Profile (existing, keep)
- Agent (existing "Ask every time" / "Auto-approve", keep)

**Workspace**
- General (workspace name, company domains)
- Members (invite + role dropdown)
- Knowledge (topic/content pairs with add/remove)
- Opportunity Stages (editable stages with descriptions)
- Notifications (per-type email/in-app toggles)
- Pipeline stages (existing, enhanced with descriptions)

## Layout
- Left sidebar: 220px, scrollable, grouped by Account/Workspace
- Content area: max-width 640px, centered
- Each section: heading + subtitle + form elements
