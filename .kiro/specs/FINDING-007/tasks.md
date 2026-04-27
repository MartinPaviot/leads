# FINDING-007: Tasks

## Task 1: Create Drizzle RLS middleware (~1h)
- Create `app/apps/web/src/db/rls.ts` with a `withTenant(tenantId, callback)` wrapper
- Wrapper acquires a connection, runs `SET LOCAL app.current_tenant_id`, executes callback, releases
- Export as the recommended way to run tenant-scoped queries
- **Verify:** Unit test with mock DB confirming SET LOCAL is called before query

## Task 2: Write SQL migration for RLS policies (~1h)
- Create a Drizzle migration that enables RLS on `contacts`, `companies`, `deals`, `activities`
- Create `tenant_isolation` policy on each table (USING + WITH CHECK on `tenant_id`)
- Create `app_user` role if not exists; GRANT appropriate permissions
- **Verify:** Migration runs successfully on dev database; `\dp` shows policies

## Task 3: Wire tenant context into request lifecycle (~1.5h)
- Update the DB helper used in API routes to set `app.current_tenant_id` from the session
- Update Inngest function wrappers to set tenant context from `event.data.tenantId`
- Ensure admin/migration connections bypass RLS (separate role or BYPASSRLS)
- **Verify:** API route integration test confirms tenant A cannot see tenant B data

## Task 4: Test cross-tenant isolation (~1h)
- Write integration test: create rows for tenant A and tenant B, query with tenant A context, confirm B rows invisible
- Test INSERT with wrong tenant_id is rejected by WITH CHECK
- Test unset session variable returns zero rows
- **Verify:** All isolation tests pass; existing test suite passes unchanged
