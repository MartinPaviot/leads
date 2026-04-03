"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowRight, ArrowLeft, Loader2, Check, Mail, Sparkles, Target, Zap, MessageSquare, Users, Building2, Globe, ChevronDown } from "lucide-react";
import { INDUSTRIES, COMPANY_SIZES, SALES_MOTIONS, sizesToApolloRanges } from "@/lib/icp-constants";

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
  userEmail?: string;
}

type Step = "welcome" | "product" | "connect" | "icp" | "building" | "ready";

const STEPS: { key: Step; label: string }[] = [
  { key: "welcome", label: "Your profile" },
  { key: "product", label: "Your product" },
  { key: "connect", label: "Connect email" },
  { key: "icp", label: "Your customer" },
  { key: "building", label: "Building" },
  { key: "ready", label: "Ready" },
];

const CHALLENGES = ["Finding the right leads", "Getting responses", "Closing deals", "Expanding accounts"];

function PillSelect({ options, selected, onToggle, multi = true }: {
  options: readonly string[];
  selected: string[];
  onToggle: (val: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150"
            style={{
              background: active ? "var(--color-accent)" : "var(--color-bg-page)",
              color: active ? "white" : "var(--color-text-secondary)",
              border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
            }}
          >
            {opt}
          </button>
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

  const filtered = search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()) && !selected.includes(o))
    : options.filter((o) => !selected.includes(o));

  return (
    <div className="relative">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              {tag}
              <button
                type="button"
                onClick={() => onToggle(tag)}
                className="ml-0.5 hover:opacity-70"
                style={{ lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={selected.length > 0 ? "Add more..." : placeholder || "Search..."}
        className="auth-input w-full rounded-lg px-3 py-2 text-[13px] outline-none"
        style={{
          background: "var(--color-bg-page)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border-default)",
        }}
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(""); }} />
          <div
            className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg py-1"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
              boxShadow: "var(--shadow-dialog)",
            }}
          >
            {filtered.slice(0, 12).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onToggle(opt); setSearch(""); }}
                className="w-full text-left px-3 py-1.5 text-[13px] hover:brightness-95 transition-colors"
                style={{ color: "var(--color-text-primary)" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                {opt}
              </button>
            ))}
            {filtered.length > 12 && (
              <p className="px-3 py-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {filtered.length - 12} more. Type to filter.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FreeTagInput({ tags, setTags, placeholder }: {
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      setTags([...tags, val]);
    }
    setInput("");
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                className="ml-0.5 hover:opacity-70"
                style={{ lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); addTag(); }
        }}
        placeholder={tags.length > 0 ? "Add more..." : placeholder || "Type and press Enter..."}
        className="auth-input w-full rounded-lg px-3 py-2 text-[13px] outline-none"
        style={{
          background: "var(--color-bg-page)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border-default)",
        }}
      />
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current) / total) * 100;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
          {current}/{total} · {STEPS[current - 1]?.label}
        </span>
      </div>
      <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "var(--color-border-default)" }}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: "var(--color-accent)" }}
        />
      </div>
    </div>
  );
}

