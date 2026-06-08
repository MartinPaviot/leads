"use client";

import { useState, useRef } from "react";
import { Upload, FileUp, Check, AlertCircle, X, FileText, Loader2, ArrowRight, ArrowLeft, ChevronDown, Shield } from "lucide-react";
import { Button } from "./ui/button";

interface ImportResult {
  success: boolean;
  entityType: string;
  mapping: Record<string, string>;
  created: number;
  skipped: number;
  duplicates?: number;
  errors: number;
  totalRows: number;
}

interface PreviewData {
  entityType: string;
  fieldMap: Record<string, string>;
  confidence: number;
  headers: string[];
  sampleData: string[][];
  previewRows: Record<string, string>[];
  totalRows: number;
}

type Step = "upload" | "analyzing" | "review" | "importing" | "result";

const CRM_FIELDS: Record<string, string[]> = {
  contact: ["firstName", "lastName", "email", "title", "phone", "linkedinUrl", "(skip)"],
  account: ["name", "domain", "industry", "size", "revenue", "description", "(skip)"],
  deal: ["name", "stage", "value", "(skip)"],
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  title: "Job Title",
  phone: "Phone",
  linkedinUrl: "LinkedIn URL",
  name: "Name",
  domain: "Domain",
  industry: "Industry",
  size: "Company Size",
  revenue: "Revenue",
  description: "Description",
  stage: "Deal Stage",
  value: "Deal Value",
  "(skip)": "Skip",
};

