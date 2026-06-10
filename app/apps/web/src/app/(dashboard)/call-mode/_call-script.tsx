"use client";

/**
 * In-call script panel — EDITABLE + per-tenant (no hardcoded content). Loads
 * the tenant's saved script for the typed sector from /api/calls/script,
 * renders it (opener interpolated with the prospect name / sector / geo, with
 * the problems checkable as the prospect validates), and lets the rep edit it
 * inline or regenerate it from their product + ICP. Customizable, kept simple:
 * read view + one "Éditer" toggle + a "Régénérer" button.
 *
 * No emoji per the brand rule — Lucide icons only. Design-system tokens only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CalendarClock, Phone, Pencil, Sparkles, Loader2, X, Plus, Trash2, AlertTriangle } from "lucide-react";
import { interpolateOpener, defaultScriptFields, splitGuidance, withNoResponse, type ScriptFields } from "@/lib/call-mode/call-scripts";
import { deriveOpeningReason, REASON_BRIDGE, type OpeningReasonInput } from "@/lib/call-mode/live-script";
import { planProblems } from "@/lib/call-mode/match-problem";
import { checkScriptMethod } from "@/lib/call-mode/script-levers";
import type { ScriptContext } from "@/lib/voice/script-context";
import { useToast } from "@/components/ui/toast";

export function CallScriptPanel({
  contactName,
  contactId,
  defaultSector,
  defaultGeo,
  reasonInput,
  triggerText,
  replaceableTool,
  onContext,
}: {
  contactName?: string | null;
  /** Focal prospect id — lets Régénérer ground the draft on THIS prospect's
   *  server-side evidence (cited fail-closed). */
  contactId?: string | null;
  defaultSector?: string | null;
  defaultGeo?: string | null;
  /** Grounded prospect context (live signal + dossier) — drives the sayable
   *  reason said right after the opener (voiceable triggers only). */
  reasonInput?: OpeningReasonInput;
  /** The prospect's trigger text (detected stack + signal) — floats the most
   *  relevant enjeu to the top of the problem list. */
  triggerText?: string | null;
  /** The detected REPLACEABLE tool (catalog-classified) — interpolated into
   *  {tool} enjeux so the top problem literally names what they run. */
  replaceableTool?: string | null;
  /** Reports what the panel is showing (reason source, matched enjeu, tool) so
   *  the dial captures it as the call's scriptContext. */
  onContext?: (ctx: ScriptContext) => void;
}) {
  const { toast } = useToast();
  const [sector, setSector] = useState(defaultSector ?? "");
  const [geo, setGeo] = useState(defaultGeo ?? "");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [fields, setFields] = useState<ScriptFields>(() => defaultScriptFields(defaultSector));
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ScriptFields | null>(null);
  // Review-time grounding notes for a freshly generated draft ("Ancré : …"
  // under the enjeux built on this prospect's evidence). Cleared as soon as
  // the rep restructures the list — a stale note is worse than none.
  const [draftGrounding, setDraftGrounding] = useState<Array<{ index: number; fact: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Load the tenant's saved script for this sector (debounced on sector).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/calls/script?sector=${encodeURIComponent(sector)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d?.script) return;
          setFields({
            opener: d.script.opener,
            problems: d.script.problems ?? [],
            permissionCheck: d.script.permissionCheck,
            bookingAsk: d.script.bookingAsk,
            guidance: d.script.guidance ?? [],
          });
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sector]);

  // Auto-fill the sector from the selected account's industry once the brain
  // loads (it arrives async, per contact). The rep can still type to override.
  useEffect(() => {
    if (defaultSector) setSector(defaultSector);
  }, [defaultSector]);

  const opener = useMemo(
    () => interpolateOpener(fields.opener, { name: contactName, sector, geo }),
    [fields.opener, contactName, sector, geo],
  );
  // The sayable reason to call THIS prospect — said right after the permission
  // opener (Bloc 2). Voiceable triggers only; null ⇒ absent (open on the gate).
  const reason = deriveOpeningReason(reasonInput ?? {});
  const anyChecked = checked.size > 0;
  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  const inputStyle = {
    background: "var(--color-bg-base)",
    border: "1px solid var(--color-border-default)",
    color: "var(--color-text-primary)",
  } as const;

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calls/script", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector, fields: { ...draft, problems: draft.problems.filter((p) => p.trim()) } }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || "Enregistrement impossible", "error"); return; }
      setFields({ opener: data.script.opener, problems: data.script.problems ?? [], permissionCheck: data.script.permissionCheck, bookingAsk: data.script.bookingAsk, guidance: data.script.guidance ?? [] });
      setEditing(false);
      setDraft(null);
      setDraftGrounding([]);
      toast("Script enregistré", "success");
    } catch { toast("Erreur réseau", "error"); }
    finally { setSaving(false); }
  }

  async function regenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/calls/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // contactId grounds the draft on THIS prospect's server-side evidence.
        body: JSON.stringify({ sector, contactId: contactId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || "Génération impossible", "error"); return; }
      const d: ScriptFields = { ...data.draft, guidance: data.draft.guidance ?? fields.guidance };
      setDraft(d);
      setDraftGrounding(Array.isArray(data.grounding) ? data.grounding : []);
      setEditing(true);
      toast(
        Array.isArray(data.grounding) && data.grounding.length > 0
          ? "Brouillon généré, ancré sur ce prospect — relisez puis enregistrez"
          : "Brouillon généré — relisez puis enregistrez",
        "success",
      );
    } catch { toast("Erreur réseau", "error"); }
    finally { setGenerating(false); }
  }

  const view = editing && draft ? draft : fields;
  const { noResponse: viewNoResp, tips: viewTips } = splitGuidance(view.guidance);
  // Plan the per-prospect problem list: {tool} enjeux interpolated with the
  // detected replaceable tool (hidden when none), most relevant one first.
  const { display: problemDisplay, matchedIdx } = useMemo(
    () => planProblems(view.problems, triggerText, replaceableTool),
    [view.problems, triggerText, replaceableTool],
  );
  const orderedProblems = useMemo(() => {
    if (matchedIdx < 0) return problemDisplay;
    return [...problemDisplay].sort((a, b) => Number(b.idx === matchedIdx) - Number(a.idx === matchedIdx));
  }, [problemDisplay, matchedIdx]);
  // Methodology guard on whatever is being shown (saved script OR live draft):
  // soft markers, never blocking — the rep stays free, but informed.
  const methodGaps = useMemo(() => checkScriptMethod(view), [view]);

  // Report what the panel is showing so the dial can stamp it on the call
  // (scriptContext). Latest-callback ref so the parent's inline arrow doesn't
  // retrigger the effect every render.
  const onContextRef = useRef(onContext);
  onContextRef.current = onContext;
  const matchedViaTool = matchedIdx >= 0 && (problemDisplay.find((d) => d.idx === matchedIdx)?.viaTool ?? false);
  useEffect(() => {
    onContextRef.current?.({
      reasonSource: reason?.source ?? null,
      matchedEnjeu: matchedIdx >= 0,
      viaTool: matchedViaTool,
      tool: replaceableTool ?? null,
    });
  }, [reason?.source, matchedIdx, matchedViaTool, replaceableTool]);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-3.5"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div className="flex items-center gap-2">
        <Phone size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Script d&apos;appel</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={regenerate}
            disabled={generating}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ color: "var(--color-text-secondary)" }}
            title="Régénérer depuis votre produit + ICP"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Régénérer
          </button>
          {!editing ? (
            <button
              type="button"
              onClick={() => { setDraft({ ...fields }); setEditing(true); }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <Pencil size={12} /> Éditer
            </button>
          ) : (
            <>
              <button type="button" onClick={save} disabled={saving}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Enregistrer
              </button>
              <button type="button" onClick={() => { setEditing(false); setDraft(null); setDraftGrounding([]); }}
                className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ color: "var(--color-text-tertiary)" }} title="Annuler">
                <X size={13} />
              </button>
            </>
          )}
        </span>
      </div>

      <div className="flex gap-2">
        <input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Secteur (ex. Santé, Fondation)"
          className="flex-1 rounded-md px-2 py-1 text-[12px]" style={inputStyle} />
        <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="Géographie (ex. Genève)"
          className="flex-1 rounded-md px-2 py-1 text-[12px]" style={inputStyle} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Loader2 size={13} className="animate-spin" /> Chargement du script…
        </div>
      ) : editing && draft ? (
        // ── Edit mode — simple inline fields ──
        <div className="flex flex-col gap-2.5">
          <Field label="Accroche — permission-based, « vous avez 2 min ? » ({name} interpolé)">
            <textarea value={draft.opener} onChange={(e) => setDraft({ ...draft, opener: e.target.value })}
              rows={2} className="w-full resize-y rounded-md px-2 py-1.5 text-[12.5px]" style={inputStyle} />
          </Field>
          <Field label="Enjeux (validés un par un en appel — {tool} = outil détecté chez le prospect, masqué sinon)">
            <div className="flex flex-col gap-1.5">
              {draft.problems.map((p, i) => {
                const grounded = draftGrounding.find((g) => g.index === i);
                return (
                <div key={i} className="flex flex-col gap-0.5">
                  <div className="flex items-start gap-1.5">
                    <input value={p} onChange={(e) => { const next = [...draft.problems]; next[i] = e.target.value; setDraft({ ...draft, problems: next }); setDraftGrounding((g) => g.filter((e2) => e2.index !== i)); }}
                      className="flex-1 rounded-md px-2 py-1 text-[12.5px]" style={inputStyle} />
                    <button type="button" onClick={() => { setDraft({ ...draft, problems: draft.problems.filter((_, j) => j !== i) }); setDraftGrounding([]); }}
                      className="mt-0.5 rounded p-1 transition-colors hover:bg-[var(--color-bg-hover)]" style={{ color: "var(--color-text-tertiary)" }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {grounded && (
                    <span className="ml-1 w-fit rounded-sm px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                      Ancré : {grounded.fact}
                    </span>
                  )}
                </div>
                );
              })}
              {draft.problems.length < 5 && (
                <button type="button" onClick={() => setDraft({ ...draft, problems: [...draft.problems, ""] })}
                  className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-[var(--color-bg-hover)]" style={{ color: "var(--color-accent)" }}>
                  <Plus size={12} /> Ajouter un enjeu
                </button>
              )}
            </div>
          </Field>
          <Field label="Question de validation">
            <input value={draft.permissionCheck} onChange={(e) => setDraft({ ...draft, permissionCheck: e.target.value })}
              className="w-full rounded-md px-2 py-1 text-[12.5px]" style={inputStyle} />
          </Field>
          <Field label="Demande de rendez-vous">
            <textarea value={draft.bookingAsk} onChange={(e) => setDraft({ ...draft, bookingAsk: e.target.value })}
              rows={2} className="w-full resize-y rounded-md px-2 py-1.5 text-[12.5px]" style={inputStyle} />
          </Field>
          <Field label="Réponse si « non »">
            <textarea value={splitGuidance(draft.guidance).noResponse}
              onChange={(e) => setDraft({ ...draft, guidance: withNoResponse(splitGuidance(draft.guidance).tips, e.target.value) })}
              rows={3} className="w-full resize-y rounded-md px-2 py-1.5 text-[12.5px]" style={inputStyle} />
          </Field>
        </div>
      ) : (
        // ── Read mode — what to say ──
        <>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>{opener}</p>
          {reason && (
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              <span style={{ color: "var(--color-text-tertiary)" }}>{REASON_BRIDGE} </span>
              {reason.fact}
              <span
                className="ml-1.5 rounded-sm px-1.5 py-px align-middle text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
                title="Source de la raison"
              >
                {reason.sourceLabel}
              </span>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {orderedProblems.map(({ idx: i, text: p, viaTool }) => {
              const isMatch = i === matchedIdx;
              return (
                <button key={i} type="button" onClick={() => toggle(i)}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-bg-hover)]"
                  style={{ color: "var(--color-text-secondary)" }}>
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                    style={{ borderColor: checked.has(i) ? "var(--color-accent)" : "var(--color-border-default)", background: checked.has(i) ? "var(--color-accent)" : "transparent" }}>
                    {checked.has(i) && <Check size={11} color="#fff" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    {p}
                    {isMatch && (
                      <span className="ml-1.5 rounded-sm px-1.5 py-px align-middle text-[9px] font-semibold uppercase tracking-wide" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                        {viaTool ? "Détecté chez eux" : "Le plus pertinent"}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{view.permissionCheck}</p>
          <div className="flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]"
            style={{ background: anyChecked ? "var(--color-accent-soft)" : "var(--color-bg-hover)", color: anyChecked ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>
            <CalendarClock size={14} className="mt-0.5 shrink-0" />
            <span>{view.bookingAsk}</span>
          </div>
          {viewNoResp && (
            <div className="rounded-md px-3 py-2 text-[12.5px]" style={{ background: "var(--color-bg-hover)" }}>
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Si le prospect dit non</div>
              <span style={{ color: "var(--color-text-primary)" }}>{viewNoResp}</span>
            </div>
          )}
          {viewTips.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {viewTips.map((g, i) => (
                <li key={i} className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{g}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Méthode — soft lever markers on the shown script (read AND draft).
          Informative, never blocking: the rep owns the words. */}
      {!loading && methodGaps.length > 0 && (
        <div
          className="rounded-md border px-3 py-2"
          style={{ borderColor: "rgba(234,179,8,.35)", background: "rgba(234,179,8,.06)" }}
        >
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "rgb(133,77,14)" }}>
            <AlertTriangle size={11} />
            Méthode — {methodGaps.length} point{methodGaps.length > 1 ? "s" : ""} à revoir
          </div>
          <ul className="flex flex-col gap-1">
            {methodGaps.map((g) => (
              <li key={g.id} className="text-[11px] leading-snug" style={{ color: "var(--color-text-secondary)" }}>
                <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{g.label}</span>
                <span style={{ color: "var(--color-text-tertiary)" }}> — {g.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
