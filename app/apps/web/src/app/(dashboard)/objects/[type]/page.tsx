"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus,
  X,
  Trash2,
  ArrowLeft,
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
  Search,
  ExternalLink,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, PropertyBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Toggle } from "@/components/ui/input";

// ── Icon map (same as settings page) ──
const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  Box, Folder, Package, Handshake, Lightbulb, Target, Rocket,
  Star, Tag, Layers, Briefcase, Globe, Heart, Bookmark, Flag,
};

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

interface CustomRecord {
  id: string;
  object_type: string;
  name: string;
  properties: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function CustomObjectRecordsPage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const type = params.type;

  const [objectType, setObjectType] = useState<ObjectTypeDef | null>(null);
  const [records, setRecords] = useState<CustomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<CustomRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Create / edit form state
  const [formName, setFormName] = useState("");
  const [formProps, setFormProps] = useState<Record<string, unknown>>({});
  const [isEditing, setIsEditing] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch(`/api/custom-objects/${type}`);
      if (res.ok) {
        const data = await res.json();
        setObjectType(data.objectType);
        setRecords(data.records || []);
      } else if (res.status === 404) {
        router.push("/");
      }
    } catch {
      console.error("Failed to fetch records");
    } finally {
      setLoading(false);
    }
  }, [type, router]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        Object.values(r.properties || {}).some((v) =>
          String(v).toLowerCase().includes(q)
        )
    );
  }, [records, searchQuery]);

  function openCreate() {
    setIsEditing(false);
    setFormName("");
    setFormProps({});
    setShowCreate(true);
  }

  function openEdit(record: CustomRecord) {
    setIsEditing(true);
    setFormName(record.name);
    setFormProps({ ...(record.properties || {}) });
    setShowDetail(null);
    setShowCreate(true);
  }

  function openDetail(record: CustomRecord) {
    setShowDetail(record);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);

    try {
      if (isEditing && showDetail) {
        // Update
        const res = await fetch(
          `/api/custom-objects/${type}/${showDetail.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: formName.trim(), properties: formProps }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          setRecords(
            records.map((r) => (r.id === showDetail.id ? data.record : r))
          );
          setShowCreate(false);
        }
      } else {
        // Create
        const res = await fetch(`/api/custom-objects/${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), properties: formProps }),
        });
        if (res.ok) {
          const data = await res.json();
          setRecords([data.record, ...records]);
          setShowCreate(false);
        }
      }
    } catch {
      console.error("Failed to save record");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/custom-objects/${type}/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRecords(records.filter((r) => r.id !== id));
        setDeleteConfirm(null);
        setShowDetail(null);
      }
    } catch {
      console.error("Failed to delete record");
    }
  }

  function renderFieldValue(field: FieldDef, value: unknown): React.ReactNode {
    if (value === undefined || value === null || value === "") {
      return (
        <span style={{ color: "var(--color-text-muted)" }}>--</span>
      );
    }

    switch (field.type) {
      case "boolean":
        return value ? (
          <Badge variant="success">Yes</Badge>
        ) : (
          <Badge variant="neutral">No</Badge>
        );
      case "url":
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] hover:underline"
            style={{ color: "var(--color-accent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {String(value).replace(/^https?:\/\//, "").slice(0, 30)}
            <ExternalLink size={10} />
          </a>
        );
      case "select":
        return <PropertyBadge value={String(value)} />;
      case "date":
        try {
          return new Date(String(value)).toLocaleDateString();
        } catch {
          return String(value);
        }
      case "number":
        return (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {String(value)}
          </span>
        );
      default:
        return String(value);
    }
  }

  function renderFieldInput(field: FieldDef) {
    const value = formProps[field.id];

    switch (field.type) {
      case "boolean":
        return (
          <Toggle
            checked={!!value}
            onChange={(v) =>
              setFormProps({ ...formProps, [field.id]: v })
            }
            label={field.name}
          />
        );
      case "select":
        return (
          <div className="flex flex-col gap-1">
            <label
              className="text-[13px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {field.name}
              {field.required && (
                <span style={{ color: "var(--color-error)" }}> *</span>
              )}
            </label>
            <select
              value={String(value || "")}
              onChange={(e) =>
                setFormProps({ ...formProps, [field.id]: e.target.value })
              }
              className="h-8 w-full appearance-none rounded-md px-3 pr-8 text-[12px] outline-none"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
                color: "var(--color-text-primary)",
              }}
            >
              <option value="">Select...</option>
              {(field.options || []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        );
      case "date":
        return (
          <Input
            label={
              field.name +
              (field.required ? " *" : "")
            }
            type="date"
            value={String(value || "")}
            onChange={(e) =>
              setFormProps({ ...formProps, [field.id]: e.target.value })
            }
          />
        );
      case "number":
        return (
          <Input
            label={
              field.name +
              (field.required ? " *" : "")
            }
            type="number"
            value={String(value || "")}
            onChange={(e) =>
              setFormProps({
                ...formProps,
                [field.id]: e.target.value ? Number(e.target.value) : "",
              })
            }
          />
        );
      case "url":
        return (
          <Input
            label={
              field.name +
              (field.required ? " *" : "")
            }
            type="url"
            placeholder="https://..."
            value={String(value || "")}
            onChange={(e) =>
              setFormProps({ ...formProps, [field.id]: e.target.value })
            }
          />
        );
      default:
        return (
          <Input
            label={
              field.name +
              (field.required ? " *" : "")
            }
            value={String(value || "")}
            onChange={(e) =>
              setFormProps({ ...formProps, [field.id]: e.target.value })
            }
          />
        );
    }
  }

  const Icon =
    objectType && ICON_MAP[objectType.icon]
      ? ICON_MAP[objectType.icon]
      : Box;

  // Build table columns from object type fields
  const columns: Column<CustomRecord>[] = useMemo(() => {
    if (!objectType) return [];

    const cols: Column<CustomRecord>[] = [
      {
        key: "name",
        header: "Name",
        sortable: true,
        render: (row) => (
          <span
            className="text-[13px] font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {row.name}
          </span>
        ),
      },
    ];

    // Add up to 4 field columns in the table
    const visibleFields = objectType.fields.slice(0, 4);
    for (const field of visibleFields) {
      cols.push({
        key: field.id,
        header: field.name,
        sortable: field.type === "text" || field.type === "number",
        render: (row) => (
          <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {renderFieldValue(field, row.properties?.[field.id])}
          </span>
        ),
      });
    }

    cols.push({
      key: "created_at",
      header: "Created",
      sortable: true,
      width: "120px",
      render: (row) => (
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          {new Date(row.created_at).toLocaleDateString()}
        </span>
      ),
    });

    return cols;
  }, [objectType]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div
          className="flex h-[var(--header-height)] items-center px-6"
          style={{
            borderBottom: "1px solid var(--color-border-default)",
            background: "var(--color-bg-card)",
          }}
        >
          <div className="skeleton h-5 w-32 rounded" />
        </div>
        <div className="p-6">
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!objectType) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<Box size={24} />}
          title="Object type not found"
          description="This custom object type does not exist."
          actionLabel="Go back"
          onAction={() => router.push("/")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Icon size={18} />}
        title={objectType.name}
        subtitle={`${records.length} record${records.length !== 1 ? "s" : ""}`}
      >
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-muted)" }}
          />
          <input
            type="text"
            placeholder={`Search ${objectType.name.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 w-48 rounded-md pl-8 pr-3 text-[12px] outline-none"
            style={{
              background: "var(--color-bg-hover)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          />
        </div>
        <Button
          variant="gradient"
          size="sm"
          icon={<Plus size={13} />}
          onClick={openCreate}
        >
          New {objectType.nameSingular}
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        {filteredRecords.length === 0 && !loading ? (
          <EmptyState
            icon={<Icon size={24} />}
            title={
              searchQuery
                ? "No matching records"
                : `No ${objectType.name.toLowerCase()} yet`
            }
            description={
              searchQuery
                ? "Try a different search."
                : `Create your first ${objectType.nameSingular.toLowerCase()} to get started.`
            }
            actionLabel={searchQuery ? undefined : `New ${objectType.nameSingular}`}
            onAction={searchQuery ? undefined : openCreate}
            actionVariant="gradient"
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredRecords}
            getRowId={(r) => r.id}
            onRowClick={openDetail}
            emptyIcon={<Icon size={24} />}
            emptyTitle={`No ${objectType.name.toLowerCase()}`}
          />
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={
          isEditing
            ? `Edit ${objectType.nameSingular}`
            : `New ${objectType.nameSingular}`
        }
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!formName.trim()}
            >
              {isEditing ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label={`${objectType.nameSingular} name *`}
            placeholder={`Enter ${objectType.nameSingular.toLowerCase()} name`}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            autoFocus
          />
          {objectType.fields.map((field) => (
            <div key={field.id}>{renderFieldInput(field)}</div>
          ))}
        </div>
      </Modal>

      {/* Detail slide-over / modal */}
      <Modal
        open={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={showDetail?.name || ""}
        size="lg"
        footer={
          <>
            {showDetail && (
              <>
                {deleteConfirm === showDetail.id ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[12px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      Delete this record?
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(showDetail.id)}
                    >
                      Confirm Delete
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
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(showDetail.id)}
                    style={{ color: "var(--color-error)" }}
                  >
                    <Trash2 size={13} />
                    Delete
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(showDetail)}
                >
                  Edit
                </Button>
              </>
            )}
          </>
        }
      >
        {showDetail && (
          <div className="space-y-4">
            {/* Name */}
            <div>
              <div
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-muted)" }}
              >
                Name
              </div>
              <div
                className="mt-1 text-[14px] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {showDetail.name}
              </div>
            </div>

            {/* Fields */}
            {objectType.fields.map((field) => {
              const value = showDetail.properties?.[field.id];
              return (
                <div key={field.id}>
                  <div
                    className="text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {field.name}
                  </div>
                  <div
                    className="mt-1 text-[13px]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {renderFieldValue(field, value)}
                  </div>
                </div>
              );
            })}

            {/* Meta */}
            <div
              className="border-t pt-3"
              style={{ borderColor: "var(--color-border-default)" }}
            >
              <div className="flex gap-6">
                <div>
                  <div
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Created
                  </div>
                  <div
                    className="mt-0.5 text-[12px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {new Date(showDetail.created_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Updated
                  </div>
                  <div
                    className="mt-0.5 text-[12px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {new Date(showDetail.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
