"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type {
  FilterCondition,
  FilterFieldDef,
  FilterOperator,
} from "@/lib/filters";
import { operatorsForType } from "@/lib/filters";

/**
 * Controlled filter builder. Accepts a field catalog and renders
 * a stack of "add filter" rows; caller persists the conditions.
 *
 * Minimal-by-design: text input for value (array filters comma-split).
 * Rich pickers (date-range calendar, multi-select combobox) can land
 * as drop-in replacements per field type in a later pass.
 */
export function FilterBuilder({
  fields,
  value,
  onChange,
  onSaveView,
  className = "",
}: {
  fields: FilterFieldDef[];
  value: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
  onSaveView?: (name: string) => Promise<void>;
  className?: string;
}) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  function addFilter(fieldKey: string) {
    const def = fields.find((f) => f.key === fieldKey);
    if (!def) return;
    const ops = operatorsForType(def.type);
    onChange([...value, { field: def.key, operator: ops[0], value: null }]);
  }

  function update(idx: number, patch: Partial<FilterCondition>) {
    const next = value.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!onSaveView || !newName.trim()) return;
    setSaving(true);
    try {
      await onSaveView(newName.trim());
      setNewName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`.trim()}>
      <ul className="flex flex-col gap-1.5">
        {value.map((cond, idx) => {
          const def = fields.find((f) => f.key === cond.field);
          const ops = def ? operatorsForType(def.type) : [];
          return (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-md px-2 py-1"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <select
                value={cond.field}
                onChange={(e) => update(idx, { field: e.target.value, value: null })}
                className="text-[12px] bg-transparent outline-none"
                style={{ color: "var(--color-text-primary)" }}
              >
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={cond.operator}
                onChange={(e) => update(idx, { operator: e.target.value as FilterOperator })}
                className="text-[12px] bg-transparent outline-none"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={
                  cond.value == null
                    ? ""
                    : Array.isArray(cond.value)
                      ? cond.value.join(", ")
                      : String(cond.value)
                }
                placeholder="value"
                onChange={(e) => {
                  const raw = e.target.value;
                  const parsed =
                    def?.type === "multi-select"
                      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
                      : raw;
                  update(idx, { value: parsed as never });
                }}
                className="flex-1 rounded px-1.5 py-0.5 text-[12px] outline-none"
                style={{
                  background: "var(--color-bg-page)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-default)",
                }}
              />
              <button
                onClick={() => remove(idx)}
                aria-label="Remove filter"
                className="flex h-5 w-5 items-center justify-center rounded"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <X size={12} />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2">
        <select
          onChange={(e) => {
            if (e.target.value) {
              addFilter(e.target.value);
              e.target.value = "";
            }
          }}
          defaultValue=""
          className="rounded-md px-2 py-1 text-[12px]"
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <option value="" disabled>
            + Add filter
          </option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>

        {onSaveView && value.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Save as view…"
              className="rounded px-1.5 py-0.5 text-[12px] outline-none"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            />
            <button
              onClick={handleSave}
              disabled={!newName.trim() || saving}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium disabled:opacity-50"
              style={{
                background: "var(--color-accent)",
                color: "white",
              }}
            >
              <Plus size={11} />
              {saving ? "Saving…" : "Save view"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
