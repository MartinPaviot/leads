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
import { Check, CalendarClock, Phone, Pencil, Sparkles, Loader2, X, Plus, Trash2, AlertTriangle, ChevronRight, ChevronDown, ShieldQuestion } from "lucide-react";
import { interpolateOpener, prefixObservation, defaultScriptFields, splitGuidance, withNoResponse, lineFor, lineForKey, peerLeadFor, resolveBranches, personaEnjeuIndex, enjeuKeyForIndex, type ScriptFields } from "@/lib/call-mode/call-scripts";
import { deriveOpeningReason, type OpeningReasonInput } from "@/lib/call-mode/live-script";
import { planProblems } from "@/lib/call-mode/match-problem";
import { checkScriptMethod } from "@/lib/call-mode/script-levers";
import type { ScriptContext } from "@/lib/voice/script-context";
import { useToast } from "@/components/ui/toast";

/** Sector key → short French label for the "détecté" hint. */
const SECTOR_LABEL: Record<string, string> = {
  sante: "santé / soin",
  fondations: "fondations / social",
  parapublic: "parapublic",
  international: "international",
  education: "hautes écoles",
  it: "IT & services",
  conseil: "conseil",
  "low-tech": "industrie / terrain",
  generic: "générique",
};

export function CallScriptPanel({
  contactName,
  contactTitle,
  companyName,
  companyDomain,
  contactId,
  defaultSector,
  defaultGeo,
  reasonInput,
  triggerText,
  replaceableTool,
  onContext,
}: {
  contactName?: string | null;
  /** The contact's title — floats the enjeu their ROLE cares about (CFO → coût,
   *  DSI → souveraineté, DG → retard IA) when no live trigger overrides. */
  contactTitle?: string | null;
  /** The account name — one of the signals the server crosses to resolve the
   *  sector (a "Haute école de santé" is a SCHOOL, not an EMS). */
  companyName?: string | null;
  /** The account domain — lets the server load the company and cross ALL its
   *  signals (NAICS, our classif, industry) for the most reliable sector. */
  companyDomain?: string | null;
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
  const [fields, setFields] = useState<ScriptFields>(() => defaultScriptFields([companyName, defaultSector].filter(Boolean).join(" ")));
  // Sector resolved server-side by crossing the company's signals (the waterfall):
  // the key + which signals voted for it ("via"), shown for transparency.
  const [resolvedSector, setResolvedSector] = useState<string | null>(null);
  const [resolvedVia, setResolvedVia] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ScriptFields | null>(null);
  // Review-time grounding notes for a freshly generated draft ("Ancré : …"
  // under the enjeux built on this prospect's evidence). Cleared as soon as
  // the rep restructures the list — a stale note is worse than none.
  const [draftGrounding, setDraftGrounding] = useState<Array<{ index: number; fact: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  // Beyond the happy path: gatekeeper, voicemail, callback, objection playbook.
  const branches = useMemo(() => resolveBranches({ name: contactName }), [contactName]);

  // Load the tenant's saved script for this sector (debounced on sector).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ sector, name: companyName ?? "", domain: companyDomain ?? "" });
      fetch(`/api/calls/script?${qs.toString()}`)
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
          setResolvedSector(typeof d.resolvedSector === "string" ? d.resolvedSector : null);
          setResolvedVia(Array.isArray(d.via) ? d.via : []);
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sector, companyName, companyDomain]);

  // Auto-fill the sector AND the geography from the selected account once the
  // brain loads (it arrives async, per contact), and re-sync on prospect
  // switch so neither field carries the previous prospect's value. The rep
  // can still type to override.
  useEffect(() => { setSector(defaultSector ?? ""); }, [contactId, defaultSector]);
  useEffect(() => { setGeo(defaultGeo ?? ""); }, [contactId, defaultGeo]);

  // Live reason kept for call telemetry (onContext.reasonSource); the spoken
  // opener is identity + the prospect's sector tied to our subject (no tool in
  // the opener — the tool only floats the matched enjeu downstream).
  const reason = deriveOpeningReason(reasonInput ?? {});
  // The opener line follows the server-resolved sector (the full signal
  // waterfall) when available; before it returns, fall back to a name+sector
  // substring guess so the panel is never blank.
  const openerLine = useMemo(
    () => (resolvedSector ? lineForKey(resolvedSector) : lineFor([companyName, sector].filter(Boolean).join(" "))),
    [resolvedSector, companyName, sector],
  );
  // Identity + sector↔subject + permission opener. When a fresh, voiceable
  // signal exists on the prospect, LEAD with it (Douablin's observation).
  const opener = useMemo(
    () => prefixObservation(
      interpolateOpener(fields.opener, { name: contactName, sector, geo, line: openerLine }),
      reason?.observation,
    ),
    [fields.opener, contactName, sector, geo, openerLine, reason?.observation],
  );
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
  // Live trigger (detected tool/signal) wins; otherwise float the enjeu the
  // contact's ROLE cares about (CFO → coût, DSI → souveraineté, DG → retard).
  const personaIdx = useMemo(() => personaEnjeuIndex(contactTitle), [contactTitle]);
  const floatIdx = matchedIdx >= 0 ? matchedIdx : (personaIdx ?? -1);
  const floatViaPersona = matchedIdx < 0 && personaIdx != null;
  const orderedProblems = useMemo(() => {
    if (floatIdx < 0) return problemDisplay;
    return [...problemDisplay].sort((a, b) => Number(b.idx === floatIdx) - Number(a.idx === floatIdx));
  }, [problemDisplay, floatIdx]);
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
      // Learning loop: which sector + which enjeu the rep led with, so outcomes
      // can teach us which enjeu books best per sector.
      sector: resolvedSector ?? null,
      enjeuKey: enjeuKeyForIndex(floatIdx >= 0 ? floatIdx : 0),
    });
  }, [reason?.source, matchedIdx, matchedViaTool, replaceableTool, resolvedSector, floatIdx]);

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
      {!editing && resolvedSector && resolvedVia.length > 0 && (
        <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
          Secteur détecté : <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>{SECTOR_LABEL[resolvedSector] ?? resolvedSector}</span> · via {resolvedVia.join(", ")}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Loader2 size={13} className="animate-spin" /> Chargement du script…
        </div>
      ) : editing && draft ? (
        // ── Edit mode — simple inline fields ──
        <div className="flex flex-col gap-2.5">
          <Field label="Accroche — identité + secteur↔sujet ({name} et {line} interpolés)">
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
            <span className="w-fit rounded-sm px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
              Accroche ancrée sur : {reason.sourceLabel}
            </span>
          )}
          {/* Récit-pair — éclairer les 3 enjeux par un pair, jamais frontalement. */}
          <p className="text-[12px] italic" style={{ color: "var(--color-text-tertiary)" }}>{peerLeadFor(sector)}</p>
          <div className="flex flex-col gap-1.5">
            {orderedProblems.map(({ idx: i, text: p, viaTool }) => {
              const isMatch = i === floatIdx;
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
                        {floatViaPersona ? "Adapté au rôle" : viaTool ? "Détecté chez eux" : "Le plus pertinent"}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {view.permissionCheck && (
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{view.permissionCheck}</p>
          )}
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

      {/* Branches — beyond the happy path (gatekeeper / voicemail / callback /
          objections). Collapsed by default so the main flow stays clean. */}
      {!loading && !editing && (
        <div className="border-t pt-2.5" style={{ borderColor: "var(--color-border-default)" }}>
          <button
            type="button"
            onClick={() => setShowBranches((v) => !v)}
            className="flex w-full items-center gap-1.5 text-[11px] font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {showBranches ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <ShieldQuestion size={12} /> Objections &amp; branches ({branches.objections.length})
          </button>
          {showBranches && (
            <div className="mt-2 flex flex-col gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              <BranchLine label="Barrage (secrétariat)" body={branches.gatekeeper} note={branches.gatekeeperNote} />
              <BranchLine label="Répondeur" body={branches.voicemail} />
              <BranchLine label="Rappel convenu" body={branches.callback} />
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Objections</div>
                <div className="flex flex-col gap-1.5">
                  {branches.objections.map((o) => (
                    <div key={o.cue} className="leading-snug">
                      <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>« {o.cue} »</span>
                      <span style={{ color: "var(--color-text-tertiary)" }}> → </span>
                      {o.response}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
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

function BranchLine({ label, body, note }: { label: string; body: string; note?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>{label}</div>
      <p className="leading-snug" style={{ color: "var(--color-text-primary)" }}>{body}</p>
      {note && <p className="mt-0.5 text-[11px] italic" style={{ color: "var(--color-text-tertiary)" }}>{note}</p>}
    </div>
  );
}
