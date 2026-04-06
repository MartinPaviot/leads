"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, ArrowLeft, Loader2, Check, Mail, Sparkles, Target, Zap, MessageSquare, Users, Building2, Globe, ChevronDown, Calendar, Shield, Eye, EyeOff, Clock } from "lucide-react";
import { INDUSTRIES, COMPANY_SIZES, SALES_MOTIONS, GEOGRAPHIES, JOB_SENIORITIES, JOB_DEPARTMENTS, sizesToApolloRanges } from "@/lib/icp-constants";

interface WebsiteAnalysis {
  companyDescription: string;
  productDescription: string;
  targetIndustries: string[];
  targetCompanySizes: string[];
  targetRoles: string;
  targetGeographies: string[];
  suggestedTone: string;
  confidence: number;
  reasoning: string;
}

interface OnboardingWizardProps {
  onComplete: () => void;
  hasGoogle: boolean;
  hasMicrosoft?: boolean;
  userEmail?: string;
  userName?: string;
}

type Step = "connect" | "privacy" | "welcome" | "product" | "icp" | "building" | "ready";

const STEPS: { key: Step; label: string }[] = [
  { key: "welcome", label: "Your profile" },
  { key: "connect", label: "Connect" },
  { key: "privacy", label: "Sync settings" },
  { key: "product", label: "Your product" },
  { key: "icp", label: "Your customer" },
  { key: "building", label: "Building" },
  { key: "ready", label: "Ready" },
];

const CHALLENGES = ["Finding leads", "Getting responses", "Closing deals", "Expanding accounts"];

const DEFAULT_IGNORED_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com",
  "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "icloud.com",
  "aol.com", "protonmail.com", "proton.me", "me.com", "mail.com",
];

/* ── Shared sub-components ── */

const pill = "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-150";

function PillSelect({ options, selected, onToggle, multi = true }: {
  options: readonly string[];
  selected: string[];
  onToggle: (val: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)} className={pill}
            style={{
              background: active ? "var(--color-accent)" : "var(--color-bg-page)",
              color: active ? "white" : "var(--color-text-secondary)",
              border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
            }}
          >{opt}</button>
        );
      })}
    </div>
  );
}

