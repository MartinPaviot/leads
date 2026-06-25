"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileText } from "lucide-react";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";
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
  supportRatio: number;
  unsupported: boolean;
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

interface DealOption {
  id: string;
  name: string;
  companyName: string | null;
  stage: string | null;
}

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

/**
 * CLE-14 — the IDs we INTENTIONALLY do NOT register. A proposal TEMPLATE upload is
 * a native OS file dialog plus a multipart byte stream; a proposal DOWNLOAD is a
 * native browser download (the server streams the assembled .docx/.pptx/.pdf). The
 * agent can NEVER pick a local file nor receive raw bytes, so the SUBMIT/STREAM
 * verbs are human-bound. The safe edges are `proposals.openTemplateUpload` (opens
 * the picker only — the human chooses the file) and `proposals.openDownload`
 * (navigates the browser to the download URL — the browser streams, not the agent).
 * A boundary test (proposals-actions.boundary.test.ts) asserts the registered id
 * set is disjoint from this — registering any of these would be a boundary breach.
 */
// PROPOSALS_EXCLUDED_IDS moved to ./_excluded-ids (a Next page.tsx may only export
// the default component + route config).

export default function ProposalsPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<TemplateDetail | null>(null);
  const [draft, setDraft] = useState<ComponentMap | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dealId, setDealId] = useState("");
  // Deal picker — replaces the raw "type a UUID" dead-end. Searches the
  // deals list API; selecting a deal sets dealId for the fill call.
  const [dealQuery, setDealQuery] = useState("");
  const [dealResults, setDealResults] = useState<DealOption[]>([]);
  const [dealSearching, setDealSearching] = useState(false);
  const [dealMenuOpen, setDealMenuOpen] = useState(false);
  const [selectedDealLabel, setSelectedDealLabel] = useState("");
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState<{
    proposalId: string;
    components: Array<FilledComponent>;
    unmappedSections: string[];
  } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);

  // CLE-14: live mirrors so the chat actions (registered once) read current state
  // without re-registering on every render. `draft`/`filled`/`edits` are read by
  // confirmMapping/regenerate/saveEdits; the rest of state is passed as params.
  const draftRef = useRef(draft); draftRef.current = draft;
  const filledRef = useRef(filled); filledRef.current = filled;
  const editsRef = useRef(edits); editsRef.current = edits;

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals/templates");
      if (res.ok) {
        const d = (await res.json()) as { templates: TemplateRow[] };
        setTemplates(d.templates ?? []);
      } else {
        // Was a bare `if (res.ok)` with no else: a 500 left templates empty,
        // indistinguishable from a workspace with no templates. Mirror the
        // openTemplate notice pattern (line ~141).
        setNotice("Could not load your templates. Please refresh or try again.");
      }
    } catch {
      setNotice("Could not load your templates. Please refresh or try again.");
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
    setEdits({});
    setDealId("");
    setSelectedDealLabel("");
    setDealQuery("");
    setDealMenuOpen(false);
  }, []);

  // Search deals as the user types in the picker (debounced). Empty query
  // returns the most recent deals so the menu is never blank on open.
  useEffect(() => {
    if (!dealMenuOpen) return;
    const q = dealQuery.trim();
    let cancelled = false;
    setDealSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/opportunities?pageSize=20${q ? `&search=${encodeURIComponent(q)}` : ""}`,
        );
        if (res.ok) {
          const d = (await res.json()) as { items?: DealOption[]; deals?: DealOption[] };
          if (!cancelled) setDealResults(d.items ?? d.deals ?? []);
        }
      } catch {
        /* transient — leave prior results */
      } finally {
        if (!cancelled) setDealSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dealQuery, dealMenuOpen]);

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

  // CLE-14: result-returning core of the "Confirm mapping" button. PATCHes the
  // template's componentMap and refreshes. Returns {ok,error?} so the chat action
  // and the button share ONE fetch (AC-NODUP) — the button discards the result.
  const confirmMapping = useCallback(
    async (templateId: string, map: ComponentMap | null): Promise<{ ok: boolean; error?: string }> => {
      if (!templateId || !map) return { ok: false, error: "Nothing to confirm." };
      setBusy(true);
      setNotice(null);
      const res = await fetch(`/api/proposals/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentMap: map }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setBusy(false);
      if (!res.ok) {
        const msg =
          d.error === "invalid_map"
            ? "Every component needs a label, and every field needs a data source."
            : "Could not save the mapping.";
        setNotice(msg);
        return { ok: false, error: msg };
      }
      setNotice("Template mapped. Draft a proposal from a deal below.");
      await loadList();
      await openTemplate(templateId);
      return { ok: true };
    },
    [loadList, openTemplate],
  );

  async function confirmMap() {
    if (!selected || !draft) return;
    await confirmMapping(selected.id, draft);
  }

  // CLE-14: result-returning core of the "Draft proposal" button. POSTs the deal
  // to the template fill endpoint and stores the filled draft. Returns {ok,error?}
  // so the chat action and the button share ONE fetch (AC-NODUP).
  const fillFromDeal = useCallback(
    async (templateId: string, deal: string): Promise<{ ok: boolean; error?: string }> => {
      if (!templateId || !deal.trim()) return { ok: false, error: "A deal is required." };
      setFilling(true);
      setNotice(null);
      setFilled(null);
      setEdits({});
      const res = await fetch(`/api/proposals/templates/${templateId}/fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: deal.trim() }),
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
        const msg =
          d.error === "deal_not_found"
            ? "No deal found with that id."
            : d.error === "template_not_mapped"
              ? "Confirm the mapping before drafting."
              : d.userSuggestion ?? d.message ?? "Drafting failed.";
        setNotice(msg);
        return { ok: false, error: msg };
      }
      setFilled({
        proposalId: d.proposalId ?? "",
        components: d.components ?? [],
        unmappedSections: d.unmappedSections ?? [],
      });
      return { ok: true };
    },
    [],
  );

  async function runFill() {
    if (!selected || !dealId.trim()) return;
    await fillFromDeal(selected.id, dealId);
  }

  // CLE-14: result-returning. Both the "Save edits" button and the chat action
  // call this; it surfaces {ok,error?} from the single PATCH.
  const saveEdits = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const f = filledRef.current;
    if (!f || Object.keys(editsRef.current).length === 0) return { ok: false, error: "No edits to save." };
    const ed = editsRef.current;
    const components = Object.entries(ed).map(([componentId, content]) => ({ componentId, content }));
    const res = await fetch(`/api/proposals/${f.proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ components }),
    });
    if (!res.ok) {
      setNotice("Could not save edits.");
      return { ok: false, error: "Could not save edits." };
    }
    setFilled((prev) =>
      prev
        ? {
            ...prev,
            components: prev.components.map((c) =>
              ed[c.componentId] != null ? { ...c, content: ed[c.componentId] } : c,
            ),
          }
        : prev,
    );
    setEdits({});
    setNotice("Edits saved — the download reflects your changes.");
    return { ok: true };
  }, []);

  // CLE-14: result-returning. `componentId` plus an optional `guidance`; when no
  // guidance is passed the button asks for it via prompt() (the chat action passes
  // guidance directly so it never prompts). One POST, shared by button + action.
  const regenerateOne = useCallback(
    async (componentId: string, guidance?: string): Promise<{ ok: boolean; error?: string }> => {
      const f = filledRef.current;
      if (!f) return { ok: false, error: "Draft a proposal first." };
      setRegenerating(componentId);
      setNotice(null);
      const res = await fetch(`/api/proposals/${f.proposalId}/components/${componentId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guidance: guidance || undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as Partial<FilledComponent> & { error?: string; userSuggestion?: string };
      setRegenerating(null);
      if (!res.ok) {
        const msg = d.userSuggestion ?? (d.error === "deal_not_found" ? "Deal not found." : "Re-draft failed.");
        setNotice(msg);
        return { ok: false, error: msg };
      }
      setFilled((prev) =>
        prev
          ? {
              ...prev,
              components: prev.components.map((c) =>
                c.componentId === componentId
                  ? {
                      ...c,
                      content: d.content ?? c.content,
                      confidence: d.confidence ?? c.confidence,
                      abstained: d.abstained ?? c.abstained,
                      citations: d.citations ?? c.citations,
                      supportRatio: d.supportRatio ?? c.supportRatio,
                      unsupported: d.unsupported ?? c.unsupported,
                    }
                  : c,
              ),
            }
          : prev,
      );
      setEdits((m) => {
        const next = { ...m };
        delete next[componentId];
        return next;
      });
      return { ok: true };
    },
    [],
  );

  // The button keeps the prompt() guidance step; the chat action passes guidance.
  function regenerateOneFromButton(componentId: string) {
    const guidance = window.prompt("Optional guidance for this re-draft (leave blank for a plain redo):") ?? undefined;
    void regenerateOne(componentId, guidance || undefined);
  }

  // ── CLE-14: register this page's actions for the chat live-executor. run()s
  //    reuse the result-returning helpers above; live values via refs. Stable id
  //    set ([]), so registration happens once. UPLOAD-SUBMIT and DOWNLOAD-STREAM
  //    are NEVER registered (see PROPOSALS_EXCLUDED_IDS); the two safe edges below
  //    only OPEN the native picker / NAVIGATE to the download URL. ──
  const proposalActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "proposals.draftFromDeal",
        title: "Draft a proposal from a deal",
        description:
          "Draft a proposal by filling a mapped template with a deal's data (company, deal value, recent " +
          "activity). Requires the template id and a deal id. Use when the user names a template and a deal.",
        params: z.object({ templateId: z.string().min(1), dealId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ templateId, dealId: deal }): Promise<PageActionResult> => {
          if (!deal.trim()) return errResult("A deal is required.");
          const r = await fillFromDeal(templateId, deal.trim());
          return r.ok ? okResult("Drafted a proposal from the deal.") : errResult(r.error ?? "Drafting failed.");
        },
      }),
      definePageAction({
        id: "proposals.confirmMapping",
        title: "Confirm the template mapping",
        description:
          "Confirm the current draft component mapping for a template (saves the labels/data-sources the user " +
          "reviewed). Use after the user has edited the detected components and wants to lock the mapping in.",
        params: z.object({ templateId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ templateId }): Promise<PageActionResult> => {
          const r = await confirmMapping(templateId, draftRef.current);
          return r.ok ? okResult("Confirmed the template mapping.") : errResult(r.error ?? "Could not save the mapping.");
        },
      }),
      definePageAction({
        id: "proposals.editComponentMap",
        title: "Edit a component in the mapping",
        description:
          "Edit one component in the draft mapping by its row index: change its kind (section/field), label, " +
          "data source key, or confidence. Client-side only — pair with confirmMapping to persist.",
        params: z.object({
          index: z.number().int().min(0),
          kind: z.string().optional(),
          label: z.string().optional(),
          dataKey: z.string().optional(),
          confidence: z.number().optional(),
        }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ index, kind, label, dataKey, confidence }): Promise<PageActionResult> => {
          const map = draftRef.current;
          if (!map || index >= map.components.length) return errResult(`No component at index ${index}.`);
          const patch: Partial<Component> = {};
          if (kind !== undefined) patch.kind = kind as Component["kind"];
          if (label !== undefined) patch.label = label;
          if (dataKey !== undefined) patch.dataKey = dataKey;
          if (confidence !== undefined) patch.confidence = confidence as unknown as Component["confidence"];
          patchComponent(index, patch);
          return okResult("Updated the component mapping.");
        },
      }),
      definePageAction({
        id: "proposals.regenerateComponent",
        title: "Regenerate a proposal component",
        description:
          "Re-draft one component of the filled proposal (optionally with guidance, e.g. 'shorter' or 'mention " +
          "their SOC 2'). Requires the proposal id and the component id. Use when the user wants a redo.",
        params: z.object({
          proposalId: z.string().min(1),
          componentId: z.string().min(1),
          guidance: z.string().optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ componentId, guidance }): Promise<PageActionResult> => {
          if (!filledRef.current) return errResult("Draft a proposal first.");
          const r = await regenerateOne(componentId, guidance);
          return r.ok ? okResult("Regenerated the component.") : errResult(r.error ?? "Re-draft failed.");
        },
      }),
      definePageAction({
        id: "proposals.saveEdits",
        title: "Save proposal edits",
        description:
          "Save the user's text edits to the filled proposal's components so the download reflects them. Use " +
          "after the user has edited component text and wants to persist it.",
        params: z.object({ proposalId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async (): Promise<PageActionResult> => {
          if (!filledRef.current || Object.keys(editsRef.current).length === 0) return errResult("No edits to save.");
          const r = await saveEdits();
          return r.ok ? okResult("Saved your edits.") : errResult(r.error ?? "Could not save edits.");
        },
      }),
      // ── openTemplateUpload (SAFE EDGE: opens the native picker only) ──────────
      definePageAction({
        id: "proposals.openTemplateUpload",
        title: "Open the template file picker",
        description:
          "Open the file picker so the user can upload a .docx/.pptx proposal template. NOTE: you can OPEN the " +
          "picker but you CANNOT choose the file — the user must pick it in the dialog. Tell them the picker is open.",
        params: z.object({}),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async (): Promise<PageActionResult> => {
          fileRef.current?.click();
          return okResult("Opened the template picker - choose a .docx/.pptx (I can't pick the file for you).");
        },
      }),
      // ── openDownload (SAFE EDGE: navigates the browser to the download URL) ───
      definePageAction({
        id: "proposals.openDownload",
        title: "Download a proposal",
        description:
          "Download a filled proposal — navigates the browser to the download URL (the browser, not the agent, " +
          "receives the file). Defaults to the layout-faithful .docx/.pptx; pass format:'pdf' for a clean PDF.",
        params: z.object({ proposalId: z.string().min(1), format: z.enum(["docx", "pdf"]).optional() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ proposalId, format }): Promise<PageActionResult> => {
          const url = "/api/proposals/" + proposalId + "/download" + (format === "pdf" ? "?as=pdf" : "");
          window.location.href = url;
          return okResult("Downloading the proposal" + (format === "pdf" ? " (PDF)" : "") + ".");
        },
      }),
    ],
    // Stable id set; run() reads live values via refs and calls stable
    // useCallback helpers — so registration happens once (CLE-03/CLE-14).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(proposalActions);

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
                    <div className="relative">
                      <input
                        value={selectedDealLabel || dealQuery}
                        onChange={(e) => {
                          setDealQuery(e.target.value);
                          setSelectedDealLabel("");
                          setDealId("");
                          setDealMenuOpen(true);
                        }}
                        onFocus={() => setDealMenuOpen(true)}
                        placeholder="Search a deal by name or company"
                        className="w-64 rounded border px-2 py-1 text-[13px]"
                        style={{ borderColor: "var(--color-border-default)", background: "transparent", color: "var(--color-text-primary)" }}
                      />
                      {dealMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setDealMenuOpen(false)} />
                          <div
                            className="absolute left-0 top-full z-20 mt-1 max-h-64 w-80 overflow-y-auto rounded-md border py-1 shadow-lg"
                            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                          >
                            {dealSearching && (
                              <div className="px-3 py-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                                Searching…
                              </div>
                            )}
                            {!dealSearching && dealResults.length === 0 && (
                              <div className="px-3 py-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                                {dealQuery.trim() ? "No matching deals." : "No deals yet."}
                              </div>
                            )}
                            {dealResults.map((d) => (
                              <button
                                key={d.id}
                                onClick={() => {
                                  setDealId(d.id);
                                  setSelectedDealLabel(d.companyName ? `${d.name} · ${d.companyName}` : d.name);
                                  setDealMenuOpen(false);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-[13px]"
                                style={{ color: "var(--color-text-primary)" }}
                              >
                                <span className="font-medium">{d.name}</span>
                                <span className="ml-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                                  {d.companyName ? `· ${d.companyName} ` : ""}
                                  {d.stage ? `· ${d.stage}` : ""}
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => void runFill()}
                      disabled={filling || !dealId.trim()}
                      className="rounded-md px-3 py-1.5 text-[13px] font-medium"
                      style={{ background: "var(--color-accent)", color: "#fff", opacity: filling || !dealId.trim() ? 0.6 : 1 }}
                    >
                      {filling ? "Drafting…" : "Draft proposal"}
                    </button>
                    {filled && Object.keys(edits).length > 0 && (
                      <button
                        onClick={() => void saveEdits()}
                        className="rounded-md px-3 py-1.5 text-[13px] font-medium"
                        style={{ background: "var(--color-accent-soft)", color: "var(--color-text-primary)" }}
                      >
                        Save edits
                      </button>
                    )}
                    {filled && (
                      <a
                        href={`/api/proposals/${filled.proposalId}/download`}
                        className="text-[13px] underline"
                        style={{ color: "var(--color-accent)" }}
                      >
                        Download
                      </a>
                    )}
                    {filled && (
                      <a
                        href={`/api/proposals/${filled.proposalId}/download?as=pdf`}
                        className="text-[13px] underline"
                        style={{ color: "var(--color-accent)" }}
                      >
                        Download PDF
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
                            {c.unsupported && !c.abstained && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ background: "#7c2d12", color: "#fff" }}
                                title={`Only ${Math.round(c.supportRatio * 100)}% of claims trace to a cited source`}
                              >
                                unsupported
                              </span>
                            )}
                          </div>
                          <textarea
                            value={edits[c.componentId] ?? c.content}
                            onChange={(e) => setEdits((m) => ({ ...m, [c.componentId]: e.target.value }))}
                            rows={Math.min(10, Math.max(2, (edits[c.componentId] ?? c.content).split("\n").length + 1))}
                            className="w-full rounded border px-2 py-1 text-[13px]"
                            style={{ borderColor: "var(--color-border-default)", background: "transparent", color: "var(--color-text-primary)" }}
                          />
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
                          <div className="mt-1.5">
                            <button
                              onClick={() => regenerateOneFromButton(c.componentId)}
                              disabled={regenerating === c.componentId}
                              className="text-[11px] underline"
                              style={{ color: "var(--color-text-tertiary)" }}
                            >
                              {regenerating === c.componentId ? "Regenerating…" : "Regenerate"}
                            </button>
                          </div>
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
