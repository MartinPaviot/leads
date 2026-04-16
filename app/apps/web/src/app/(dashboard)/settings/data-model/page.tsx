"use client";

import { useState, useEffect } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ENTITY_TYPES = ["company", "contact", "deal"] as const;
type EntityType = typeof ENTITY_TYPES[number];

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "single_select", label: "Single Select" },
  { value: "multi_select", label: "Multi Select" },
  { value: "url", label: "URL" },
  { value: "social_handle", label: "Social Handle" },
  { value: "address", label: "Address" },
  { value: "markdown", label: "Markdown" },
] as const;

const AI_FILL_MODES = [
  { value: "off", label: "Off" },
  { value: "suggest", label: "Suggest" },
  { value: "auto", label: "Auto" },
] as const;

interface CustomField {
  id: string;
  name: string;
  type: string;
  entityType: EntityType;
  aiFillMode: string;
  options?: string[];
  required: boolean;
}

export default function DataModelPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEntity, setActiveEntity] = useState<EntityType>("company");
  const [showAdd, setShowAdd] = useState(false);
  const [newField, setNewField] = useState({ name: "", type: "text", aiFillMode: "off", options: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/data-model")
      .then((r) => r.ok ? r.json() : { fields: [] })
      .then((data) => setFields(data.fields || []))
      .catch((e) => console.warn("data-model: fetch failed", e))
      .finally(() => setLoading(false));
  }, []);

  const entityFields = fields.filter((f) => f.entityType === activeEntity);

  // N6 — case-insensitive dupe check across built-in + custom fields
  // for the active entity. Returns the offending field name when a
  // collision exists, or null when the name is free.
  function findDupeName(candidate: string, ignoreId?: string): string | null {
    const normalised = candidate.trim().toLowerCase();
    if (!normalised) return null;
    const builtins = (activeEntity === "company"
      ? ["Name", "Domain", "Industry", "Size", "Revenue", "Description"]
      : activeEntity === "contact"
      ? ["First Name", "Last Name", "Email", "Title", "Phone", "LinkedIn URL"]
      : ["Name", "Stage", "Value", "Summary", "Close Date"]
    ).map((b) => b.toLowerCase());
    if (builtins.includes(normalised)) return candidate.trim();
    const collision = fields.find(
      (f) =>
        f.entityType === activeEntity &&
        f.id !== ignoreId &&
        f.name.toLowerCase() === normalised
    );
    return collision ? collision.name : null;
  }

  async function addField() {
    const name = newField.name.trim();
    if (!name) return;
    const dupe = findDupeName(name);
    if (dupe) {
      setError(`A field named "${dupe}" already exists for ${activeEntity}.`);
      return;
    }
    setSaving(true);
    const field: CustomField = {
      id: crypto.randomUUID(),
      name,
      type: newField.type,
      entityType: activeEntity,
      aiFillMode: newField.aiFillMode,
      options: newField.type.includes("select") ? newField.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      required: false,
    };
    const updated = [...fields, field];
    setFields(updated);
    setNewField({ name: "", type: "text", aiFillMode: "off", options: "" });
    setShowAdd(false);
    await saveFields(updated);
    setSaving(false);
  }

  async function removeField(id: string) {
    const updated = fields.filter((f) => f.id !== id);
    setFields(updated);
    await saveFields(updated);
  }

  async function updateFieldAiMode(id: string, mode: string) {
    const updated = fields.map((f) => f.id === id ? { ...f, aiFillMode: mode } : f);
    setFields(updated);
    await saveFields(updated);
  }

  // N6 — rename an existing custom field with the same dupe guard as
  // addField. Whitespace is trimmed; an empty rename reverts to the
  // original name (so editing accidentally and pressing Enter doesn't
  // wipe the field out).
  async function renameField(id: string, nextName: string) {
    const trimmed = nextName.trim();
    const target = fields.find((f) => f.id === id);
    if (!target) return;
    if (!trimmed || trimmed === target.name) return;
    const dupe = findDupeName(trimmed, id);
    if (dupe) {
      setError(`A field named "${dupe}" already exists for ${activeEntity}.`);
      return;
    }
    setError("");
    const updated = fields.map((f) => (f.id === id ? { ...f, name: trimmed } : f));
    setFields(updated);
    await saveFields(updated);
  }

  // N6 — edit options on an existing select field. Empty list collapses
  // back to a regular text-style display (no options shown). Order is
  // preserved verbatim so the user controls dropdown ordering.
  async function updateFieldOptions(id: string, csv: string) {
    const options = csv
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    setError("");
    const updated = fields.map((f) =>
      f.id === id ? { ...f, options: options.length > 0 ? options : undefined } : f
    );
    setFields(updated);
    await saveFields(updated);
  }

  async function saveFields(fieldsToSave: CustomField[]) {
    setError("");
    try {
      await fetch("/api/settings/data-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fieldsToSave }),
      });
    } catch {
      setError("Failed to save fields");
    }
  }

  return (
    <>
      <h1 className="text-[24px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
        Data Model
      </h1>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        Customize fields for each entity type. The AI reads field descriptions to fill data automatically.
      </p>
      {error && <p className="mt-2 text-[12px]" style={{ color: "var(--color-error)" }}>{error}</p>}

      {/* Entity type tabs */}
      <div className="mt-6 flex gap-1">
        {ENTITY_TYPES.map((entity) => (
          <button key={entity} onClick={() => setActiveEntity(entity)}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition-colors"
            style={{
              background: activeEntity === entity ? "var(--color-accent-soft)" : "transparent",
              color: activeEntity === entity ? "var(--color-accent)" : "var(--color-text-tertiary)",
            }}>
            {entity === "company" ? "Companies" : entity === "contact" ? "Contacts" : "Deals"}
          </button>
        ))}
      </div>

      {/* Built-in fields */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          Built-in fields
        </div>
        <div className="space-y-1">
          {(activeEntity === "company"
            ? ["Name", "Domain", "Industry", "Size", "Revenue", "Description"]
            : activeEntity === "contact"
            ? ["First Name", "Last Name", "Email", "Title", "Phone", "LinkedIn URL"]
            : ["Name", "Stage", "Value", "Summary", "Close Date"]
          ).map((field) => (
            <Card key={field}>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{field}</span>
                  <Badge variant="neutral">Built-in</Badge>
                </div>
                <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Text</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Custom fields */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            Custom fields
          </span>
          <Button variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => setShowAdd(true)}>
            Create field
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-md" />)}
          </div>
        ) : entityFields.length === 0 && !showAdd ? (
          <Card>
            <div className="py-8 text-center">
              <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                No custom fields for {activeEntity === "company" ? "companies" : activeEntity === "contact" ? "contacts" : "deals"}.
              </p>
              <button onClick={() => setShowAdd(true)}
                className="mt-2 text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
                + Create your first field
              </button>
            </div>
          </Card>
        ) : (
          <div className="space-y-1">
            {entityFields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                onRename={(next) => renameField(field.id, next)}
                onUpdateOptions={(csv) => updateFieldOptions(field.id, csv)}
                onUpdateAiMode={(mode) => updateFieldAiMode(field.id, mode)}
                onRemove={() => removeField(field.id)}
              />
            ))}
          </div>
        )}

        {/* Add field form */}
        {showAdd && (
          <Card className="mt-2" style={{ border: "1px solid var(--color-accent)" }}>
            <CardBody>
              <div className="space-y-3">
                <Input
                  label="Field name"
                  value={newField.name}
                  onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                  placeholder="e.g. Funding Round"
                  autoFocus
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Type</label>
                    <div className="relative mt-1">
                      <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                        className="h-8 w-full appearance-none rounded-md px-3 pr-8 text-[12px] outline-none"
                        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}>
                        {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5" style={{ color: "var(--color-text-muted)" }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] font-medium" style={{ color: "var(--color-text-secondary)" }}>AI fill mode</label>
                    <div className="mt-1 flex gap-1">
                      {AI_FILL_MODES.map((mode) => (
                        <button key={mode.value} onClick={() => setNewField({ ...newField, aiFillMode: mode.value })}
                          className="flex-1 rounded-md py-1.5 text-[11px] font-medium transition-colors"
                          style={{
                            background: newField.aiFillMode === mode.value ? "var(--color-accent-soft)" : "var(--color-bg-hover)",
                            color: newField.aiFillMode === mode.value ? "var(--color-accent)" : "var(--color-text-tertiary)",
                            border: newField.aiFillMode === mode.value ? "1px solid var(--color-accent)" : "1px solid var(--color-border-default)",
                          }}>
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {newField.type.includes("select") && (
                  <Input
                    label="Options (comma-separated)"
                    value={newField.options}
                    onChange={(e) => setNewField({ ...newField, options: e.target.value })}
                    placeholder="e.g. Seed, Series A, Series B, Series C"
                  />
                )}
                <div className="flex gap-2">
                  <Button variant="gradient" size="sm" onClick={addField} disabled={!newField.name.trim() || saving}>
                    {saving ? "Creating..." : "Create field"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * N6 — single custom-field row with inline rename + (for select-typed
 * fields) options edit. Local edit-mode buffer so a stray click outside
 * doesn't wipe the user's draft; commit on blur or Enter.
 */
function FieldRow({
  field,
  onRename,
  onUpdateOptions,
  onUpdateAiMode,
  onRemove,
}: {
  field: CustomField;
  onRename: (next: string) => void;
  onUpdateOptions: (csv: string) => void;
  onUpdateAiMode: (mode: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(field.name);
  const [draftOptions, setDraftOptions] = useState((field.options ?? []).join(", "));
  const isSelect = field.type.includes("select");

  function commit() {
    if (draftName !== field.name) onRename(draftName);
    if (isSelect && draftOptions !== (field.options ?? []).join(", ")) {
      onUpdateOptions(draftOptions);
    }
    setEditing(false);
  }

  return (
    <Card>
      {!editing ? (
        <div className="flex items-center justify-between px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setDraftName(field.name);
              setDraftOptions((field.options ?? []).join(", "));
              setEditing(true);
            }}
            className="flex items-center gap-3 text-left hover:opacity-80"
            title="Click to edit"
          >
            <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{field.name}</span>
            <Badge variant="neutral">{field.type.replace("_", " ")}</Badge>
            {field.options && field.options.length > 0 && (
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {field.options.length} options
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>AI:</span>
              {AI_FILL_MODES.map((mode) => (
                <button key={mode.value} onClick={() => onUpdateAiMode(mode.value)}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                  style={{
                    background: field.aiFillMode === mode.value ? "var(--color-accent-soft)" : "transparent",
                    color: field.aiFillMode === mode.value ? "var(--color-accent)" : "var(--color-text-muted)",
                  }}>
                  {mode.label}
                </button>
              ))}
            </div>
            <Button variant="icon" size="sm" onClick={onRemove}>
              <X size={13} />
            </Button>
          </div>
        </div>
      ) : (
        <CardBody>
          <Input
            label="Field name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
          {isSelect && (
            <div className="mt-3">
              <Input
                label="Options (comma-separated)"
                value={draftOptions}
                onChange={(e) => setDraftOptions(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
                placeholder="e.g. Seed, Series A, Series B"
              />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="solid" size="sm" onClick={commit}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </CardBody>
      )}
    </Card>
  );
}