function TagInput({ options, selected, onToggle, placeholder }: {
  options: readonly string[];
  selected: string[];
  onToggle: (val: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const filtered = search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()) && !selected.includes(o))
    : options.filter((o) => !selected.includes(o));

  const DROPDOWN_HEIGHT = 208; // max-h-52 = 13rem = 208px

  const openDropdown = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow >= DROPDOWN_HEIGHT || spaceBelow >= spaceAbove) {
        // Open below
        setDropdownStyle({
          position: "fixed" as const,
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(DROPDOWN_HEIGHT, spaceBelow - 8),
        });
      } else {
        // Open above
        setDropdownStyle({
          position: "fixed" as const,
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left,
          width: rect.width,
          maxHeight: Math.min(DROPDOWN_HEIGHT, spaceAbove - 8),
        });
      }
    }
    setOpen(true);
  };

  return (
    <div className="relative">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selected.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--color-accent)", color: "white" }}>
              {tag}
              <button type="button" onClick={() => onToggle(tag)} className="ml-0.5 hover:opacity-70" style={{ lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input ref={inputRef} type="text" value={search}
        onChange={(e) => { setSearch(e.target.value); openDropdown(); }}
        onFocus={openDropdown}
        placeholder={selected.length > 0 ? "Add more..." : placeholder || "Search..."}
        className="auth-input w-full rounded-lg px-3 py-1 text-[12px] outline-none"
        style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
      />
      {open && filtered.length > 0 && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="z-[9999] overflow-y-auto rounded-lg py-1"
            style={{ ...dropdownStyle, background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog)" }}>
            {filtered.map((opt) => (
              <button key={opt} type="button" onClick={() => { onToggle(opt); setSearch(""); }}
                className="w-full text-left px-3 py-1.5 text-[12px] transition-colors"
                style={{ color: "var(--color-text-primary)" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >{opt}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FreeTagInput({ tags, setTags, placeholder }: { tags: string[]; setTags: (t: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--color-accent)", color: "white" }}>
              {tag}
              <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} className="ml-0.5 hover:opacity-70" style={{ lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = input.trim(); if (v && !tags.includes(v)) setTags([...tags, v]); setInput(""); } }}
        placeholder={tags.length > 0 ? "Add more..." : placeholder || "Type and press Enter..."}
        className="auth-input w-full rounded-lg px-3 py-1 text-[12px] outline-none"
        style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
      />
    </div>
  );
}

/* ── Shared layout pieces ── */

function StepHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="shrink-0 mb-3">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span style={{ color: "var(--color-accent)" }}>{icon}</span>
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
      </div>
      <p className="text-[12px] leading-snug" style={{ color: "var(--color-text-tertiary)" }}>{subtitle}</p>
    </div>
  );
}

function StepFooter({ onBack, onNext, nextLabel, disabled, loading }: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 shrink-0 pt-3 mt-auto">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
          <ArrowLeft size={13} /> Back
        </button>
      )}
      <button onClick={onNext} disabled={disabled || loading}
        className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold text-white transition-all duration-150 gradient-brand"
        style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : (nextLabel || <>Continue <ArrowRight size={14} /></>)}
      </button>
    </div>
  );
}

const inputCls = "auth-input w-full rounded-lg px-3 py-1 text-[12px] outline-none";
const inputStyle = { background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" };
const label = "block text-[11px] font-medium mb-0.5";
const labelStyle = { color: "var(--color-text-secondary)" };

/* ── Progress bar ── */

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
          {current}/{total} · {STEPS[current - 1]?.label}
        </span>
      </div>
      <div className="h-0.5 w-full rounded-full overflow-hidden" style={{ background: "var(--color-border-default)" }}>
        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${(current / total) * 100}%`, background: "var(--color-accent)" }} />
      </div>
    </div>
  );
}

/* ── Constants ── */

const BACKSYNC_OPTIONS = [
  { value: "1m", label: "1 mo", desc: "Quick" },
  { value: "3m", label: "3 mo", desc: "Recommended" },
  { value: "6m", label: "6 mo", desc: "Deep" },
  { value: "12m", label: "1 yr", desc: "Full" },
] as const;

const CREATION_OPTIONS = [
  { value: "selective", label: "Selective", desc: "Emails you send & meetings you organize", icon: <Eye size={13} /> },
  { value: "always", label: "Always", desc: "All incoming and outgoing emails", icon: <Users size={13} /> },
  { value: "disabled", label: "Disabled", desc: "No automatic record creation", icon: <EyeOff size={13} /> },
] as const;

/* ═══════════════════════════ MAIN COMPONENT ═══════════════════════════ */

export function OnboardingWizard({ onComplete, hasGoogle, hasMicrosoft, userEmail, userName }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);

  const [websiteAnalysis, setWebsiteAnalysis] = useState<WebsiteAnalysis | null>(null);
  const [analyzingWebsite, setAnalyzingWebsite] = useState(false);
  const [domain, setDomain] = useState(() => {
    if (!userEmail) return "";
    const d = userEmail.split("@")[1] || "";
    if (/gmail|yahoo|hotmail|outlook|icloud|aol|proton/i.test(d)) return "";
    return d;
  });

  const [connecting, setConnecting] = useState(false);
  const [emailConnected, setEmailConnected] = useState(hasGoogle || !!hasMicrosoft);

  const [contactCreation, setContactCreation] = useState<"disabled" | "selective" | "always">("selective");
  const [backsyncRange, setBacksyncRange] = useState<"1m" | "3m" | "6m" | "12m">("3m");
  const [doNotTrackDomains, setDoNotTrackDomains] = useState<string[]>([...DEFAULT_IGNORED_DOMAINS]);
  const [doNotTrackInput, setDoNotTrackInput] = useState("");

  const [fullName, setFullName] = useState(userName || "");
  const [companyName, setCompanyName] = useState(() => {
    if (!domain) return "";
    const name = domain.split(".")[0] || "";
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
  const [role, setRole] = useState("Founder");

  const [productDesc, setProductDesc] = useState("");
  const [salesMotion, setSalesMotion] = useState("Founder-led sales");
  const [aiTone, setAiTone] = useState("Direct");
  const [challenge, setChallenge] = useState("");

  const [industries, setIndustries] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [targetSeniorities, setTargetSeniorities] = useState<string[]>([]);
  const [targetDepartments, setTargetDepartments] = useState<string[]>([]);
  const [geographies, setGeographies] = useState<string[]>([]);

  const [tamProgress, setTamProgress] = useState<{ found: number; done: boolean }>({ found: 0, done: false });
  const [emailIntelligence, setEmailIntelligence] = useState<{ contacts: number; conversations: number; icpMatches: number; followUps: number } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ contacts: number; emails: number } | null>(null);
  const [buildStage, setBuildStage] = useState(0);
  const [topCompanies, setTopCompanies] = useState<{ name: string; domain: string; industry?: string }[]>([]);

  const stepIndex = STEPS.findIndex((s) => s.key === step) + 1;
  const togglePill = useCallback((list: string[], val: string, setter: (v: string[]) => void) => {
    setter(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  }, []);

  const saveOnboardingData = async (data: Record<string, unknown>) => {
    await fetch("/api/onboarding/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  };

  /* ── Handlers ── */

  const handleConnectGoogle = () => { saveOnboardingData({ emailProvider: "google", step: "connect" }); signIn("google", { callbackUrl: "/home" }); };
  const handleConnectMicrosoft = () => { saveOnboardingData({ emailProvider: "microsoft", step: "connect" }); signIn("microsoft-entra-id", { callbackUrl: "/home" }); };
  const handleConnectContinue = () => { setStep(emailConnected ? "privacy" : "product"); };
  const handleConnectSkip = () => { setStep("product"); };

  const handlePrivacyContinue = async () => {
    setSaving(true);
    await saveOnboardingData({ step: "privacy", contactCreationMode: contactCreation, backsyncRange, doNotTrackDomains: doNotTrackDomains.filter((d) => d.trim()) });
    setSaving(false);
    setStep("product");
  };

  const handleWelcomeContinue = async () => {
    setSaving(true);
    await saveOnboardingData({ fullName, companyName, role, domain, step: "welcome" });
    setSaving(false);
    setStep("connect");
    if (domain) {
      setAnalyzingWebsite(true);
      fetch("/api/onboarding/analyze-website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data && !data.error) { setWebsiteAnalysis(data); if (data.productDescription && !productDesc && !/unknown|n\/a|<|>/i.test(data.productDescription)) setProductDesc(data.productDescription); } })
        .catch(() => {}).finally(() => setAnalyzingWebsite(false));
    }
  };

  const applyWebsiteAnalysis = () => {
    if (!websiteAnalysis) return;
    if (industries.length === 0 && websiteAnalysis.targetIndustries.length > 0) setIndustries(websiteAnalysis.targetIndustries.filter((i) => (INDUSTRIES as readonly string[]).includes(i)));
    if (companySizes.length === 0 && websiteAnalysis.targetCompanySizes.length > 0) setCompanySizes(websiteAnalysis.targetCompanySizes.filter((s) => (COMPANY_SIZES as readonly string[]).includes(s)));
    if (targetSeniorities.length === 0 && websiteAnalysis.targetRoles) {
      const parsed = websiteAnalysis.targetRoles.split(/,\s*/).map((r) => r.trim()).filter(Boolean);
      // Fuzzy match: check if any parsed role contains a seniority/department keyword
      const matchedSeniorities = JOB_SENIORITIES.filter((s) =>
        parsed.some((r) => r.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(r.toLowerCase()))
      );
      const matchedDepartments = JOB_DEPARTMENTS.filter((d) =>
        parsed.some((r) => r.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(r.toLowerCase()))
      );
      if (matchedSeniorities.length > 0) setTargetSeniorities([...matchedSeniorities]);
      else setTargetSeniorities(["C-Suite", "VP", "Director"]); // sensible defaults
      if (matchedDepartments.length > 0) setTargetDepartments([...matchedDepartments]);
    }
    if (geographies.length === 0 && websiteAnalysis.targetGeographies.length > 0) {
      const valid = websiteAnalysis.targetGeographies.filter((g) => (GEOGRAPHIES as readonly string[]).includes(g));
      setGeographies(valid.length > 0 ? valid : websiteAnalysis.targetGeographies);
    }
    if (websiteAnalysis.suggestedTone && aiTone === "Direct") setAiTone(websiteAnalysis.suggestedTone);
  };

  const handleProductContinue = async () => {
    setSaving(true);
    await saveOnboardingData({ productDesc, salesMotion, challenge, step: "product" });
    setSaving(false);
    applyWebsiteAnalysis();
    setStep("icp");
    if (!websiteAnalysis && !analyzingWebsite && domain) {
      setAnalyzingWebsite(true);
      fetch("/api/onboarding/analyze-website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, productDescription: productDesc }) })
        .then((res) => res.ok ? res.json() : null).then((data) => { if (data && !data.error) setWebsiteAnalysis(data); })
        .catch(() => {}).finally(() => setAnalyzingWebsite(false));
    }
  };

  const handleBuildTAM = async () => {
    setStep("building");
    setBuildError(null);
    setBuildStage(0);
    setTopCompanies([]);
    const apolloSizeRanges = sizesToApolloRanges(companySizes);

    // Animate stages independently of API
    const stageTimers = [
      setTimeout(() => setBuildStage(1), 1500),
      setTimeout(() => setBuildStage(2), 4000),
      setTimeout(() => setBuildStage(3), 7000),
    ];

    try {
      const derivedRoles = [...targetSeniorities, ...targetDepartments].join(", ");
      await saveOnboardingData({ industries, companySizes, targetSeniorities, targetDepartments, geographies, aiTone, step: "icp" });

      // Build TAM
      const tamRes = await fetch("/api/tam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ industries, companySizes: apolloSizeRanges, targetRoles: derivedRoles, geographies, productDescription: productDesc }) });
      if (!tamRes.ok) { const data = await tamRes.json(); throw new Error(data.error || "TAM build failed"); }
      const tamData = await tamRes.json();
      setTamProgress({ found: tamData.companiesCreated || 0, done: true });
      setBuildStage(4);

      // Fetch all companies for scoring + enrichment, and top 5 for preview
      const accountsRes = await fetch("/api/accounts?pageSize=200");
      if (accountsRes.ok) {
        const ad = await accountsRes.json();
        const accounts = ad.accounts || ad || [];
        setTopCompanies(accounts.slice(0, 5).map((a: { name: string; domain?: string; industry?: string }) => ({
          name: a.name, domain: a.domain || "", industry: a.industry,
        })));
        // Score ALL companies in background
        const ids = accounts.map((a: { id: string }) => a.id);
        if (ids.length > 0) {
          fetch("/api/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: ids }) }).catch(() => {});
          // Trigger batch enrichment via Inngest
          fetch("/api/enrich-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyIds: ids }) }).catch(() => {});
        }
      }

      fetch("/api/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "companies" }) }).catch(() => {});
      // Email intelligence — fire and forget, don't block onboarding
      if (emailConnected) {
        fetch("/api/onboarding/email-intelligence")
          .then((er) => er.ok ? er.json() : null)
          .then((data) => { if (data) setEmailIntelligence(data); })
          .catch(() => {});
      }
      await saveOnboardingData({ step: "complete", onboardingCompleted: true });

      setBuildStage(5);
      await new Promise((r) => setTimeout(r, 1200));
      setStep("ready");
    } catch (err) {
      stageTimers.forEach(clearTimeout);
      setBuildError(err instanceof Error ? err.message : "Failed to build TAM");
      setStep("icp");
    }
  };

  useEffect(() => { if ((hasGoogle || hasMicrosoft) && !emailConnected) setEmailConnected(true); }, [hasGoogle, hasMicrosoft, emailConnected]);

  const isValidDomain = (d: string) => /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(d);
  const domainValid = domain.trim() !== "" && isValidDomain(domain.trim());
  const canContinueWelcome = fullName.trim() && companyName.trim() && domainValid;
  const canContinueProduct = productDesc.trim().length >= 10 && challenge;
  const canContinueICP = industries.length > 0 && companySizes.length > 0 && targetSeniorities.length > 0;

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", background: "var(--color-bg-page)" }}>

      {/* ── Header ── */}
      <div className="w-full max-w-lg px-4 shrink-0 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <h1 className="gradient-text text-lg font-bold tracking-tight">Elevay</h1>
          {step !== "ready" && step !== "building" && (
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>~{Math.max(1, 5 - stepIndex + 1)} min left</span>
          )}
        </div>
        {step !== "ready" && <ProgressBar current={stepIndex} total={7} />}
      </div>

      {/* ── Card — flex-1 fills all remaining space ── */}
      <div className="w-full max-w-lg mx-4 flex-1 min-h-0 flex flex-col overflow-hidden"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", borderRadius: "12px", boxShadow: "var(--shadow-dialog)", padding: "16px 20px", marginBottom: "16px" }}>

        {/* ════ STEP 2 : CONNECT ════ */}
        {step === "connect" && (
          <div className="flex flex-col h-full">
            <StepHeader icon={<Mail size={15} />} title="Connect your email & calendar" subtitle="We sync your conversations and meetings to build your customer memory." />

            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                {[
                  { icon: <Mail size={12} />, t: "Email conversations", d: "Auto-create contacts from your inbox" },
                  { icon: <Calendar size={12} />, t: "Calendar & meetings", d: "Prep, summaries, and follow-ups" },
                  { icon: <MessageSquare size={12} />, t: "Customer memory", d: "Every interaction searchable" },
                  { icon: <Zap size={12} />, t: "Smart outbound", d: "AI references your actual history" },
                ].map((item) => (
                  <div key={item.t} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5" style={{ color: "var(--color-accent)" }}>{item.icon}</span>
                    <div>
                      <span className="text-[11px] font-medium block" style={{ color: "var(--color-text-primary)" }}>{item.t}</span>
                      <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{item.d}</span>
                    </div>
                  </div>
                ))}
              </div>

              {emailConnected ? (
                <div className="rounded-lg p-2" style={{ background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)" }}>
                  <div className="flex items-center gap-2"><Check size={13} style={{ color: "#22c55e" }} /><span className="text-[12px] font-medium" style={{ color: "#22c55e" }}>Email & calendar connected</span></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleConnectGoogle} className="auth-button flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all" style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Google
                  </button>
                  <button onClick={handleConnectMicrosoft} className="auth-button flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all" style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}>
                    <svg className="h-4 w-4" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                    Microsoft
                  </button>
                </div>
              )}
            </div>

            <StepFooter onBack={() => setStep("welcome")} onNext={handleConnectContinue} nextLabel={emailConnected ? <>Continue <ArrowRight size={13} /></> : <>Skip for now <ArrowRight size={13} /></>} />
          </div>
        )}

        {/* ════ STEP 3 : PRIVACY ════ */}
        {step === "privacy" && (
          <div className="flex flex-col h-full">
            <StepHeader icon={<Shield size={15} />} title="Control what gets synced" subtitle="You can change these anytime in Settings." />

            <div className="flex-1 space-y-3">
              {/* Record creation — compact rows */}
              <div>
                <span className={label} style={labelStyle}>Record creation</span>
                <div className="space-y-1">
                  {CREATION_OPTIONS.map((opt) => {
                    const active = contactCreation === opt.value;
                    return (
                      <button key={opt.value} type="button" onClick={() => setContactCreation(opt.value)}
                        className="flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-left transition-all"
                        style={{ background: active ? "rgba(44,107,237,.06)" : "var(--color-bg-page)", border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}` }}>
                        <span className="shrink-0" style={{ color: active ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>{opt.icon}</span>
                        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-primary)" }}>{opt.label}</span>
                        <span className="text-[11px] truncate" style={{ color: "var(--color-text-tertiary)" }}>{opt.desc}</span>
                        {active && <Check size={11} className="ml-auto shrink-0" style={{ color: "var(--color-accent)" }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Backsync */}
              <div>
                <span className={`flex items-center gap-1 ${label}`} style={labelStyle}><Clock size={11} /> How far back</span>
                <div className="flex gap-1.5">
                  {BACKSYNC_OPTIONS.map((opt) => {
                    const active = backsyncRange === opt.value;
                    return (
                      <button key={opt.value} type="button" onClick={() => setBacksyncRange(opt.value)}
                        className="flex-1 rounded-lg py-1 text-center transition-all"
                        style={{ background: active ? "rgba(44,107,237,.06)" : "var(--color-bg-page)", border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}` }}>
                        <span className="text-[11px] font-medium block" style={{ color: active ? "var(--color-accent)" : "var(--color-text-primary)" }}>{opt.label}</span>
                        <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Do not track */}
              <div>
                <span className={label} style={labelStyle}>Do not track</span>
                <p className="text-[10px] mb-1" style={{ color: "var(--color-text-tertiary)" }}>{DEFAULT_IGNORED_DOMAINS.length} personal providers excluded (gmail, outlook, yahoo...).</p>
                {doNotTrackDomains.filter((d) => !DEFAULT_IGNORED_DOMAINS.includes(d)).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {doNotTrackDomains.filter((d) => !DEFAULT_IGNORED_DOMAINS.includes(d)).map((d) => (
                      <span key={d} className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px]" style={{ background: "var(--color-accent)", color: "white" }}>
                        {d}<button type="button" onClick={() => setDoNotTrackDomains(doNotTrackDomains.filter((x) => x !== d))} className="ml-0.5 hover:opacity-70" style={{ lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input type="text" value={doNotTrackInput} onChange={(e) => setDoNotTrackInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = doNotTrackInput.trim().toLowerCase(); if (v && !doNotTrackDomains.includes(v)) setDoNotTrackDomains([...doNotTrackDomains, v]); setDoNotTrackInput(""); } }}
                  placeholder="Add domain (e.g., competitor.com)" className={inputCls} style={inputStyle} />
              </div>
            </div>

            <StepFooter onBack={() => setStep("connect")} onNext={handlePrivacyContinue} loading={saving} />
          </div>
        )}

        {/* ════ STEP 1 : WELCOME / PROFILE ════ */}
        {step === "welcome" && (
          <div className="flex flex-col h-full">
            <StepHeader icon={<Sparkles size={15} />} title="Let's set up your GTM engine" subtitle="Tell us about you and your company." />

            <div className="flex-1 space-y-3">
              <div>
                <span className={label} style={labelStyle}>Your name</span>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Martin Paviot" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <span className={label} style={labelStyle}>Company name</span>
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Elevay" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <span className={label} style={labelStyle}>Company website</span>
                <div className="relative">
                  <input type="text" value={domain}
                    onChange={(e) => setDomain(e.target.value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""))}
                    placeholder="yourcompany.com" className={inputCls} style={{ ...inputStyle, paddingRight: domain ? "32px" : undefined }} />
                  {domain && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {domainValid
                        ? <Check size={13} style={{ color: "#22c55e" }} />
                        : <span className="text-[11px] font-medium" style={{ color: "#ef4444" }}>!</span>}
                    </span>
                  )}
                </div>
                {domain && !domainValid && (
                  <p className="mt-0.5 text-[10px]" style={{ color: "#ef4444" }}>Enter a valid domain (e.g., yourcompany.com)</p>
                )}
                {domainValid && (
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>We&apos;ll analyze your website to pre-fill your ICP</p>
                )}
              </div>
              <div>
                <span className={label} style={labelStyle}>Your role</span>
                <PillSelect options={["Founder", "Sales / Growth", "Marketing", "RevOps", "Other"]} selected={[role]} onToggle={(val) => setRole(val)} multi={false} />
              </div>
            </div>

            <StepFooter onNext={handleWelcomeContinue} disabled={!canContinueWelcome} loading={saving} />
          </div>
        )}

        {/* ════ STEP 4 : PRODUCT ════ */}
        {step === "product" && (
          <div className="flex flex-col h-full">
            <StepHeader icon={<Target size={15} />} title="Tell us about what you sell" subtitle={`Helps our AI write relevant emails and coach you.${analyzingWebsite ? " Analyzing your site..." : ""}`} />

            <div className="flex-1 space-y-3">
              <div>
                <span className={label} style={labelStyle}>What do you sell? *</span>
                <textarea value={productDesc} onChange={(e) => setProductDesc(e.target.value)} placeholder="e.g., API platform for fintech companies to embed payments" rows={2}
                  className="auth-input w-full rounded-lg px-3 py-1 text-[12px] outline-none resize-none" style={inputStyle} />
              </div>
              <div>
                <span className={label} style={labelStyle}>Sales motion</span>
                <PillSelect options={SALES_MOTIONS} selected={[salesMotion]} onToggle={(val) => setSalesMotion(val)} multi={false} />
              </div>
              <div>
                <span className={label} style={labelStyle}>Biggest challenge *</span>
                <PillSelect options={CHALLENGES} selected={challenge ? [challenge] : []} onToggle={(val) => setChallenge(val)} multi={false} />
              </div>
            </div>

            <StepFooter onBack={() => setStep(emailConnected ? "privacy" : "connect")} onNext={handleProductContinue} disabled={!canContinueProduct} loading={saving} />
          </div>
        )}

        {/* ════ STEP 5 : ICP ════ */}
        {step === "icp" && (
          <div className="flex flex-col h-full">
            <StepHeader
              icon={<Target size={15} />}
              title="Define your ideal customer"
              subtitle={websiteAnalysis
                ? `Based on your website, we pre-filled your ICP. Adjust anything that doesn't fit.`
                : `We'll find companies that match${emailConnected ? " and flag warm ones" : ""}.`}
            />

            {buildError && <div className="mb-2 rounded-lg p-1.5 text-[11px]" style={{ background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}>{buildError}</div>}

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
              <div>
                <span className={label} style={labelStyle}>Industries</span>
                <TagInput options={INDUSTRIES} selected={industries} onToggle={(val) => togglePill(industries, val, setIndustries)} placeholder="Search industries..." />
              </div>
              <div>
                <span className={label} style={labelStyle}>Company size</span>
                <PillSelect options={COMPANY_SIZES} selected={companySizes} onToggle={(val) => togglePill(companySizes, val, setCompanySizes)} />
              </div>
              <div>
                <span className={label} style={labelStyle}>Geography</span>
                <TagInput options={GEOGRAPHIES} selected={geographies} onToggle={(val) => togglePill(geographies, val, setGeographies)} placeholder="Search regions, countries..." />
              </div>
              <div>
                <span className={label} style={labelStyle}>Seniority level *</span>
                <TagInput options={JOB_SENIORITIES} selected={targetSeniorities} onToggle={(val) => togglePill(targetSeniorities, val, setTargetSeniorities)} placeholder="Search seniority levels..." />
              </div>
              <div>
                <span className={label} style={labelStyle}>Department</span>
                <TagInput options={JOB_DEPARTMENTS} selected={targetDepartments} onToggle={(val) => togglePill(targetDepartments, val, setTargetDepartments)} placeholder="Search departments..." />
              </div>
            </div>

            <StepFooter onBack={() => setStep("product")} onNext={handleBuildTAM} disabled={!canContinueICP} nextLabel={<><Target size={13} /> Build my prospect list</>} />
          </div>
        )}

        {/* ════ STEP 6 : BUILDING ════ */}
        {step === "building" && (() => {
          const stages = [
            { label: "Searching company databases...", icon: <Globe size={13} /> },
            { label: "Validating with Apollo...", icon: <Target size={13} /> },
            { label: "Enriching company profiles...", icon: <Building2 size={13} /> },
            { label: emailConnected ? "Cross-referencing your inbox..." : "Scoring against your ICP...", icon: emailConnected ? <Mail size={13} /> : <Zap size={13} /> },
            { label: `Found ${tamProgress.found} companies`, icon: <Check size={13} /> },
            { label: "Finalizing your pipeline...", icon: <Sparkles size={13} /> },
          ];
          return (
            <div className="flex flex-col h-full">
              <div className="text-center shrink-0 mb-4">
                <h2 className="text-[15px] font-semibold mb-0.5" style={{ color: "var(--color-text-primary)" }}>Building your pipeline...</h2>
                <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>This takes about 30 seconds.</p>
              </div>

              {/* Progress stages */}
              <div className="flex-1 flex flex-col justify-center">
                <div className="space-y-1.5 mb-5">
                  {stages.map((s, i) => {
                    const done = buildStage > i;
                    const active = buildStage === i;
                    if (i > buildStage + 1) return null;
                    return (
                      <div key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-all duration-300"
                        style={{
                          background: done ? "rgba(34,197,94,.05)" : active ? "var(--color-bg-page)" : "transparent",
                          border: `1px solid ${done ? "rgba(34,197,94,.15)" : active ? "var(--color-border-default)" : "transparent"}`,
                          opacity: done ? 0.7 : 1,
                        }}>
                        <span style={{ color: done ? "#22c55e" : "var(--color-accent)" }}>
                          {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : s.icon}
                        </span>
                        <span className="text-[12px]" style={{ color: done ? "var(--color-text-tertiary)" : "var(--color-text-primary)", fontWeight: active ? 500 : 400 }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Preview of found companies */}
                {topCompanies.length > 0 && (
                  <div className="rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                    <span className="text-[10px] font-medium uppercase tracking-wide block mb-2" style={{ color: "var(--color-text-tertiary)" }}>First matches</span>
                    <div className="space-y-1">
                      {topCompanies.map((c) => (
                        <div key={c.domain || c.name} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                            {c.domain && <img src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=128`} alt="" className="w-4 h-4" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                          </div>
                          <span className="text-[11px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                          {c.industry && <span className="text-[10px] ml-auto shrink-0" style={{ color: "var(--color-text-tertiary)" }}>{c.industry}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ════ STEP 7 : READY ════ */}
        {step === "ready" && (
          <div className="flex flex-col h-full">
            <div className="text-center shrink-0 mb-4">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "rgba(34,197,94,.1)" }}>
                <Check size={18} style={{ color: "#22c55e" }} />
              </div>
              <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Your GTM engine is ready</h2>
            </div>

            <div className="flex-1 space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 w-full">
                <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{tamProgress.found}</span>
                  <span className="block text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>ICP prospects found</span>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  {emailConnected ? (
                    <>
                      <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                        {emailIntelligence ? emailIntelligence.icpMatches : <Loader2 size={16} className="inline animate-spin" style={{ color: "var(--color-accent)" }} />}
                      </span>
                      <span className="block text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {emailIntelligence ? "already in your inbox" : "analyzing your inbox..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-tertiary)" }}>-</span>
                      <span className="block text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>connect email to find warm leads</span>
                    </>
                  )}
                </div>
              </div>

              {/* Top companies preview */}
              {topCompanies.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <span className="text-[10px] font-medium uppercase tracking-wide block mb-2" style={{ color: "var(--color-text-tertiary)" }}>Top prospects</span>
                  <div className="space-y-1.5">
                    {topCompanies.map((c) => (
                      <div key={c.domain || c.name} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                          {c.domain && <img src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=128`} alt="" className="w-5 h-5" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                        </div>
                        <span className="text-[12px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                        {c.industry && <span className="text-[10px] ml-auto shrink-0" style={{ color: "var(--color-text-tertiary)" }}>{c.industry}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 pt-3 mt-auto">
              <button onClick={onComplete} className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold text-white gradient-brand">
                Go to your dashboard <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
