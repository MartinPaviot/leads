# FINDING-013: Design — MCP API Key Audit Trail

## Approach
Extend the existing `McpApiKeyEntry` type, add an audit log table, and implement rotation warnings.

## Schema Changes

### Extend McpApiKeyEntry (in tenant-settings.ts)
```typescript
interface McpApiKeyEntry {
  id: string;
  label: string;
  keyPrefix: string;
  keyHash: string;
  createdAt: string;
  createdBy: string;       // NEW: user ID
  lastUsedAt: string | null;
  expiresAt: string | null; // NEW: optional hard expiry
}
```

### New Table: mcp_audit_log
```sql
CREATE TABLE mcp_audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  method TEXT NOT NULL,
  source_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX mcp_audit_log_tenant_idx ON mcp_audit_log(tenant_id, created_at DESC);
```

## Changes to api/mcp/route.ts

### Authentication
After successful key match, insert into `mcp_audit_log` (fire-and-forget, same as existing lastUsedAt update).

### Rotation Warning
After auth, check `createdAt` age. If >90 days, add `X-Key-Rotation-Due: true` header to response.

## Changes to api/mcp/keys/ endpoints
- POST (create): require authenticated session, store `createdBy` from session user
- GET (list): include `createdBy`, computed `age`, `rotationDue` fields
- No changes to DELETE (revoke)

## Performance Note
The O(n*m) bcrypt scan is a known limitation flagged in the code comments. Not addressed in this spec (separate optimization).
