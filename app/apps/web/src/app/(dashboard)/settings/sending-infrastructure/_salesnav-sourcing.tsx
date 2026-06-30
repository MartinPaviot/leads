"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/**
 * Spec 36 (T11, #2) — the precise Sales-Navigator sourcing form. Free-text
 * industries/locations/titles resolve to LinkedIn ids; the advanced section adds
 * the structured filters LinkedIn actually exposes (seniority, function, company
 * size, tenure, spotlights) + the founder's own saved lists / searches. "Preview"
 * shows the segment size (TAM) before committing a run. The body shapes mirror the
 * live SN schema — see icp-to-salesnav.ts and the filter-vocabulary report.
 */

interface Param {
  id: string;
  title: string;
}
interface Collections {
  leadLists: Param[];
  accountLists: Param[];
  savedSearches: Param[];
  personas: Param[];
}
interface ResolvedRow {
  type: string;
  label: string;
  id: string | null;
  matched: string | null;
}

// Friendly labels for the fixed SN seniority enum (values are sent verbatim).
const SENIORITY: Array<{ value: string; label: string }> = [
  { value: "owner/partner", label: "Owner / Partner" },
  { value: "cxo", label: "CXO" },
  { value: "vice_president", label: "VP" },
  { value: "director", label: "Director" },
  { value: "experienced_manager", label: "Manager (exp.)" },
  { value: "entry_level_manager", label: "Manager (entry)" },
  { value: "strategic", label: "Strategic" },
  { value: "senior", label: "Senior IC" },
  { value: "entry_level", label: "Entry" },
  { value: "in_training", label: "In training" },
];

// Company-size buckets → the SN headcount {min,max} ranges (max omitted = "+").
const HEADCOUNT: Array<{ key: string; label: string; range: { min?: number; max?: number } }> = [
  { key: "1-10", label: "1–10", range: { min: 1, max: 10 } },
  { key: "11-50", label: "11–50", range: { min: 11, max: 50 } },
  { key: "51-200", label: "51–200", range: { min: 51, max: 200 } },
  { key: "201-500", label: "201–500", range: { min: 201, max: 500 } },
  { key: "501-1000", label: "501–1k", range: { min: 501, max: 1000 } },
  { key: "1001-5000", label: "1k–5k", range: { min: 1001, max: 5000 } },
  { key: "5001-10000", label: "5k–10k", range: { min: 5001, max: 10000 } },
  { key: "10001+", label: "10k+", range: { min: 10001 } },
];

const RECENT_ACTIVITIES: Array<{ value: string; label: string }> = [
  { value: "senior_leadership_changes", label: "Leadership changes" },
  { value: "funding_events", label: "Funding" },
];

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-2 py-0.5 text-[11px] transition-colors"
      style={{
        border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border)"}`,
        background: on ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
        color: on ? "var(--color-accent)" : "var(--color-text-secondary)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function SalesNavSourcing() {
  const { toast } = useToast();
  const [category, setCategory] = useState<"people" | "companies">("people");
  const [sourceQuery, setSourceQuery] = useState(""); // URL or keywords
  const [industries, setIndustries] = useState("");
  const [locations, setLocations] = useState("");
  const [titles, setTitles] = useState("");
  const [functions, setFunctions] = useState("");
  const [companies, setCompanies] = useState("");
  const [schools, setSchools] = useState("");
  const [seniorities, setSeniorities] = useState<Set<string>>(new Set());
  const [headcount, setHeadcount] = useState<Set<string>>(new Set());
  const [changedJobs, setChangedJobs] = useState(false);
  const [postedOnLinkedin, setPostedOnLinkedin] = useState(false);
  const [mentionedInNews, setMentionedInNews] = useState(false);
  const [hasJobOffers, setHasJobOffers] = useState(false);
  const [recentActivities, setRecentActivities] = useState<Set<string>>(new Set());
  const [savedSearchId, setSavedSearchId] = useState("");
  const [leadListId, setLeadListId] = useState("");
  const [hydrateAccounts, setHydrateAccounts] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [collections, setCollections] = useState<Collections | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null | "loading">(null);
  const [busy, setBusy] = useState(false);
  const [sourceResult, setSourceResult] = useState<{ accounts: number; contacts: number } | null>(null);
  const [resolution, setResolution] = useState<ResolvedRow[] | null>(null);
  const [dropped, setDropped] = useState<string[] | null>(null);

  // The seat's own saved lists / searches / personas (best-effort).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/linkedin/collections");
        if (res.ok && alive) setCollections((await res.json()) as Collections);
      } catch {
        /* ignore — the pickers just stay empty */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  // Assemble the /api/linkedin/source body from the form. Shared by preview + run.
  const buildPayload = useCallback(() => {
    const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const q = sourceQuery.trim();
    const isUrl = /^https?:\/\//i.test(q);
    const headcountRanges = HEADCOUNT.filter((h) => headcount.has(h.key)).map((h) => h.range);
    const payload: Record<string, unknown> = { category, hydrateAccounts };
    if (isUrl) {
      payload.url = q;
      return payload;
    }
    if (savedSearchId) {
      payload.savedSearchId = savedSearchId; // overrides everything else server-side
      return payload;
    }
    if (q) payload.keywords = q;
    if (industries.trim()) payload.industries = toList(industries);
    if (locations.trim()) payload.locations = toList(locations);
    if (category === "people") {
      if (titles.trim()) payload.jobTitles = toList(titles);
      if (functions.trim()) payload.functions = toList(functions);
      if (companies.trim()) payload.companies = toList(companies);
      if (schools.trim()) payload.schools = toList(schools);
      if (seniorities.size) payload.seniorities = [...seniorities];
      if (changedJobs) payload.changedJobs = true;
      if (postedOnLinkedin) payload.postedOnLinkedin = true;
      if (mentionedInNews) payload.mentionedInNews = true;
      if (leadListId) payload.leadListIds = [leadListId];
    } else {
      if (hasJobOffers) payload.hasJobOffers = true;
      if (recentActivities.size) payload.recentActivities = [...recentActivities];
    }
    if (headcountRanges.length) payload.companyHeadcount = headcountRanges;
    return payload;
  }, [
    sourceQuery,
    category,
    hydrateAccounts,
    savedSearchId,
    industries,
    locations,
    titles,
    functions,
    companies,
    schools,
    seniorities,
    headcount,
    changedJobs,
    postedOnLinkedin,
    mentionedInNews,
    hasJobOffers,
    recentActivities,
    leadListId,
  ]);

  const hasAnyInput = useMemo(() => {
    const p = buildPayload();
    return Object.keys(p).some((k) => k !== "category" && k !== "hydrateAccounts");
  }, [buildPayload]);

  const post = useCallback(
    async (extra: Record<string, unknown>) => {
      const res = await fetch("/api/linkedin/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), ...extra }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        accountsUpserted?: number;
        contactsUpserted?: number;
        total?: number | null;
        resolution?: ResolvedRow[];
        dropped?: string[];
        error?: string;
      };
      return { res, body };
    },
    [buildPayload],
  );

  const runPreview = useCallback(async () => {
    if (!hasAnyInput) return;
    setBusy(true);
    setPreviewTotal("loading");
    setResolution(null);
    setDropped(null);
    try {
      const { res, body } = await post({ preview: true });
      if (body.resolution) setResolution(body.resolution);
      if (body.dropped) setDropped(body.dropped);
      if (!res.ok) {
        setPreviewTotal(null);
        toast(body.error ?? "Preview failed", "error");
        return;
      }
      setPreviewTotal(body.total ?? null);
    } catch {
      setPreviewTotal(null);
      toast("Preview failed", "error");
    } finally {
      setBusy(false);
    }
  }, [hasAnyInput, post, toast]);

  const runSource = useCallback(async () => {
    if (!hasAnyInput) return;
    setBusy(true);
    setSourceResult(null);
    setResolution(null);
    setDropped(null);
    try {
      const { res, body } = await post({});
      if (body.resolution) setResolution(body.resolution);
      if (body.dropped) setDropped(body.dropped);
      if (!res.ok) {
        toast(body.error ?? "LinkedIn sourcing failed", "error");
        return;
      }
      const accounts = body.accountsUpserted ?? 0;
      const contacts = body.contactsUpserted ?? 0;
      setSourceResult({ accounts, contacts });
      toast(`Sourced ${accounts} account${accounts === 1 ? "" : "s"} and ${contacts} contact${contacts === 1 ? "" : "s"} from LinkedIn.`, "success");
    } catch {
      toast("LinkedIn sourcing failed", "error");
    } finally {
      setBusy(false);
    }
  }, [hasAnyInput, post, toast]);

  const fmt = (n: number) => new Intl.NumberFormat().format(n);
  const savedSearches = collections?.savedSearches ?? [];
  const leadLists = collections?.leadLists ?? [];

  return (
    <div className="rounded-md p-3" style={{ border: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Source your TAM from Sales Navigator
        </label>
        <div className="flex gap-1">
          {(["people", "companies"] as const).map((c) => (
            <Chip key={c} on={category === c} onClick={() => setCategory(c)} disabled={busy}>
              {c === "people" ? "People" : "Companies"}
            </Chip>
          ))}
        </div>
      </div>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        Paste a Sales Navigator search URL, type keywords, or target by ICP below. Results land in Accounts &amp;
        Contacts, deduped against your CRM and matched to your network for warm intros.
      </p>

      {/* URL / keywords */}
      <div className="mt-2 flex gap-2">
        <Input
          value={sourceQuery}
          onChange={(e) => setSourceQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSource();
          }}
          placeholder="Paste a Sales Navigator search URL, or type keywords"
          disabled={busy}
        />
      </div>

      {/* Core ICP free-text */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Industries (e.g. software, fintech)" disabled={busy} />
        <Input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Locations (e.g. France, United States)" disabled={busy} />
        {category === "people" && (
          <Input value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="Titles (e.g. Head of Sales, CRO)" disabled={busy} />
        )}
        {category === "people" && (
          <Input value={companies} onChange={(e) => setCompanies(e.target.value)} placeholder="Companies (e.g. Stripe, Datadog)" disabled={busy} />
        )}
      </div>

      {/* Seniority (people) — the decision-maker filter */}
      {category === "people" && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Seniority</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {SENIORITY.map((s) => (
              <Chip key={s.value} on={seniorities.has(s.value)} onClick={() => toggle(setSeniorities, s.value)} disabled={busy}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Company size */}
      <div className="mt-2">
        <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Company size</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {HEADCOUNT.map((h) => (
            <Chip key={h.key} on={headcount.has(h.key)} onClick={() => toggle(setHeadcount, h.key)} disabled={busy}>
              {h.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Spotlights / signals */}
      {category === "people" ? (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Buying signals</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip on={changedJobs} onClick={() => setChangedJobs((v) => !v)} disabled={busy}>Changed jobs</Chip>
            <Chip on={postedOnLinkedin} onClick={() => setPostedOnLinkedin((v) => !v)} disabled={busy}>Posted recently</Chip>
            <Chip on={mentionedInNews} onClick={() => setMentionedInNews((v) => !v)} disabled={busy}>In the news</Chip>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Buying signals</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip on={hasJobOffers} onClick={() => setHasJobOffers((v) => !v)} disabled={busy}>Hiring on LinkedIn</Chip>
            {RECENT_ACTIVITIES.map((a) => (
              <Chip key={a.value} on={recentActivities.has(a.value)} onClick={() => toggle(setRecentActivities, a.value)} disabled={busy}>
                {a.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Saved lists / searches — reuse what the founder already built in SN */}
      {(savedSearches.length > 0 || (category === "people" && leadLists.length > 0)) && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {savedSearches.length > 0 && (
            <label className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              Re-run a saved search
              <select
                value={savedSearchId}
                onChange={(e) => setSavedSearchId(e.target.value)}
                disabled={busy}
                className="mt-0.5 w-full rounded-md px-2 py-1 text-[12px]"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)" }}
              >
                <option value="">— none —</option>
                {savedSearches.map((s) => (
                  <option key={s.id} value={s.id}>{s.title.length > 60 ? `${s.title.slice(0, 60)}…` : s.title}</option>
                ))}
              </select>
            </label>
          )}
          {category === "people" && leadLists.length > 0 && (
            <label className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              Within a saved lead list
              <select
                value={leadListId}
                onChange={(e) => setLeadListId(e.target.value)}
                disabled={busy}
                className="mt-0.5 w-full rounded-md px-2 py-1 text-[12px]"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)" }}
              >
                <option value="">— any —</option>
                {leadLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.title.length > 60 ? `${l.title.slice(0, 60)}…` : l.title}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* Advanced: function / schools — less common */}
      {category === "people" && (
        <>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-2 text-[11px]"
            style={{ color: "var(--color-accent)" }}
          >
            {showAdvanced ? "Hide advanced filters" : "More filters (function, schools)"}
          </button>
          {showAdvanced && (
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input value={functions} onChange={(e) => setFunctions(e.target.value)} placeholder="Functions (e.g. Engineering, Sales)" disabled={busy} />
              <Input value={schools} onChange={(e) => setSchools(e.target.value)} placeholder="Schools (e.g. Stanford, HEC)" disabled={busy} />
            </div>
          )}
        </>
      )}

      {/* Enrichment toggle + actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void runPreview()} disabled={busy || !hasAnyInput}>
          {previewTotal === "loading" ? "Previewing…" : "Preview TAM"}
        </Button>
        <Button size="sm" onClick={() => void runSource()} disabled={busy || !hasAnyInput}>
          {busy && previewTotal !== "loading" ? "Sourcing…" : "Source"}
        </Button>
        <Chip on={hydrateAccounts} onClick={() => setHydrateAccounts((v) => !v)} disabled={busy}>
          {hydrateAccounts ? "Enriching company profiles" : "Enrich company profiles"}
        </Chip>
        {typeof previewTotal === "number" && (
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            ≈ {fmt(previewTotal)} {category === "people" ? "prospects" : "companies"}
            {previewTotal >= 2500 ? " (LinkedIn caps a single search at 2,500)" : ""}
          </span>
        )}
      </div>
      {hydrateAccounts && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          Enrichment fetches each employer&apos;s LinkedIn company profile (domain, industries, HQ, size) — uses ~1 profile view per company against your daily quota.
        </p>
      )}

      {/* Result + resolution report + dropped warnings */}
      {sourceResult && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
          Added {sourceResult.accounts} account{sourceResult.accounts === 1 ? "" : "s"} + {sourceResult.contacts} contact
          {sourceResult.contacts === 1 ? "" : "s"}.{" "}
          <a href="/accounts" style={{ color: "var(--color-accent)" }}>View in Accounts</a>
        </p>
      )}
      {resolution && resolution.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {resolution.map((r, i) => (
            <p key={i} className="text-[11px]" style={{ color: r.id ? "var(--color-text-tertiary)" : "var(--color-text-muted)" }}>
              {r.type.toLowerCase().replace("_", " ")}: &ldquo;{r.label}&rdquo; {r.id ? `→ ${r.matched}` : "→ no LinkedIn match (dropped)"}
            </p>
          ))}
        </div>
      )}
      {dropped && dropped.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {dropped.map((d, i) => (
            <p key={i} className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}
