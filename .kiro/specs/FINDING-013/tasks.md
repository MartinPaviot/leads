# FINDING-013: Tasks

## Task 1: Create mcp_audit_log table (~30min)
- Add `mcpAuditLog` table to `db/schema.ts` with columns: id, tenantId, keyId, method, sourceIp, userAgent, createdAt
- Create Drizzle migration
- Add index on (tenantId, createdAt DESC)
- **Verify:** Migration runs; table created

## Task 2: Extend McpApiKeyEntry and key creation (~1h)
- Add `createdBy` field to `McpApiKeyEntry` type in `tenant-settings.ts`
- Update the key creation endpoint (`api/mcp/keys`) to store `createdBy` from the authenticated session
- Add `expiresAt` optional field for future use
- **Verify:** Create a key via API; confirm `createdBy` is populated

## Task 3: Add audit logging to authentication (~1h)
- In `authenticateMcpRequest()`, after successful key match, insert into `mcp_audit_log`
- Include: tenantId, keyId, method (from JSON-RPC body), source IP (from request headers), user agent
- Fire-and-forget (same pattern as existing lastUsedAt update)
- **Verify:** Make an MCP request; confirm audit log row created

## Task 4: Add rotation warning header (~30min)
- After auth in POST handler, compute key age from `createdAt`
- If age > 90 days, set `X-Key-Rotation-Due: true` header on response
- **Verify:** Test with a key backdated to 91 days ago; confirm header present

## Task 5: Update list-keys response (~30min)
- GET `/api/mcp/keys` response now includes: `createdBy`, `age` (computed), `rotationDue` (boolean)
- **Verify:** List keys API returns enriched metadata
