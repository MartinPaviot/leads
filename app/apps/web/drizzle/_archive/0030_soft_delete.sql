-- 0030: Add soft delete support to core CRM tables
-- Adds deleted_at column (nullable TIMESTAMPTZ) to contacts, companies, deals,
-- activities, notes, and tasks. NULL = live row, non-NULL = soft-deleted.

ALTER TABLE contacts ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE companies ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE deals ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE activities ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE notes ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial indexes: queries that filter WHERE deleted_at IS NULL (the common case)
-- skip soft-deleted rows without scanning them. Partial indexes only index live
-- rows, keeping the index small and inserts fast.
CREATE INDEX idx_contacts_tenant_not_deleted ON contacts (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_tenant_not_deleted ON companies (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_tenant_not_deleted ON deals (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_activities_tenant_not_deleted ON activities (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_tenant_not_deleted ON notes (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_tenant_not_deleted ON tasks (tenant_id) WHERE deleted_at IS NULL;