export function OnboardingWizard({ onComplete, hasGoogle, userEmail }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);

  // Website analysis (runs in background from Step 1)
  const [websiteAnalysis, setWebsiteAnalysis] = useState<WebsiteAnalysis | null>(null);
  const [analyzingWebsite, setAnalyzingWebsite] = useState(false);
  const [domain, setDomain] = useState(() => {
    if (!userEmail) return "";
    const d = userEmail.split("@")[1] || "";
    // Skip generic email providers
    if (/gmail|yahoo|hotmail|outlook|icloud|aol|proton/i.test(d)) return "";
    return d;
  });

  // Step 1: Welcome
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState(() => {
    if (!domain) return "";
    // Extract company name from domain (elevay.dev → Elevay)
    const name = domain.split(".")[0] || "";
    return name.charAt(0).toUpperCase() + name.slice(1);
  });
  const [role, setRole] = useState("Founder");

  // Step 2: Product
  const [productDesc, setProductDesc] = useState("");
  const [salesMotion, setSalesMotion] = useState("Founder-led sales");
  const [aiTone, setAiTone] = useState("Direct");
  const [challenge, setChallenge] = useState("");

  // Step 3: Connect
  const [connecting, setConnecting] = useState(false);
  const [emailConnected, setEmailConnected] = useState(hasGoogle);
  const [syncProgress, setSyncProgress] = useState<{ contacts: number; emails: number } | null>(null);

  // Step 4: ICP
  const [industries, setIndustries] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState("");
  const [geographies, setGeographies] = useState<string[]>([]);

  // Step 5: Building
  const [tamProgress, setTamProgress] = useState<{ found: number; done: boolean }>({ found: 0, done: false });
  const [emailIntelligence, setEmailIntelligence] = useState<{
    contacts: number;
    conversations: number;
    icpMatches: number;
    followUps: number;
  } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.key === step) + 1;

  const togglePill = useCallback((list: string[], val: string, setter: (v: string[]) => void) => {
    setter(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  }, []);

  const saveOnboardingData = async (data: Record<string, unknown>) => {
    await fetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  // Step 1 → Step 2 + trigger website analysis in background
  const handleWelcomeContinue = async () => {
    setSaving(true);
    await saveOnboardingData({ fullName, companyName, role, domain, step: "welcome" });
    setSaving(false);
    setStep("product");

    // Fire-and-forget website analysis — results will be ready by Step 4
    if (domain) {
      setAnalyzingWebsite(true);
      fetch("/api/onboarding/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && !data.error) {
            setWebsiteAnalysis(data);
            // Pre-fill product description if user hasn't typed anything yet
            if (data.productDescription && !productDesc && !/unknown|n\/a|<|>/i.test(data.productDescription)) {
              setProductDesc(data.productDescription);
            }
          }
        })
        .catch(() => {})
        .finally(() => setAnalyzingWebsite(false));
    }
  };

  // Step 2 → Step 3
  const handleProductContinue = async () => {
    setSaving(true);
    await saveOnboardingData({ productDesc, salesMotion, challenge, step: "product" });
    setSaving(false);
    setStep("connect");

    // If website analysis hasn't started yet (no domain from email), try with product desc
    if (!websiteAnalysis && !analyzingWebsite && domain) {
      setAnalyzingWebsite(true);
      fetch("/api/onboarding/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, productDescription: productDesc }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && !data.error) setWebsiteAnalysis(data);
        })
        .catch(() => {})
        .finally(() => setAnalyzingWebsite(false));
    }
  };

  // Step 3: Connect email
  const handleConnectGoogle = () => {
    // Save current state then redirect to OAuth
    saveOnboardingData({ emailProvider: "google", step: "connect" });
    window.location.href = "/api/auth/signin/google";
  };

  const handleConnectMicrosoft = () => {
    saveOnboardingData({ emailProvider: "microsoft", step: "connect" });
    window.location.href = "/api/auth/signin/microsoft-entra-id";
  };

  // Step 3 → Step 4: apply AI-inferred ICP if available
  const handleConnectContinue = () => {
    applyWebsiteAnalysis();
    setStep("icp");
  };
  const handleConnectSkip = () => {
    applyWebsiteAnalysis();
    setStep("icp");
  };

  // Apply website analysis to ICP fields (pre-fill pills)
  const applyWebsiteAnalysis = () => {
    if (!websiteAnalysis) return;
    if (industries.length === 0 && websiteAnalysis.targetIndustries.length > 0) {
      setIndustries(websiteAnalysis.targetIndustries.filter((i) => (INDUSTRIES as readonly string[]).includes(i)));
    }
    if (companySizes.length === 0 && websiteAnalysis.targetCompanySizes.length > 0) {
      setCompanySizes(websiteAnalysis.targetCompanySizes.filter((s) => (COMPANY_SIZES as readonly string[]).includes(s)));
    }
    if (!targetRoles && websiteAnalysis.targetRoles) {
      setTargetRoles(websiteAnalysis.targetRoles);
    }
    if (geographies.length === 0 && websiteAnalysis.targetGeographies.length > 0) {
      setGeographies(websiteAnalysis.targetGeographies);
    }
    if (websiteAnalysis.suggestedTone && aiTone === "Direct") {
      setAiTone(websiteAnalysis.suggestedTone);
    }
  };

  // Step 4 → Step 5 (build)
  const handleBuildTAM = async () => {
    setStep("building");
    setBuildError(null);

    const apolloSizeRanges = sizesToApolloRanges(companySizes);

    try {
      // Save ICP data + inferred tone from website analysis
      await saveOnboardingData({
        industries, companySizes, targetRoles, geographies,
        aiTone,
        step: "icp",
      });

      // Build TAM with structured filters — no LLM translation needed
      const tamRes = await fetch("/api/tam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries,
          companySizes: apolloSizeRanges,
          targetRoles,
          geographies,
          productDescription: productDesc,
        }),
      });

      if (!tamRes.ok) {
        const data = await tamRes.json();
        throw new Error(data.error || "TAM build failed");
      }

      const tamData = await tamRes.json();
      setTamProgress({ found: tamData.companiesCreated || 0, done: true });

      // Score accounts in background
      const accountsRes = await fetch("/api/accounts");
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const ids = (accountsData.accounts || accountsData || [])
          .map((a: { id: string }) => a.id)
          .slice(0, 20);
        if (ids.length > 0) {
          fetch("/api/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyIds: ids }),
          }).catch(() => {});
        }
      }

      // Embed for RAG
      fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "companies" }),
      }).catch(() => {});

      // Check email intelligence if connected
      if (emailConnected) {
        try {
          const emailRes = await fetch("/api/onboarding/email-intelligence");
          if (emailRes.ok) {
            const emailData = await emailRes.json();
            setEmailIntelligence(emailData);
          }
        } catch { /* email intelligence is best-effort */ }
      }

      // Mark onboarding complete
      await saveOnboardingData({ step: "complete", onboardingCompleted: true });

      // Small delay so user sees the building animation
      await new Promise((r) => setTimeout(r, 1500));
      setStep("ready");
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Failed to build TAM");
      setStep("icp");
    }
  };

  // Check if Google was just connected (back from OAuth redirect)
  useEffect(() => {
    if (hasGoogle && !emailConnected) {
      setEmailConnected(true);
    }
  }, [hasGoogle, emailConnected]);

  const canContinueWelcome = fullName.trim() && companyName.trim() && domain.trim();
  const canContinueProduct = productDesc.trim().length >= 10 && challenge;
  const canContinueICP = industries.length > 0 && companySizes.length > 0 && targetRoles.trim();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-page)",
      }}
    >
      {/* Header */}
      <div className="w-full max-w-lg px-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="gradient-text text-xl font-bold tracking-tight">LeadSens</h1>
          {step !== "ready" && step !== "building" && (
            <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              ~{Math.max(1, 4 - stepIndex + 1)} min left
            </span>
          )}
        </div>
        {step !== "ready" && <ProgressBar current={stepIndex} total={6} />}
      </div>

      {/* Card */}
      <div
        className="w-full max-w-lg mx-4 overflow-y-auto"
        style={{
          maxHeight: "calc(100vh - 140px)",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-dialog)",
          padding: "28px",
        }}
      >
        {/* ──────────── STEP 1: WELCOME ──────────── */}
        {step === "welcome" && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={18} style={{ color: "var(--color-accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Let&apos;s set up your GTM engine
              </h2>
            </div>
            <p className="text-[13px] mb-5" style={{ color: "var(--color-text-tertiary)" }}>
              Takes about 3 minutes. No credit card needed.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Your name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Martin Paviot"
                  className="auth-input w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: "var(--color-bg-page)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-default)",
                  }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Company name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Elevay"
                  className="auth-input w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: "var(--color-bg-page)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-default)",
                  }}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Company website
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""))}
                  placeholder="yourcompany.com"
                  className="auth-input w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: "var(--color-bg-page)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-default)",
                  }}
                />
                {domain && (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    We&apos;ll analyze your website to pre-fill your ICP
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  Your role
                </label>
                <PillSelect
                  options={["Founder", "Sales / Growth", "Marketing", "RevOps", "Other"]}
                  selected={[role]}
                  onToggle={(val) => setRole(val)}
                  multi={false}
                />
              </div>
            </div>

            <button
              onClick={handleWelcomeContinue}
              disabled={!canContinueWelcome || saving}
              className="auth-button mt-6 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold text-white transition-all duration-150 gradient-brand"
              style={{ opacity: canContinueWelcome ? 1 : 0.5, cursor: canContinueWelcome ? "pointer" : "not-allowed" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <>Continue <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {/* ──────────── STEP 2: YOUR PRODUCT ──────────── */}
        {step === "product" && (
          <div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
              Tell us about what you sell
            </h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--color-text-tertiary)" }}>
              This helps our AI write relevant emails and give useful coaching.
              {analyzingWebsite && " We're analyzing your website in the background..."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  What do you sell? *
                </label>
                <textarea
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="e.g., API platform for fintech companies to embed payments"
                  rows={2}
                  className="auth-input w-full rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
                  style={{
                    background: "var(--color-bg-page)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-default)",
                  }}
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  Sales motion
                </label>
                <PillSelect
                  options={SALES_MOTIONS}
                  selected={[salesMotion]}
                  onToggle={(val) => setSalesMotion(val)}
                  multi={false}
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  Biggest challenge right now *
                </label>
                <PillSelect
                  options={CHALLENGES}
                  selected={challenge ? [challenge] : []}
                  onToggle={(val) => setChallenge(val)}
                  multi={false}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setStep("welcome")}
                className="flex items-center gap-1 text-[13px] font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                onClick={handleProductContinue}
                disabled={!canContinueProduct || saving}
                className="auth-button flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold text-white transition-all duration-150 gradient-brand"
                style={{ opacity: canContinueProduct ? 1 : 0.5, cursor: canContinueProduct ? "pointer" : "not-allowed" }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <>Continue <ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ──────────── STEP 3: CONNECT EMAIL ──────────── */}
        {step === "connect" && (
          <div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
              Connect your email to unlock LeadSens
            </h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--color-text-tertiary)" }}>
              This is how LeadSens learns who your customers are, what you&apos;ve discussed, and who needs follow-up.
            </p>

            {/* Value bullets */}
            <div className="space-y-2.5 mb-5">
              {[
                { icon: <MessageSquare size={14} />, title: "Customer memory", desc: "every conversation, searchable and cited" },
                { icon: <Users size={14} />, title: "Auto-built CRM", desc: "contacts and accounts created from your emails" },
                { icon: <Zap size={14} />, title: "Smart outbound", desc: "AI references your actual history when writing" },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }}>{item.icon}</span>
                  <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    <strong style={{ color: "var(--color-text-primary)" }}>{item.title}</strong>
                    <br />
                    <span style={{ color: "var(--color-text-tertiary)" }}>{item.desc}</span>
                  </p>
                </div>
              ))}
            </div>

            {emailConnected ? (
              <div className="rounded-lg p-3 mb-4" style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                <div className="flex items-center gap-2">
                  <Check size={16} style={{ color: "#22c55e" }} />
                  <span className="text-[13px] font-medium" style={{ color: "#22c55e" }}>
                    Email connected. Syncing in background.
                  </span>
                </div>
                {syncProgress && (
                  <p className="mt-1 text-[12px] ml-6" style={{ color: "var(--color-text-tertiary)" }}>
                    {syncProgress.contacts} contacts found · {syncProgress.emails} emails processed
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  onClick={handleConnectGoogle}
                  className="auth-button flex w-full items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all duration-150"
                  style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </button>
                <button
                  onClick={handleConnectMicrosoft}
                  className="auth-button flex w-full items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all duration-150"
                  style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
                >
                  <svg className="h-5 w-5" viewBox="0 0 21 21">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  Continue with Microsoft
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => setStep("product")}
                className="flex items-center gap-1 text-[13px] font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <ArrowLeft size={14} /> Back
              </button>
              {!emailConnected && (
                <button
                  onClick={handleConnectSkip}
                  className="text-[13px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Skip for now
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={handleConnectContinue}
                className="flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-semibold text-white gradient-brand transition-all duration-150"
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>

            {!emailConnected && (
              <p className="mt-3 text-[11px] text-center" style={{ color: "var(--color-text-tertiary)" }}>
                Without email, LeadSens can&apos;t build your customer memory or personalize outbound.
              </p>
            )}
          </div>
        )}

        {/* ──────────── STEP 4: YOUR CUSTOMER (ICP) ──────────── */}
        {step === "icp" && (
          <div>
            {websiteAnalysis ? (
              <>
                <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
                  We analyzed your website
                </h2>
                <p className="text-[13px] mb-4" style={{ color: "var(--color-text-tertiary)" }}>
                  Here&apos;s who we think you should target. Adjust anything that doesn&apos;t fit.
                </p>

                {/* AI summary as natural language */}
                <div className="rounded-lg p-4 mb-5" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <div className="flex items-start gap-2.5 mb-2">
                    <Sparkles size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
                      {websiteAnalysis.companyDescription}
                    </p>
                  </div>
                  <p className="text-[12px] ml-[26px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {websiteAnalysis.reasoning}
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
                  Who is your ideal customer?
                </h2>
                <p className="text-[13px] mb-4" style={{ color: "var(--color-text-tertiary)" }}>
                  We&apos;ll find companies that match{emailConnected ? ", and flag which ones you're already talking to" : ""}.
                </p>
              </>
            )}

            {buildError && (
              <div className="mb-4 rounded-lg p-3 text-[13px]" style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                {buildError}
              </div>
            )}

            {emailConnected && !websiteAnalysis && (
              <div className="rounded-lg p-2.5 mb-4 text-[12px]" style={{ background: "rgba(44, 107, 237, 0.06)", border: "1px solid rgba(44, 107, 237, 0.15)", color: "var(--color-accent)" }}>
                Email syncing. We&apos;ll cross-reference your contacts with your ICP.
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  Industries
                </label>
                <TagInput
                  options={INDUSTRIES}
                  selected={industries}
                  onToggle={(val) => togglePill(industries, val, setIndustries)}
                  placeholder="Search industries..."
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  Company size
                </label>
                <PillSelect
                  options={COMPANY_SIZES}
                  selected={companySizes}
                  onToggle={(val) => togglePill(companySizes, val, setCompanySizes)}
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  Geography
                </label>
                <FreeTagInput
                  tags={geographies}
                  setTags={setGeographies}
                  placeholder="Type a location and press Enter (e.g., France, California, London...)"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                  Decision-maker role
                </label>
                <input
                  type="text"
                  value={targetRoles}
                  onChange={(e) => setTargetRoles(e.target.value)}
                  placeholder="e.g., VP Engineering, CTO, Head of Product"
                  className="auth-input w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                  style={{
                    background: "var(--color-bg-page)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-default)",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setStep("connect")}
                className="flex items-center gap-1 text-[13px] font-medium"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                onClick={handleBuildTAM}
                disabled={!canContinueICP}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold text-white transition-all duration-150 gradient-brand"
                style={{ opacity: canContinueICP ? 1 : 0.5, cursor: canContinueICP ? "pointer" : "not-allowed" }}
              >
                <Target size={14} /> Build my prospect list
              </button>
            </div>
          </div>
        )}

        {/* ──────────── STEP 5: BUILDING ──────────── */}
        {step === "building" && (
          <div className="py-6">
            <h2 className="text-lg font-semibold mb-1 text-center" style={{ color: "var(--color-text-primary)" }}>
              LeadSens is learning your world...
            </h2>
            <p className="text-[13px] mb-6 text-center" style={{ color: "var(--color-text-tertiary)" }}>
              Finding prospects and building your customer intelligence.
            </p>

            {/* TAM Track */}
            <div className="rounded-lg p-4 mb-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} style={{ color: "var(--color-accent)" }} />
                <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  Finding prospects matching your ICP
                </span>
              </div>
              <div className="flex items-center gap-2">
                {tamProgress.done ? (
                  <Check size={14} style={{ color: "#22c55e" }} />
                ) : (
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                )}
                <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {tamProgress.done
                    ? `Found ${tamProgress.found} companies`
                    : "Searching company databases..."
                  }
                </span>
              </div>
            </div>

            {/* Email Track */}
            {emailConnected && (
              <div className="rounded-lg p-4" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Mail size={14} style={{ color: "var(--color-accent)" }} />
                  <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                    Building your customer memory
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                  <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                    Syncing conversations... this continues in the background.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ──────────── STEP 6: READY ──────────── */}
        {step === "ready" && (
          <div className="py-2">
            <div className="text-center mb-5">
              <div
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: "rgba(34, 197, 94, 0.1)" }}
              >
                <Check size={24} style={{ color: "#22c55e" }} />
              </div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Your GTM engine is ready
              </h2>
            </div>

            {/* Results summary */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { value: tamProgress.found, label: "prospects found", icon: <Target size={14} /> },
                { value: emailConnected ? "Active" : "—", label: "email sync", icon: <Mail size={14} /> },
                { value: emailIntelligence?.icpMatches || 0, label: "warm ICP matches", icon: <Zap size={14} /> },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg p-3 text-center"
                  style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
                >
                  <span className="block mx-auto mb-1" style={{ color: "var(--color-accent)" }}>{stat.icon}</span>
                  <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                    {stat.value}
                  </span>
                  <span className="block text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Cross-reference insight */}
            {emailIntelligence && emailIntelligence.icpMatches > 0 && (
              <div
                className="rounded-lg p-3.5 mb-5"
                style={{ background: "rgba(44, 107, 237, 0.06)", border: "1px solid rgba(44, 107, 237, 0.15)" }}
              >
                <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {emailIntelligence.icpMatches} of your ICP prospects are already in your inbox.
                </p>
                <p className="text-[12px] mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  {emailIntelligence.followUps > 0
                    ? `${emailIntelligence.followUps} need follow-up. They haven't heard from you in over a week.`
                    : `You've had ${emailIntelligence.conversations} conversations with them.`
                  }
                </p>
              </div>
            )}

            <button
              onClick={onComplete}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold text-white transition-all duration-150 gradient-brand"
            >
              Go to your dashboard <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
