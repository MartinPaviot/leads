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

// Warm/interaction spotlights (people) → the boolean payload keys they set.
const WARM_SIGNALS: Array<{ key: string; label: string }> = [
  { key: "followingYourCompany", label: "Follows you" },
  { key: "viewedYourProfileRecently", label: "Viewed your profile" },
  { key: "messagedRecently", label: "Messaged you" },
  { key: "pastColleague", label: "Past colleague" },
  { key: "sharedExperiences", label: "Shared experience" },
];

// Time-in-current-role buckets (people) → SN tenure_at_role ranges.
const ROLE_TENURE: Array<{ key: string; label: string; range: { min?: number; max?: number } }> = [
  { key: "<1", label: "<1 yr", range: { min: 0, max: 1 } },
  { key: "1-2", label: "1–2 yr", range: { min: 1, max: 2 } },
  { key: "3-5", label: "3–5 yr", range: { min: 3, max: 5 } },
  { key: "6-10", label: "6–10 yr", range: { min: 6, max: 10 } },
  { key: "10+", label: "10 yr+", range: { min: 10 } },
];

// Annual-revenue buckets (companies, USD millions) → SN annual_revenue {min,max}.
const REVENUE: Array<{ key: string; label: string; range: { min: number; max: number } }> = [
  { key: "<1M", label: "<1M", range: { min: 0, max: 1 } },
  { key: "1-10M", label: "1–10M", range: { min: 1, max: 10 } },
  { key: "10-50M", label: "10–50M", range: { min: 10, max: 50 } },
  { key: "50-100M", label: "50–100M", range: { min: 50, max: 100 } },
  { key: "100M-1B", label: "100M–1B", range: { min: 100, max: 1000 } },
  { key: "1B+", label: "1B+", range: { min: 1000, max: 1001 } },
];

