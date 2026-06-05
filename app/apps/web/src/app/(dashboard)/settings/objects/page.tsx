"use client";

import { useState, useEffect } from "react";
import { SettingsHeader } from "@/components/ui/settings-header";
import {
  Plus,
  X,
  ChevronDown,
  Pencil,
  Trash2,
  Box,
  Folder,
  Package,
  Handshake,
  Lightbulb,
  Target,
  Rocket,
  Star,
  Tag,
  Layers,
  Briefcase,
  Globe,
  Heart,
  Bookmark,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/input";

// ── Icon map ──
const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  Box,
  Folder,
  Package,
  Handshake,
  Lightbulb,
  Target,
  Rocket,
  Star,
  Tag,
  Layers,
  Briefcase,
  Globe,
  Heart,
  Bookmark,
  Flag,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "url", label: "URL" },
  { value: "boolean", label: "Yes / No" },
] as const;

interface FieldDef {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "url" | "boolean";
  options?: string[];
  required?: boolean;
}

interface ObjectTypeDef {
  id: string;
  name: string;
  nameSingular: string;
  icon: string;
  fields: FieldDef[];
}

export default function CustomObjectsSettingsPage() {
  const [objectTypes, setObjectTypes] = useState<ObjectTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<ObjectTypeDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formSingular, setFormSingular] = useState("");
  const [formIcon, setFormIcon] = useState("Box");
  const [formFields, setFormFields] = useState<FieldDef[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldDef["type"]>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  useEffect(() => {
    fetch("/api/custom-objects")
      .then((r) => (r.ok ? r.json() : { objectTypes: [] }))
      .then((data) => setObjectTypes(data.objectTypes || []))
      .catch((e) => console.warn("custom-objects: fetch failed", e))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingType(null);
    setFormName("");
    setFormSingular("");
    setFormIcon("Box");
    setFormFields([]);
    setShowModal(true);
  }

  function openEdit(ot: ObjectTypeDef) {
    setEditingType(ot);
    setFormName(ot.name);
    setFormSingular(ot.nameSingular);
    setFormIcon(ot.icon);
    setFormFields([...ot.fields]);
    setShowModal(true);
  }

  function addField() {
    if (!newFieldName.trim()) return;
    const field: FieldDef = {
      id: crypto.randomUUID(),
      name: newFieldName.trim(),
      type: newFieldType,
      required: newFieldRequired,
      ...(newFieldType === "select" && newFieldOptions
        ? {
            options: newFieldOptions
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    };
    setFormFields([...formFields, field]);
    setNewFieldName("");
    setNewFieldType("text");
    setNewFieldOptions("");
    setNewFieldRequired(false);
  }

  function removeField(id: string) {
    setFormFields(formFields.filter((f) => f.id !== id));
  }

  async function handleSave() {
    if (!formName.trim() || !formSingular.trim()) return;
    setSaving(true);

    const slug = editingType
      ? editingType.id
      : formSingular
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

    const payload: ObjectTypeDef = {
      id: slug,
      name: formName.trim(),
      nameSingular: formSingular.trim(),
      icon: formIcon,
      fields: formFields,
    };

    try {
      const method = editingType ? "PUT" : "POST";
      const res = await fetch("/api/custom-objects", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (editingType) {
          setObjectTypes(
            objectTypes.map((ot) =>
              ot.id === editingType.id ? data.objectType : ot
            )
          );
        } else {
          setObjectTypes([...objectTypes, data.objectType]);
        }
        setShowModal(false);
      }
    } catch {
      console.error("Failed to save object type");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/custom-objects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setObjectTypes(objectTypes.filter((ot) => ot.id !== id));
        setDeleteConfirm(null);
      }
    } catch {
      console.error("Failed to delete object type");
    }
  }

  function renderIcon(iconName: string, size = 16) {
    const Icon = ICON_MAP[iconName] || Box;
    return <Icon size={size} />;
  }

  return (
    <>
      <SettingsHeader
        title="Custom Objects"
        subtitle="Create custom entity types beyond contacts, companies, and deals. Define the fields each object type should have."
      />

      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Object types
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus size={13} />}
          onClick={openCreate}
        >
          Create type
        </Button>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-md" />
          ))}
        </div>
      ) : objectTypes.length === 0 ? (
        <Card className="mt-3">
          <div className="py-10 text-center">
            <div
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: "var(--color-bg-hover)",
                color: "var(--color-text-tertiary)",
              }}
            >
              <Box size={20} />
            </div>
            <p
              className="mt-3 text-[13px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No custom object types yet.
            </p>
            <button
              onClick={openCreate}
              className="mt-2 text-[12px] font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              + Create your first object type
            </button>
          </div>
        </Card>
      ) : (
        <div className="mt-3 space-y-2">
          {objectTypes.map((ot) => (
            <Card key={ot.id} interactive onClick={() => openEdit(ot)}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{
                    background: "var(--color-accent-soft)",
                    color: "var(--color-accent)",
                  }}
                >
                  {renderIcon(ot.icon, 16)}
                </div>
                <div className="flex-1">
                  <div
                    className="text-[13px] font-medium"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {ot.name}
                  </div>
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {ot.fields.length} field{ot.fields.length !== 1 ? "s" : ""}{" "}
                    &middot; /{ot.id}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="icon"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(ot);
                    }}
                  >
                    <Pencil size={13} />
                  </Button>
                  {deleteConfirm === ot.id ? (
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(ot.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="icon"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(ot.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingType ? `Edit ${editingType.nameSingular}` : "Create Object Type"}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!formName.trim() || !formSingular.trim()}
            >
              {editingType ? "Save Changes" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Plural name"
                placeholder="e.g. Projects"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1">
              <Input
                label="Singular name"
                placeholder="e.g. Project"
                value={formSingular}
                onChange={(e) => setFormSingular(e.target.value)}
              />
            </div>
          </div>

          {/* Icon picker */}
          <div>
            <label
              className="text-[13px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Icon
            </label>
            <div className="mt-1 flex flex-wrap gap-1">
              {ICON_OPTIONS.map((name) => (
                <button
                  key={name}
                  onClick={() => setFormIcon(name)}
                  className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                  style={{
                    background:
                      formIcon === name
                        ? "var(--color-accent-soft)"
                        : "transparent",
                    color:
                      formIcon === name
                        ? "var(--color-accent)"
                        : "var(--color-text-tertiary)",
                    border:
                      formIcon === name
                        ? "1px solid var(--color-accent)"
                        : "1px solid transparent",
                  }}
                  title={name}
                >
                  {renderIcon(name, 15)}
                </button>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Fields
              </label>
              <span
                className="text-[11px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {formFields.length} field{formFields.length !== 1 ? "s" : ""}
              </span>
            </div>

            {formFields.length > 0 && (
              <div className="mb-3 space-y-1">
                {formFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between rounded-md px-3 py-2"
                    style={{
                      background: "var(--color-bg-hover)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {field.name}
                      </span>
                      <Badge variant="neutral">{field.type}</Badge>
                      {field.required && (
                        <Badge variant="warning">Required</Badge>
                      )}
                      {field.options && field.options.length > 0 && (
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {field.options.length} options
                        </span>
                      )}
                    </div>
                    <Button
                      variant="icon"
                      size="sm"
                      onClick={() => removeField(field.id)}
                    >
                      <X size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add field inline */}
            <div
              className="rounded-md p-3"
              style={{
                background: "var(--color-bg-card)",
                border: "1px dashed var(--color-border-default)",
              }}
            >
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Field name"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    className="h-7 w-full rounded-md px-2 text-[12px] outline-none"
                    style={{
                      background: "var(--color-bg-hover)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-default)",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addField();
                    }}
                  />
                </div>
                <div className="relative">
                  <select
                    value={newFieldType}
                    onChange={(e) =>
                      setNewFieldType(e.target.value as FieldDef["type"])
                    }
                    className="h-7 appearance-none rounded-md px-2 pr-6 text-[12px] outline-none"
                    style={{
                      background: "var(--color-bg-hover)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={11}
                    className="pointer-events-none absolute right-1.5 top-2"
                    style={{ color: "var(--color-text-muted)" }}
                  />
                </div>
                <div className="flex items-center">
                  <Toggle
                    checked={newFieldRequired}
                    onChange={setNewFieldRequired}
                    label="Req."
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addField}
                  disabled={!newFieldName.trim()}
                >
                  <Plus size={12} />
                </Button>
              </div>
              {newFieldType === "select" && (
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Options (comma-separated)"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    className="h-7 w-full rounded-md px-2 text-[12px] outline-none"
                    style={{
                      background: "var(--color-bg-hover)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
