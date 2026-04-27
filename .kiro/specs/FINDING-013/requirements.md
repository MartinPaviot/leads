# FINDING-013: MCP API Key Audit Trail

## User Story
As a platform admin, I want to know which tenant created each MCP API key and when keys were last rotated so that I can enforce key hygiene and investigate incidents.

## Current State
- `api/mcp/route.ts` authenticates keys via bcrypt comparison against `tenants.settings.mcpApiKeys[]`.
- Each key entry has `id`, `keyPrefix`, `keyHash`, `createdAt`, `lastUsedAt`, `label`.
- No field records which user created the key.
- No key rotation enforcement (no `expiresAt`, no age warning).
- Keys are stored inside the tenant settings JSONB — no separate table, no index, no audit log.
- Authentication iterates all tenants and all keys (O(n*m) bcrypt comparisons).

## Acceptance Criteria

### AC-1: Creator tracked
**When** an MCP API key is created  
**Then** the `createdBy` user ID is stored on the key entry

### AC-2: Key usage logged
**When** an MCP API key is used to authenticate a request  
**Then** an audit log entry records: keyId, tenantId, timestamp, method called, source IP

### AC-3: Rotation enforcement
**When** a key is older than 90 days  
**Then** the API returns a warning header `X-Key-Rotation-Due: true` on every response

### AC-4: Admin can list key metadata
**When** an admin queries the keys endpoint  
**Then** the response includes: keyId, label, prefix, createdAt, createdBy, lastUsedAt, age, rotationDue
