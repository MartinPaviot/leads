// Account lists — user-curated, static collections of accounts (companies).
// A list is a named bag of company ids the user selects on the Accounts page;
// it then renders as a selectable chip next to the source tabs (All / Sourced /
// Added) and scopes the list to its members. Distinct from `segments` (campaign
// segmentation: ICP version + archetype + definition AST) and from `call_lists`
// (call-queue audiences): an account list is a manual, membership-based grouping
// with no targeting semantics.
import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { tenants, users, companies } from "./core";

export const accountLists = pgTable(
  "account_lists",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    /** Who created the list (the curator). NULL when the creator is unknown. */
    ownerId: text("owner_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("account_lists_tenant_idx").on(table.tenantId),
    // One list name per tenant — a second "Hot leads" updates the first.
    uniqueIndex("account_lists_tenant_name_idx").on(table.tenantId, table.name),
  ],
);

export const accountListMembers = pgTable(
  "account_list_members",
  {
    listId: text("list_id")
      .references(() => accountLists.id, { onDelete: "cascade" })
      .notNull(),
    companyId: text("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Membership is a set — one row per (list, company). The PK is also the
    // lookup index the accounts-list `fList` subquery hits.
    primaryKey({ columns: [table.listId, table.companyId] }),
    index("account_list_members_company_idx").on(table.companyId),
  ],
);
