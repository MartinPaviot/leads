/**
 * Custom field definitions and utilities for schema-less data model.
 * Fields are defined per-tenant in tenants.settings.customFields
 * and stored in entity JSONB `properties` columns.
 */

export interface CustomFieldDef {
  id: string;
  name: string;
  type: FieldType;
  entityType: "company" | "contact" | "deal";
  aiFillMode: "off" | "suggest" | "auto";
  options?: string[];
  required: boolean;
}

export type FieldType =
  | "text"
  | "date"
  | "number"
  | "single_select"
  | "multi_select"
  | "url"
  | "social_handle"
  | "address"
  | "markdown";

export interface PipelineStageDef {
  id: string;
  name: string;
  description: string;
  category: "in_progress" | "done";
  aiFillMode: "auto" | "suggest" | "off";
}

/** Format a custom field value for display */
export function formatFieldValue(
  value: unknown,
  type: FieldType
): string {
  if (value == null || value === "") return "—";

  switch (type) {
    case "date":
      try {
        return new Date(value as string).toLocaleDateString();
      } catch {
        return String(value);
      }
    case "number":
      return typeof value === "number"
        ? value.toLocaleString()
        : String(value);
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "url":
      return String(value);
    case "social_handle":
      return String(value).startsWith("@")
        ? String(value)
        : `@${value}`;
    default:
      return String(value);
  }
}

/** Get a property value from an entity's properties JSONB */
export function getCustomFieldValue(
  properties: Record<string, unknown> | null | undefined,
  fieldId: string
): unknown {
  if (!properties) return undefined;
  // Custom fields stored under properties.customFields.{fieldId}
  const customFields = properties.customFields as
    | Record<string, unknown>
    | undefined;
  return customFields?.[fieldId];
}

/** Set a custom field value in properties object (returns new object) */
export function setCustomFieldValue(
  properties: Record<string, unknown> | null | undefined,
  fieldId: string,
  value: unknown
): Record<string, unknown> {
  const props = { ...(properties || {}) };
  const customFields = {
    ...((props.customFields as Record<string, unknown>) || {}),
  };
  customFields[fieldId] = value;
  props.customFields = customFields;
  return props;
}

/** Get built-in fields for each entity type (for display in data model page) */
export function getBuiltInFields(entityType: "company" | "contact" | "deal") {
  switch (entityType) {
    case "company":
      return [
        { name: "Name", type: "text", system: true },
        { name: "Domain", type: "url", system: true },
        { name: "Industry", type: "text", system: true },
        { name: "Size", type: "single_select", system: true },
        { name: "Revenue", type: "single_select", system: true },
        { name: "Description", type: "markdown", system: true },
        { name: "Score", type: "number", system: true },
      ];
    case "contact":
      return [
        { name: "First Name", type: "text", system: true },
        { name: "Last Name", type: "text", system: true },
        { name: "Email", type: "text", system: true },
        { name: "Title", type: "text", system: true },
        { name: "Phone", type: "text", system: true },
        { name: "LinkedIn URL", type: "url", system: true },
        { name: "Score", type: "number", system: true },
      ];
    case "deal":
      return [
        { name: "Name", type: "text", system: true },
        { name: "Stage", type: "single_select", system: true },
        { name: "Value", type: "number", system: true },
        { name: "Summary", type: "markdown", system: true },
        { name: "Close Date", type: "date", system: true },
      ];
  }
}