// Jobs search vocab.
const JOB_SENIORITY: Array<{ value: string; label: string }> = [
  { value: "executive", label: "Executive" },
  { value: "director", label: "Director" },
  { value: "mid_senior", label: "Mid-Senior" },
  { value: "associate", label: "Associate" },
  { value: "entry", label: "Entry" },
  { value: "intern", label: "Intern" },
];
const JOB_TYPE: Array<{ value: string; label: string }> = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
];
const JOB_PRESENCE: Array<{ value: string; label: string }> = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];
const JOB_DATE: Array<{ key: string; label: string; days: number }> = [
  { key: "1", label: "24 h", days: 1 },
  { key: "7", label: "Past week", days: 7 },
  { key: "30", label: "Past month", days: 30 },
];
// Posts search vocab.
const POST_RECENCY: Array<{ value: string; label: string }> = [
  { value: "past_day", label: "24 h" },
  { value: "past_week", label: "Past week" },
  { value: "past_month", label: "Past month" },
];
const POST_CONTENT: Array<{ value: string; label: string }> = [
  { value: "videos", label: "Videos" },
  { value: "images", label: "Images" },
  { value: "documents", label: "Documents" },
  { value: "collaborative_articles", label: "Articles" },
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
  const [category, setCategory] = useState<"people" | "companies" | "jobs" | "posts">("people");
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
  const [warmSignals, setWarmSignals] = useState<Set<string>>(new Set());
  const [roleTenure, setRoleTenure] = useState<Set<string>>(new Set());
  const [revenueKey, setRevenueKey] = useState("");
  const [fastGrowing, setFastGrowing] = useState(false);
  const [personaId, setPersonaId] = useState("");
  const [savedSearchId, setSavedSearchId] = useState("");
  const [leadListId, setLeadListId] = useState("");
  const [hydrateAccounts, setHydrateAccounts] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Jobs search
  const [jobSeniority, setJobSeniority] = useState<Set<string>>(new Set());
  const [jobType, setJobType] = useState<Set<string>>(new Set());
  const [jobPresence, setJobPresence] = useState<Set<string>>(new Set());
  const [jobDate, setJobDate] = useState("");
  const [jobEasyApply, setJobEasyApply] = useState(false);
  const [jobInNetwork, setJobInNetwork] = useState(false);
  // Posts search
  const [postRecency, setPostRecency] = useState("");
  const [postContentType, setPostContentType] = useState("");
  const [includeEngagers, setIncludeEngagers] = useState(false);

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
    if (category === "jobs") {
      if (q) payload.keywords = q;
      if (industries.trim()) payload.industries = toList(industries);
      if (locations.trim()) payload.locations = toList(locations);
      if (titles.trim()) payload.roles = toList(titles);
      if (functions.trim()) payload.functions = toList(functions);
      if (companies.trim()) payload.companies = toList(companies);
      if (jobSeniority.size) payload.seniorities = [...jobSeniority];
      if (jobType.size) payload.jobTypes = [...jobType];
      if (jobPresence.size) payload.presence = [...jobPresence];
      const d = JOB_DATE.find((x) => x.key === jobDate);
      if (d) payload.datePostedDays = d.days;
      if (jobEasyApply) payload.easyApply = true;
      if (jobInNetwork) payload.inYourNetwork = true;
      return payload;
    }
    if (category === "posts") {
      if (q) payload.keywords = q;
      if (postRecency) payload.datePosted = postRecency;
      if (postContentType) payload.contentType = postContentType;
      if (includeEngagers) payload.includeEngagers = true;
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
      for (const w of warmSignals) payload[w] = true; // following_your_company, etc.
      const roleTenureRanges = ROLE_TENURE.filter((t) => roleTenure.has(t.key)).map((t) => t.range);
      if (roleTenureRanges.length) payload.tenureAtRole = roleTenureRanges;
      if (personaId) payload.personaIds = [personaId];
      if (leadListId) payload.leadListIds = [leadListId];
    } else {
      if (hasJobOffers) payload.hasJobOffers = true;
      if (recentActivities.size) payload.recentActivities = [...recentActivities];
      const rev = REVENUE.find((x) => x.key === revenueKey);
      if (rev) payload.annualRevenue = { currency: "USD", ...rev.range };
      if (fastGrowing) payload.headcountGrowth = { min: 20 };
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
    warmSignals,
    roleTenure,
    personaId,
    hasJobOffers,
    recentActivities,
    revenueKey,
    fastGrowing,
    leadListId,
    jobSeniority,
    jobType,
    jobPresence,
    jobDate,
    jobEasyApply,
    jobInNetwork,
    postRecency,
    postContentType,
    includeEngagers,
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
        signalsRecorded?: number;
        authorsUpserted?: number;
        engagersSourced?: number;
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
      const contacts = (body.contactsUpserted ?? 0) + (body.authorsUpserted ?? 0) + (body.engagersSourced ?? 0);
      setSourceResult({ accounts, contacts });
      const msg =
        category === "jobs"
          ? `Sourced ${accounts} hiring compan${accounts === 1 ? "y" : "ies"} (${body.signalsRecorded ?? 0} open role${(body.signalsRecorded ?? 0) === 1 ? "" : "s"}).`
          : category === "posts"
            ? `Sourced ${contacts} warm lead${contacts === 1 ? "" : "s"} from posts.`
            : `Sourced ${accounts} account${accounts === 1 ? "" : "s"} and ${contacts} contact${contacts === 1 ? "" : "s"} from LinkedIn.`;
      toast(msg, "success");
    } catch {
      toast("LinkedIn sourcing failed", "error");
    } finally {
      setBusy(false);
    }
  }, [hasAnyInput, post, toast, category]);

  const fmt = (n: number) => new Intl.NumberFormat().format(n);
  const isPC = category === "people" || category === "companies";
  const savedSearches = collections?.savedSearches ?? [];
  const leadLists = collections?.leadLists ?? [];
  const personas = collections?.personas ?? [];

  return (
    <div className="rounded-md p-3" style={{ border: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Source your TAM from Sales Navigator
        </label>
        <div className="flex flex-wrap gap-1">
          {(["people", "companies", "jobs", "posts"] as const).map((c) => (
            <Chip key={c} on={category === c} onClick={() => setCategory(c)} disabled={busy}>
              {c === "people" ? "People" : c === "companies" ? "Companies" : c === "jobs" ? "Jobs (hiring)" : "Posts"}
            </Chip>
          ))}
        </div>
      </div>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        {category === "jobs"
          ? "Find companies HIRING for a role — a job opening is a GTM-scaling signal. Each hiring company lands in Accounts with the open role."
          : category === "posts"
            ? "Find people POSTING about a topic — warm, intent-rich leads. Authors (and optionally everyone who engaged) land in Contacts."
            : "Paste a Sales Navigator search URL, type keywords, or target by ICP below. Results land in Accounts & Contacts, deduped against your CRM and matched to your network for warm intros."}
      </p>

      {/* URL / keywords */}
      <div className="mt-2 flex gap-2">
        <Input
          value={sourceQuery}
          onChange={(e) => setSourceQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSource();
          }}
          placeholder={
            category === "jobs"
              ? "Job keywords (e.g. revenue operations)"
              : category === "posts"
                ? "Topic keywords (e.g. cold outbound) — required"
                : "Paste a Sales Navigator search URL, or type keywords"
          }
          disabled={busy}
        />
      </div>

      {/* Core free-text — shown for everything except posts (keyword-only) */}
      {category !== "posts" && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Industries (e.g. software, fintech)" disabled={busy} />
          <Input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Locations (e.g. France, United States)" disabled={busy} />
          {(category === "people" || category === "jobs") && (
            <Input value={titles} onChange={(e) => setTitles(e.target.value)} placeholder={category === "jobs" ? "Roles hiring for (e.g. Head of Sales)" : "Titles (e.g. Head of Sales, CRO)"} disabled={busy} />
          )}
          {(category === "people" || category === "jobs") && (
            <Input value={companies} onChange={(e) => setCompanies(e.target.value)} placeholder="Companies (e.g. Stripe, Datadog)" disabled={busy} />
          )}
        </div>
      )}

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
      {isPC && (
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
      )}

      {/* Jobs filters */}
      {category === "jobs" && (
        <>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Experience level</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {JOB_SENIORITY.map((s) => (
                <Chip key={s.value} on={jobSeniority.has(s.value)} onClick={() => toggle(setJobSeniority, s.value)} disabled={busy}>{s.label}</Chip>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Job type</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {JOB_TYPE.map((t) => (
                <Chip key={t.value} on={jobType.has(t.value)} onClick={() => toggle(setJobType, t.value)} disabled={busy}>{t.label}</Chip>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Workplace &amp; recency</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {JOB_PRESENCE.map((p) => (
                <Chip key={p.value} on={jobPresence.has(p.value)} onClick={() => toggle(setJobPresence, p.value)} disabled={busy}>{p.label}</Chip>
              ))}
              {JOB_DATE.map((d) => (
                <Chip key={d.key} on={jobDate === d.key} onClick={() => setJobDate((k) => (k === d.key ? "" : d.key))} disabled={busy}>{d.label}</Chip>
              ))}
              <Chip on={jobEasyApply} onClick={() => setJobEasyApply((v) => !v)} disabled={busy}>Easy apply</Chip>
              <Chip on={jobInNetwork} onClick={() => setJobInNetwork((v) => !v)} disabled={busy}>In my network</Chip>
            </div>
          </div>
        </>
      )}

      {/* Posts filters */}
      {category === "posts" && (
        <>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Posted</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {POST_RECENCY.map((p) => (
                <Chip key={p.value} on={postRecency === p.value} onClick={() => setPostRecency((k) => (k === p.value ? "" : p.value))} disabled={busy}>{p.label}</Chip>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Content type</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {POST_CONTENT.map((c) => (
                <Chip key={c.value} on={postContentType === c.value} onClick={() => setPostContentType((k) => (k === c.value ? "" : c.value))} disabled={busy}>{c.label}</Chip>
              ))}
              <Chip on={includeEngagers} onClick={() => setIncludeEngagers((v) => !v)} disabled={busy}>+ Source engagers too</Chip>
            </div>
          </div>
        </>
      )}

      {/* Spotlights / signals */}
      {category === "people" ? (
        <>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Buying signals</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Chip on={changedJobs} onClick={() => setChangedJobs((v) => !v)} disabled={busy}>Changed jobs</Chip>
              <Chip on={postedOnLinkedin} onClick={() => setPostedOnLinkedin((v) => !v)} disabled={busy}>Posted recently</Chip>
              <Chip on={mentionedInNews} onClick={() => setMentionedInNews((v) => !v)} disabled={busy}>In the news</Chip>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Warm signals (already engaging you)</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {WARM_SIGNALS.map((w) => (
                <Chip key={w.key} on={warmSignals.has(w.key)} onClick={() => toggle(setWarmSignals, w.key)} disabled={busy}>
                  {w.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Time in current role</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {ROLE_TENURE.map((t) => (
                <Chip key={t.key} on={roleTenure.has(t.key)} onClick={() => toggle(setRoleTenure, t.key)} disabled={busy}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>
        </>
      ) : category === "companies" ? (
        <>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Buying signals</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Chip on={hasJobOffers} onClick={() => setHasJobOffers((v) => !v)} disabled={busy}>Hiring on LinkedIn</Chip>
              <Chip on={fastGrowing} onClick={() => setFastGrowing((v) => !v)} disabled={busy}>Fast-growing (+20% headcount)</Chip>
              {RECENT_ACTIVITIES.map((a) => (
                <Chip key={a.value} on={recentActivities.has(a.value)} onClick={() => toggle(setRecentActivities, a.value)} disabled={busy}>
                  {a.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Annual revenue</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {REVENUE.map((rv) => (
                <Chip key={rv.key} on={revenueKey === rv.key} onClick={() => setRevenueKey((k) => (k === rv.key ? "" : rv.key))} disabled={busy}>
                  {rv.label}
                </Chip>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* Saved lists / searches / personas — reuse what the founder already built in SN */}
      {isPC && (savedSearches.length > 0 || (category === "people" && (leadLists.length > 0 || personas.length > 0))) && (
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
          {category === "people" && personas.length > 0 && (
            <label className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              Match a saved persona
              <select
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
                disabled={busy}
                className="mt-0.5 w-full rounded-md px-2 py-1 text-[12px]"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)" }}
              >
                <option value="">— none —</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.title.length > 60 ? `${p.title.slice(0, 60)}…` : p.title}</option>
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
        {category !== "posts" && (
          <Chip on={hydrateAccounts} onClick={() => setHydrateAccounts((v) => !v)} disabled={busy}>
            {hydrateAccounts ? "Enriching company profiles" : "Enrich company profiles"}
          </Chip>
        )}
        {typeof previewTotal === "number" && (
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            ≈ {fmt(previewTotal)}{" "}
            {category === "people" ? "prospects" : category === "companies" ? "companies" : category === "jobs" ? "open jobs" : "posts"}
            {previewTotal >= 2500 ? " (LinkedIn caps a single search at 2,500)" : ""}
          </span>
        )}
      </div>
      {hydrateAccounts && category !== "posts" && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          Enrichment fetches each {category === "jobs" ? "hiring" : "employer"} company&apos;s LinkedIn profile (domain, industries, HQ, size) — uses ~1 profile view per company against your daily quota.
        </p>
      )}

      {/* Result + resolution report + dropped warnings */}
      {sourceResult && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
          {category === "posts" ? (
            <>
              Added {sourceResult.contacts} contact{sourceResult.contacts === 1 ? "" : "s"}.{" "}
              <a href="/contacts" style={{ color: "var(--color-accent)" }}>View in Contacts</a>
            </>
          ) : category === "jobs" ? (
            <>
              Added {sourceResult.accounts} hiring compan{sourceResult.accounts === 1 ? "y" : "ies"}.{" "}
              <a href="/accounts" style={{ color: "var(--color-accent)" }}>View in Accounts</a>
            </>
          ) : (
            <>
              Added {sourceResult.accounts} account{sourceResult.accounts === 1 ? "" : "s"} + {sourceResult.contacts} contact
              {sourceResult.contacts === 1 ? "" : "s"}.{" "}
              <a href="/accounts" style={{ color: "var(--color-accent)" }}>View in Accounts</a>
            </>
          )}
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
