"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileText } from "lucide-react";
import {
  DATA_KEYS,
  type Component,
  type ComponentMap,
} from "@/lib/proposals/component-map";

interface TemplateRow {
  id: string;
  name: string;
  sourceFormat: string;
  status: string;
  updatedAt: string;
}

interface TemplateDetail {
  id: string;
  name: string;
  status: string;
  originalFileName: string;
  componentMap: ComponentMap | null;
}

interface FilledCitation {
  id: string;
  type: string;
  label: string;
  snippet: string;
  date: string | null;
}
interface FilledComponent {
  componentId: string;
  kind: string;
  label: string;
  content: string;
  order: number;
  confidence: "high" | "medium" | "low";
  abstained: boolean;
  citations: FilledCitation[];
}

const CONF_COLOR: Record<string, string> = {
  high: "#16a34a",
  medium: "#d97706",
  low: "#dc2626",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  detected: "Detected — review",
  mapped: "Mapped",
  failed: "Unreadable",
};

export default function ProposalsPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<TemplateDetail | null>(null);
  const [draft, setDraft] = useState<ComponentMap | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dealId, setDealId] = useState("");
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState<{
    proposalId: string;
    components: Array<FilledComponent>;
    unmappedSections: string[];
  } | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/proposals/templates");
    if (res.ok) {
      const d = (await res.json()) as { templates: TemplateRow[] };
      setTemplates(d.templates ?? []);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openTemplate = useCallback(async (id: string) => {
    setNotice(null);
    const res = await fetch(`/api/proposals/templates/${id}`);
    if (!res.ok) {
      setNotice("Could not load that template.");
      return;
    }
    const d = (await res.json()) as { template: TemplateDetail };
    setSelected(d.template);
    setDraft(d.template.componentMap ?? null);
    setFilled(null);
    setDealId("");
  }, []);

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/proposals/templates", { method: "POST", body: fd });
    const d = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
      degraded?: boolean;
      userSuggestion?: string;
    };
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      setNotice(
        d.error === "unsupported_format"
          ? "Only .docx and .pptx templates are supported."
          : d.error === "file_too_large"
            ? "That file is over the 10 MB limit."
            : d.error === "unreadable_docx"
              ? "That .docx could not be read."
              : "Upload failed.",
      );
      await loadList();
      return;
    }
    await loadList();
    if (d.degraded) setNotice(d.userSuggestion ?? "Components could not be detected automatically.");
    if (d.id) await openTemplate(d.id);
  }

  function patchComponent(index: number, patch: Partial<Component>) {
    setDraft((m) =>
      m
        ? { ...m, components: m.components.map((c, i) => (i === index ? { ...c, ...patch } : c)) }
        : m,
    );
  }

  function removeComponent(index: number) {
    setDraft((m) =>
      m
        ? {
            ...m,
            components: m.components
              .filter((_, i) => i !== index)
              .map((c, i) => ({ ...c, order: i })),
          }
        : m,
    );
  }

  async function confirmMap() {
    if (!selected || !draft) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/proposals/templates/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentMap: draft }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setNotice(
        d.error === "invalid_map"
          ? "Every component needs a label, and every field needs a data source."
          : "Could not save the mapping.",
      );
      return;
    }
    setNotice("Template mapped. Draft a proposal from a deal below.");
    await loadList();
    await openTemplate(selected.id);
  }

  async function runFill() {
    if (!selected || !dealId.trim()) return;
    setFilling(true);
    setNotice(null);
    setFilled(null);
    const res = await fetch(`/api/proposals/templates/${selected.id}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: dealId.trim() }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      proposalId?: string;
      components?: FilledComponent[];
      unmappedSections?: string[];
      error?: string;
      message?: string;
      userSuggestion?: string;
    };
    setFilling(false);
    if (!res.ok) {
      setNotice(
        d.error === "deal_not_found"
          ? "No deal found with that id."
          : d.error === "template_not_mapped"
            ? "Confirm the mapping before drafting."
            : d.userSuggestion ?? d.message ?? "Drafting failed.",
      );
      return;
    }
    setFilled({
      proposalId: d.proposalId ?? "",
      components: d.components ?? [],
      unmappedSections: d.unmappedSections ?? [],
    });
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      <div
        className="flex shrink-0 items-center gap-2 px-6"
        style={{
          height: "var(--header-height)",
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        <FileText size={16} style={{ opacity: 0.6 }} />
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Proposals
        </h1>
        <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          Upload a Word or PowerPoint template; Elevay maps its components so it can be drafted per prospect.
        </span>
        <div className="flex-1" />
        <label
          className="cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium"
          style={{ background: "var(--color-accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Working…" : "Upload template"}
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pptx"
            className="hidden"
            disabled={busy}
            onChange={onUpload}
          />
        </label>
      </div>

      {notice && (
        <div
          className="px-6 py-2 text-[13px]"
          style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-default)" }}
        >
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Template list */}
        <div
          className="w-72 shrink-0 overflow-y-auto p-2"
          style={{ borderRight: "1px solid var(--color-border-default)" }}
        >
          {templates.length === 0 && (
            <div className="p-4 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
              No templates yet. Upload a .docx proposal template to begin.
            </div>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => void openTemplate(t.id)}
              className="mb-1 flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors"
              style={{
                background: selected?.id === t.id ? "var(--color-accent-soft)" : "transparent",
              }}
            >
              <span
                className="truncate text-[13px] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                {t.name}
              </span>
              <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </button>
          ))}
        </div>

        {/* Review panel */}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {!selected && (
            <div className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
              Select a template to review its detected components.
            </div>
          )}

          {selected && (
            <div className="mx-auto max-w-3xl">
              <div className="mb-4">
                <div className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {selected.name}
                </div>
                <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {selected.originalFileName} · {STATUS_LABEL[selected.status] ?? selected.status}
                </div>
              </div>

              {!draft && (
                <div className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                  No components detected. Re-upload, or detect again once a model is configured.
                </div>
              )}

              {draft && (
                <>
                  <div className="space-y-2">
                    {draft.components.map((c, i) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 rounded-md p-2"
                        style={{ border: "1px solid var(--color-border-default)" }}
                      >
                        <select
                          value={c.kind}
                          onChange={(e) =>
                            patchComponent(i, {
                              kind: e.target.value as Component["kind"],
                              dataKey: e.target.value === "section" ? null : c.dataKey,
                            })
                          }
                          className="rounded border px-1.5 py-1 text-[12px]"
                          style={{ borderColor: "var(--color-border-default)", background: "transparent" }}
                        >
                          <option value="section">Section</option>
                          <option value="field">Field</option>
                        </select>
                        <input
                          value={c.label}
                          onChange={(e) => patchComponent(i, { label: e.target.value })}
                          className="flex-1 rounded border px-2 py-1 text-[13px]"
                          style={{ borderColor: "var(--color-border-default)", background: "transparent", color: "var(--color-text-primary)" }}
                        />
                        <select
                          value={c.dataKey ?? ""}
                          disabled={c.kind === "section"}
                          onChange={(e) => patchComponent(i, { dataKey: e.target.value || null })}
                          className="rounded border px-1.5 py-1 text-[12px]"
                          style={{ borderColor: "var(--color-border-default)", background: "transparent", opacity: c.kind === "section" ? 0.4 : 1 }}
                        >
                          <option value="">{c.kind === "section" ? "generated" : "— pick a source —"}</option>
                          {DATA_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] uppercase"
                          style={{ color: "var(--color-text-tertiary)" }}
                          title="Detection confidence"
                        >
                          {c.confidence}
                        </span>
                        <button
                          onClick={() => removeComponent(i)}
                          className="rounded px-2 py-1 text-[12px]"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => void confirmMap()}
                      disabled={busy}
                      className="rounded-md px-3 py-1.5 text-[13px] font-medium"
                      style={{ background: "var(--color-accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}
                    >
                      Confirm mapping
                    </button>
                    <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {draft.components.length} components
                    </span>
                  </div>
                </>
              )}

              {selected.status === "mapped" && (
                <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                  <div className="mb-2 text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Draft from a deal
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={dealId}
                      onChange={(e) => setDealId(e.target.value)}
                      placeholder="Deal id"
                      className="rounded border px-2 py-1 text-[13px]"
                      style={{ borderColor: "var(--color-border-default)", background: "transparent", color: "var(--color-text-primary)" }}
                    />
                    <button
                      onClick={() => void runFill()}
                      disabled={filling || !dealId.trim()}
                      className="rounded-md px-3 py-1.5 text-[13px] font-medium"
                      style={{ background: "var(--color-accent)", color: "#fff", opacity: filling || !dealId.trim() ? 0.6 : 1 }}
                    >
                      {filling ? "Drafting…" : "Draft proposal"}
                    </button>
                    {filled && (
                      <a
                        href={`/api/proposals/${filled.proposalId}/download`}
                        className="text-[13px] underline"
                        style={{ color: "var(--color-accent)" }}
                      >
                        Download .docx
                      </a>
                    )}
                  </div>
                  {filled && (
                    <div className="mt-3 space-y-2">
                      {filled.unmappedSections.length > 0 && (
                        <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                          Not placed in the document: {filled.unmappedSections.join(", ")}
                        </div>
                      )}
                      {filled.components.map((c) => (
                        <div key={c.componentId} className="rounded-md p-2" style={{ border: "1px solid var(--color-border-default)" }}>
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-[11px] uppercase" style={{ color: "var(--color-text-tertiary)" }}>
                              {c.label} · {c.kind}
                            </span>
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                              style={{ background: CONF_COLOR[c.confidence] ?? "#6b7280", color: "#fff" }}
                              title="Detection/grounding confidence"
                            >
                              {c.confidence}
                            </span>
                            {c.abstained && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[10px]"
                                style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
                              >
                                needs input
                              </span>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                            {c.content || "—"}
                          </div>
                          {c.citations.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {c.citations.map((cit) => (
                                <span
                                  key={cit.id}
                                  className="rounded px-1.5 py-0.5 text-[10px]"
                                  style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
                                  title={cit.snippet}
                                >
                                  {cit.type === "field" ? cit.label : `${cit.label}${cit.date ? ` · ${cit.date}` : ""}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
