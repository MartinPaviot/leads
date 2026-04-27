# FINDING-007: PostgreSQL Row-Level Security on Critical Tables

## User Story
As a security engineer, I want RLS policies enforcing tenant isolation at the database level so that a bug in application code cannot leak data across tenants.

## Current State
All tenant isolation is app-layer only: every query includes `.where(eq(table.tenantId, tenantId))`. A single missed filter or raw SQL query could expose cross-tenant data. No RLS policies exist on any table.

## Acceptance Criteria

### AC-1: RLS enabled on critical tables
**When** a database session does not set `app.current_tenant_id`  
**Then** SELECT/INSERT/UPDATE/DELETE on `contacts`, `companies`, `deals`, `activities` return zero rows (denied by policy)

### AC-2: Correct tenant access
**When** a database session sets `SET LOCAL app.current_tenant_id = '<tenant>'`  
**Then** queries on protected tables return only rows matching that tenant_id

### AC-3: Migration is non-breaking
**When** the RLS migration runs on the existing database  
**Then** all existing application queries continue to work (the app connection sets the session variable)

### AC-4: Admin bypass exists
**When** a superuser or migration runner connects  
**Then** RLS does not block administrative operations (uses BYPASSRLS role or separate role)
