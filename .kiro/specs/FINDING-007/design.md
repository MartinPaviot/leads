# FINDING-007: Design — PostgreSQL RLS

## Architecture
Defense-in-depth: RLS supplements (not replaces) the existing Drizzle `.where(tenantId)` filters.

## Database Changes

### 1. Session Variable
All app connections set `app.current_tenant_id` at transaction start:
```sql
SET LOCAL app.current_tenant_id = '<tenantId>';
```

### 2. RLS Policies (per table)
```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contacts
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
```
Same pattern for `companies`, `deals`, `activities`.

### 3. Roles
- `app_user` role: used by the application, subject to RLS
- Migration/admin connections: use owner role with BYPASSRLS

## Application Changes
- Wrap the Drizzle `db` connection helper to call `SET LOCAL` before each request
- Middleware or per-request wrapper sets the tenant from the authenticated session
- Inngest functions set tenant from event data before DB calls

## Tables Covered (Phase 1)
`contacts`, `companies`, `deals`, `activities` — the four tables with the highest data sensitivity.

## Risk
Medium. Requires careful testing that all code paths set the session variable. Fallback: `current_setting('app.current_tenant_id', true)` returns empty string when unset, which matches no rows (safe default).