export function SmartImport({ onClose, onComplete }: { onClose: () => void; onComplete?: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [entityType, setEntityType] = useState<string>("");
  const [dedup, setDedup] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [editedMapping, setEditedMapping] = useState<Record<string, string>>({});
  const [editedEntityType, setEditedEntityType] = useState<string>("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(file: File) {
    const text = await file.text();
    setCsvText(text);
    setHeaderRowIndex(0);
  }

  // Step 1 → 2: Send CSV to preview endpoint
  async function handlePreview() {
    if (!csvText.trim()) return;
    setStep("analyzing");
    setError(null);

    const trimmedCsv =
      headerRowIndex === 0
        ? csvText
        : csvText.split("\n").slice(headerRowIndex).join("\n");

    try {
      const res = await fetch("/api/import/smart/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: trimmedCsv, entityType: entityType || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Preview failed");
        setStep("upload");
        return;
      }

      setPreview(data);
      setEditedMapping({ ...data.fieldMap });
      setEditedEntityType(data.entityType || "contact");
      setStep("review");
    } catch (err) {
      setError(String(err));
      setStep("upload");
    }
  }

  // Step 3 → 4: Commit with confirmed mapping
  async function handleCommit() {
    if (!preview) return;
    setStep("importing");
    setError(null);

    const trimmedCsv =
      headerRowIndex === 0
        ? csvText
        : csvText.split("\n").slice(headerRowIndex).join("\n");

    // Clean mapping: remove (skip) entries
    const cleanMapping: Record<string, string> = {};
    for (const [csvCol, crmField] of Object.entries(editedMapping)) {
      if (crmField && crmField !== "(skip)") {
        cleanMapping[csvCol] = crmField;
      }
    }

    try {
      const res = await fetch("/api/import/smart/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText: trimmedCsv,
          entityType: editedEntityType,
          fieldMap: cleanMapping,
          dedup,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
        setStep("review");
        return;
      }

      setResult(data);
      setStep("result");
    } catch (err) {
      setError(String(err));
      setStep("review");
    }
  }

  function updateMapping(csvCol: string, crmField: string) {
    setEditedMapping((prev) => ({ ...prev, [csvCol]: crmField }));
  }

  const csvLines = csvText.split("\n").filter(Boolean);
  const headerCandidates = csvLines.slice(0, Math.min(5, csvLines.length));
  const safeHeaderRowIndex = Math.min(headerRowIndex, Math.max(0, csvLines.length - 1));
  const headers = csvLines[safeHeaderRowIndex]?.split(",").map((h) => h.trim().replace(/^["']|["']$/g, "")) || [];
  const previewTableRows = csvLines
    .slice(safeHeaderRowIndex + 1, safeHeaderRowIndex + 4)
    .map((l) => l.split(",").map((c) => c.trim().replace(/^["']|["']$/g, "")));
  const dataRowCount = Math.max(0, csvLines.length - safeHeaderRowIndex - 1);

  const availableFields = CRM_FIELDS[editedEntityType] || CRM_FIELDS.contact;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0, 0, 0, 0.5)" }}>
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-card)",
          maxHeight: "calc(100vh - 2rem)",
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
          <div className="flex items-center gap-2">
            <FileUp size={16} style={{ color: "var(--color-accent)" }} />
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Smart Import
            </h2>
            {/* Step indicator */}
            <div className="ml-3 flex items-center gap-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
              <StepDot active={step === "upload"} done={["analyzing", "review", "importing", "result"].includes(step)} label="1" />
              <span>—</span>
              <StepDot active={step === "analyzing" || step === "review"} done={["importing", "result"].includes(step)} label="2" />
              <span>—</span>
              <StepDot active={step === "importing" || step === "result"} done={step === "result"} label="3" />
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--color-text-tertiary)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* ──────── STEP 1: Upload ──────── */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                Upload a CSV and Elevay will map columns to CRM fields. You'll review the mapping before any data is imported.
              </p>

              {/* File upload */}
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors"
                style={{ borderColor: "var(--color-border-default)" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = "var(--color-border-default)";
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file);
                }}
              >
                <Upload size={24} style={{ color: "var(--color-text-tertiary)" }} />
                <span className="mt-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                  Drop CSV file here or click to browse
                </span>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }} />
              </div>

              {/* Paste */}
              <div>
                <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                  Or paste CSV data:
                </label>
                <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)}
                  placeholder="name,email,company&#10;John Doe,john@example.com,Acme Inc"
                  className="w-full rounded-lg p-3 text-[12px] font-mono outline-none" rows={4}
                  style={{ background: "var(--color-bg-muted)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)", resize: "vertical" }} />
              </div>

              {/* Header row picker */}
              {csvLines.length >= 2 && csvText.trim() && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <FileText size={13} style={{ color: "var(--color-text-tertiary)" }} />
                    <span className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      Pick your header row
                    </span>
                  </div>
                  <div className="space-y-1">
                    {headerCandidates.map((line, i) => {
                      const active = i === safeHeaderRowIndex;
                      return (
                        <label key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors"
                          style={{ background: active ? "var(--color-accent-soft)" : "var(--color-bg-page)", border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}` }}>
                          <input type="radio" name="headerRowIndex" checked={active} onChange={() => setHeaderRowIndex(i)} className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--color-text-tertiary)" }}>Row {i + 1}</span>
                          <span className="truncate text-[11px] font-mono" style={{ color: "var(--color-text-primary)" }} title={line}>{line}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview */}
              {headers.length > 0 && csvText.trim() && (
                <div>
                  <span className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Preview ({dataRowCount} rows)
                  </span>
                  <div className="mt-1 overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr style={{ background: "var(--color-bg-muted)" }}>
                          {headers.map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left font-medium"
                              style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-default)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewTableRows.map((row, i) => (
                          <tr key={i}>{row.map((cell, j) => (
                            <td key={j} className="px-2 py-1" style={{ color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border-default)" }}>{cell || "—"}</td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Entity type + options */}
              <div className="flex items-center gap-3">
                <label className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Import as:</label>
                {["auto", "contact", "account", "deal"].map((type) => (
                  <button key={type} onClick={() => setEntityType(type === "auto" ? "" : type)}
                    className="rounded-full px-3 py-1 text-[12px] font-medium transition-all"
                    style={{
                      background: (type === "auto" && !entityType) || entityType === type ? "var(--color-accent)" : "var(--color-bg-muted)",
                      color: (type === "auto" && !entityType) || entityType === type ? "white" : "var(--color-text-secondary)",
                    }}>
                    {type === "auto" ? "Auto-detect" : type.charAt(0).toUpperCase() + type.slice(1) + "s"}
                  </button>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg p-3 text-[12px]"
                  style={{ background: "var(--color-error-soft)", color: "var(--color-error)" }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button variant="solid" size="sm" onClick={handlePreview} disabled={!csvText.trim()} icon={<ArrowRight size={13} />}>
                  Analyze columns
                </Button>
              </div>
            </div>
          )}

          {/* ──────── STEP 2: Analyzing ──────── */}
          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
              <span className="mt-3 text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                AI is mapping your columns...
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                Detecting entity type and matching columns to CRM fields
              </span>
            </div>
          )}

          {/* ──────── STEP 3: Review Mapping ──────── */}
          {step === "review" && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield size={16} style={{ color: "var(--color-accent)" }} />
                <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Review column mapping
                </span>
                {preview.confidence < 0.8 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}>
                    Low confidence — please verify
                  </span>
                )}
              </div>

              <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                Verify each column mapping below. Change any incorrect mapping using the dropdown. Unmapped columns will be skipped.
              </p>

              {/* Entity type selector */}
              <div className="flex items-center gap-3">
                <label className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Importing as:</label>
                {["contact", "account", "deal"].map((type) => (
                  <button key={type} onClick={() => {
                    setEditedEntityType(type);
                    // Reset mappings when entity type changes
                    const newMapping: Record<string, string> = {};
                    for (const col of preview.headers) {
                      newMapping[col] = "(skip)";
                    }
                    setEditedMapping(newMapping);
                  }}
                    className="rounded-full px-3 py-1 text-[12px] font-medium transition-all"
                    style={{
                      background: editedEntityType === type ? "var(--color-accent)" : "var(--color-bg-muted)",
                      color: editedEntityType === type ? "white" : "var(--color-text-secondary)",
                    }}>
                    {type.charAt(0).toUpperCase() + type.slice(1) + "s"}
                  </button>
                ))}
              </div>

              {/* Mapping table */}
              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ background: "var(--color-bg-muted)" }}>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-default)" }}>
                        CSV Column
                      </th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-default)" }}>
                        Sample Value
                      </th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-default)" }}>
                        Maps To
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.headers.map((col, i) => {
                      const currentMapping = editedMapping[col] || "(skip)";
                      const sampleValue = preview.sampleData[0]?.[i] || "";
                      const isSkipped = currentMapping === "(skip)";
                      return (
                        <tr key={col} style={{ opacity: isSkipped ? 0.5 : 1 }}>
                          <td className="px-3 py-2 font-mono" style={{ color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border-default)" }}>
                            {col}
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border-default)" }}
                            title={sampleValue}>
                            {sampleValue || "—"}
                          </td>
                          <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                            <div className="relative">
                              <select
                                value={currentMapping}
                                onChange={(e) => updateMapping(col, e.target.value)}
                                className="w-full appearance-none rounded px-2 py-1 pr-6 text-[12px] outline-none"
                                style={{
                                  background: isSkipped ? "var(--color-bg-muted)" : "var(--color-accent-soft)",
                                  color: isSkipped ? "var(--color-text-tertiary)" : "var(--color-accent)",
                                  border: `1px solid ${isSkipped ? "var(--color-border-default)" : "var(--color-accent)"}`,
                                  fontWeight: isSkipped ? 400 : 500,
                                }}
                              >
                                {availableFields.map((field) => (
                                  <option key={field} value={field}>
                                    {FIELD_LABELS[field] || field}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                                style={{ color: "var(--color-text-tertiary)" }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mapped preview */}
              {preview.previewRows.length > 0 && (
                <div>
                  <span className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    How your data will look:
                  </span>
                  <div className="mt-1 overflow-x-auto rounded-lg" style={{ border: "1px solid var(--color-border-default)" }}>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr style={{ background: "var(--color-bg-muted)" }}>
                          {Object.entries(editedMapping)
                            .filter(([, v]) => v !== "(skip)")
                            .map(([, crmField]) => (
                              <th key={crmField} className="px-2 py-1.5 text-left font-medium"
                                style={{ color: "var(--color-accent)", borderBottom: "1px solid var(--color-border-default)" }}>
                                {FIELD_LABELS[crmField] || crmField}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sampleData.slice(0, 3).map((row, ri) => (
                          <tr key={ri}>
                            {Object.entries(editedMapping)
                              .filter(([, v]) => v !== "(skip)")
                              .map(([csvCol]) => {
                                const colIndex = preview.headers.indexOf(csvCol);
                                return (
                                  <td key={csvCol} className="px-2 py-1"
                                    style={{ color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border-default)" }}>
                                    {colIndex >= 0 ? row[colIndex] || "—" : "—"}
                                  </td>
                                );
                              })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Dedup toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={dedup} onChange={(e) => setDedup(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  Skip duplicates (existing {editedEntityType === "contact" ? "emails" : editedEntityType === "account" ? "domains" : "entries"})
                </span>
              </label>

              {error && (
                <div className="flex items-center gap-2 rounded-lg p-3 text-[12px]"
                  style={{ background: "var(--color-error-soft)", color: "var(--color-error)" }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="ghost" size="sm" icon={<ArrowLeft size={13} />} onClick={() => { setStep("upload"); setError(null); }}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                  <Button variant="solid" size="sm" onClick={handleCommit}
                    disabled={Object.values(editedMapping).filter((v) => v !== "(skip)").length === 0}
                    icon={<Check size={13} />}>
                    Import {preview.totalRows} rows
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ──────── STEP 4: Importing ──────── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
              <span className="mt-3 text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                Importing data...
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                Creating {editedEntityType}s with your confirmed mapping
              </span>
            </div>
          )}

          {/* ──────── STEP 5: Result ──────── */}
          {step === "result" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Check size={20} style={{ color: "var(--color-success)" }} />
                <span className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Import complete
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <ResultCard label={`${result.entityType}s created`} value={result.created} color="var(--color-success)" />
                <ResultCard label="skipped" value={result.skipped} color="var(--color-text-secondary)" />
                <ResultCard label="duplicates" value={result.duplicates ?? 0} color="var(--color-warning)" />
                <ResultCard label="errors" value={result.errors} color={result.errors > 0 ? "var(--color-error)" : "var(--color-text-secondary)"} />
              </div>

              {/* Mapping used */}
              <div>
                <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--color-text-tertiary)" }}>
                  Column mapping used:
                </h3>
                <div className="space-y-1">
                  {Object.entries(result.mapping).map(([csv, crm]) => (
                    <div key={csv} className="flex items-center gap-2 text-[12px]">
                      <span style={{ color: "var(--color-text-secondary)" }}>{csv}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>→</span>
                      <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>{FIELD_LABELS[crm] || crm}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="solid" size="sm" onClick={() => { onClose(); onComplete?.(); }}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
      style={{
        background: done ? "var(--color-success)" : active ? "var(--color-accent)" : "var(--color-bg-muted)",
        color: done || active ? "white" : "var(--color-text-tertiary)",
        border: `1px solid ${done ? "var(--color-success)" : active ? "var(--color-accent)" : "var(--color-border-default)"}`,
      }}
    >
      {done ? <Check size={10} /> : label}
    </span>
  );
}

function ResultCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "var(--color-bg-muted)" }}>
      <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{label}</div>
    </div>
  );
}
