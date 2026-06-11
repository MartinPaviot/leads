"use client";

/**
 * Persona search — Apollo-style "describe who you want to reach" in natural
 * language, right in the Accounts window. Parses the phrase into a structured
 * ICP (industries / sizes / geos / titles / seniorities), shows the live
 * Apollo match count, and saves it as the tenant ICP so it drives sourcing,
 * the daily call list, and fit scoring.
 *
 * Built on the shared Modal (escape / scroll-lock / overlay) for consistent
 * integration, and the auto-growing GrowTextarea so the user sees the full
 * description as they type.
 */

import { useState } from "react";
import { Loader2, Search, X, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { GrowTextarea } from "@/components/ui/grow-textarea";
import { useToast } from "@/components/ui/toast";

interface ParsedIcp {
  industries: string[];
  keywords: string[];
  companySizes: string[];
  geographies: string[];
  excludeGeographies: string[];
  technologies: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  fundingRecencyDays: number | null;
  titles: string[];
  seniorities: string[];
}

const EMPTY: ParsedIcp = {
  industries: [], keywords: [], companySizes: [], geographies: [], excludeGeographies: [],
  technologies: [], revenueMin: null, revenueMax: null, fundingRecencyDays: null, titles: [], seniorities: [],
};

const EXAMPLES = [
  "VP Engineering and CTOs at Series B fintech in France, 50-200 employees",
  "decision makers at mid-market healthcare companies in Suisse romande",
  "Heads of Sales at B2B SaaS using Salesforce, 200-1000, recently funded",
];

export function PersonaSearch({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { toast } = useToast();
  const [phrase, setPhrase] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [icp, setIcp] = useState<ParsedIcp | null>(null);
  const [summary, setSummary] = useState("");
  const [estimate, setEstimate] = useState<{ total: number | null; capped?: boolean; gated?: boolean } | null>(null);
  // Evidence-backed preview: real example matches per source so the user
  // can SEE the target is right (Apollo's fuzzy keyword match vs the
  // registries' exact NAF match) before sourcing.
  const [preview, setPreview] = useState<{
    sources: Array<{
      source: string;
      sample: Array<{ name: string | null; domain: string | null; industry: string | null }>;
      more?: boolean;
      error?: string;
    }>;
  } | null>(null);

  async function parse(q: string) {
    if (!q.trim()) return;
    setParsing(true);
    setEstimate(null);
    setPreview(null);
    try {
      const res = await fetch("/api/icp/parse-nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Couldn't understand that — try rephrasing", "error");
        return;
      }
      const parsed: ParsedIcp = { ...EMPTY, ...data.icp };
      setIcp(parsed);
      setSummary(data.summary || "");
      void runEstimate(parsed);
      void runPreview(parsed);
    } catch {
      toast("Network error — try again", "error");
    } finally {
      setParsing(false);
    }
  }

  async function runEstimate(p: ParsedIcp) {
    try {
      const res = await fetch("/api/tam/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: p.industries,
          keywords: p.keywords,
          companySizes: p.companySizes,
          geographies: p.geographies,
          excludeGeographies: p.excludeGeographies,
          technologies: p.technologies,
          revenueMin: p.revenueMin,
          revenueMax: p.revenueMax,
          fundingRecencyDays: p.fundingRecencyDays,
        }),
      });
      if (res.status === 402 || res.status === 500) {
        setEstimate({ total: null, gated: true });
        return;
      }
      const data = await res.json();
      setEstimate({ total: data.total ?? null, capped: data.capped });
    } catch {
      setEstimate({ total: null, gated: true });
    }
  }

  async function runPreview(p: ParsedIcp) {
    try {
      const res = await fetch("/api/tam/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: p.industries,
          keywords: p.keywords,
          companySizes: p.companySizes,
          geographies: p.geographies,
          technologies: p.technologies,
          revenueMin: p.revenueMin,
          revenueMax: p.revenueMax,
        }),
      });
      if (!res.ok) {
        setPreview(null);
        return;
      }
      const data = await res.json();
      setPreview({ sources: data.sources ?? [] });
    } catch {
      setPreview(null);
    }
  }

  function removeChip(field: keyof ParsedIcp, value: string) {
    if (!icp) return;
    const next = { ...icp, [field]: (icp[field] as string[]).filter((v) => v !== value) };
    setIcp(next);
    void runEstimate(next);
    void runPreview(next);
  }

  async function save() {
    if (!icp) return;
    setSaving(true);
    try {
      const res = await fetch("/api/icp/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(icp),
      });
      if (!res.ok) {
        toast("Couldn't save the ICP", "error");
        return;
      }
      toast("Saved as your ICP — Elevay will source these accounts", "success");
      onSaved?.();
      onClose();
    } catch {
      toast("Network error — try again", "error");
    } finally {
      setSaving(false);
    }
  }

  const chip = (field: keyof ParsedIcp, value: string, tone: "default" | "exclude" = "default") => (
    <span
      key={field + value}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]"
      style={{
        background: tone === "exclude" ? "var(--color-error-soft)" : "var(--color-accent-soft)",
        color: tone === "exclude" ? "var(--color-error)" : "var(--color-accent)",
      }}
    >
      {value}
      <button type="button" onClick={() => removeChip(field, value)} className="opacity-60 transition-opacity hover:opacity-100" aria-label={`Remove ${value}`}>
        <X size={11} />
      </button>
    </span>
  );

  const Group = ({ label, field, tone }: { label: string; field: keyof ParsedIcp; tone?: "default" | "exclude" }) => {
    const vals = (icp?.[field] as string[]) ?? [];
    if (vals.length === 0) return null;
    return (
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>{label}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{vals.map((v) => chip(field, v, tone))}</div>
      </div>
    );
  };

  return (
    <Modal open onClose={onClose} title="Find your ideal accounts" size="lg">
      <p className="text-[12.5px]" style={{ color: "var(--color-text-tertiary)" }}>
        Describe who you want to reach in plain language — Elevay turns it into your target audience.
      </p>

      <div className="mt-3 flex items-end gap-2">
        <GrowTextarea
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onSubmit={() => { if (phrase.trim()) parse(phrase); }}
          placeholder="e.g. VP Engineering at Series B fintech in France, 50-200, using AWS"
          autoFocus
          className="flex-1"
          style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
        />
        <Button variant="gradient" disabled={parsing || !phrase.trim()} onClick={() => parse(phrase)}>
          {parsing ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {icp ? "Refine" : "Search"}
        </Button>
      </div>

      {!icp && (
        <div className="mt-3 flex flex-col gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => { setPhrase(ex); parse(ex); }}
              className="text-left text-[12px] transition-colors hover:underline" style={{ color: "var(--color-text-tertiary)" }}>
              &ldquo;{ex}&rdquo;
            </button>
          ))}
        </div>
      )}

      {icp && (
        <div className="mt-5">
          <div className="space-y-3.5 overflow-y-auto pr-1" style={{ maxHeight: "44vh" }}>
            {summary && (
              <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>{summary}</p>
            )}
            <Group label="Industries" field="industries" />
            <Group label="Keywords" field="keywords" />
            <Group label="Company size" field="companySizes" />
            <Group label="Geographies" field="geographies" />
            <Group label="Exclude" field="excludeGeographies" tone="exclude" />
            <Group label="Technologies" field="technologies" />
            <Group label="Titles (persona)" field="titles" />
            <Group label="Seniority" field="seniorities" />
          </div>

          <div className="mt-3.5 rounded-lg px-3.5 py-2.5 text-[13px]" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}>
            {estimate === null ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Estimating reach…</span>
            ) : estimate.gated ? (
              <span>Connect sourcing in Settings to see the live match count. Your ICP still saves and drives sourcing.</span>
            ) : estimate.total === null ? (
              <span>Couldn&rsquo;t fetch the live count right now.</span>
            ) : (
              <span>≈ <strong style={{ color: "var(--color-text-primary)" }}>{estimate.total.toLocaleString()}{estimate.capped ? "+" : ""}</strong> companies match this audience.</span>
            )}
          </div>

          {preview && preview.sources.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
                Real matches by source — check the target is right
              </div>
              {preview.sources.map((s) => (
                <div key={s.source} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--color-border-default)" }}>
                  <div className="text-[12px] font-medium capitalize" style={{ color: "var(--color-text-primary)" }}>
                    {s.source}
                    {s.sample.length > 0 ? ` · ${s.sample.length}${s.more ? "+" : ""} examples` : ""}
                  </div>
                  {s.sample.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {s.sample.map((c, i) => (
                        <li key={i} className="truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                          {c.name ?? c.domain ?? "—"}
                          {c.domain ? ` · ${c.domain}` : ""}
                          {c.industry ? ` · ${c.industry}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {s.error ? "unavailable" : "no exact match for this source"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button variant="gradient" className="mt-3.5 w-full" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Save as my ICP
          </Button>
        </div>
      )}
    </Modal>
  );
}
