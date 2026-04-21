"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, ArrowLeft, Loader2, Check, Mail, Target, Zap, MessageSquare, Users, Building2, Globe, ChevronDown, Calendar, Shield, Eye, EyeOff, Clock, Send, Inbox, Database } from "lucide-react";
import { INDUSTRIES, COMPANY_SIZES, SALES_MOTIONS, GEOGRAPHIES, JOB_SENIORITIES, JOB_DEPARTMENTS, sizesToApolloRanges } from "@/lib/icp-constants";
import { CompanyLogo } from "@/components/ui/company-logo";
import { chunkedBulkCall } from "@/lib/chunk-bulk";
import { trackEvent } from "@/components/posthog-provider";

/* ── WS-0: measured fetch helper ──
 * Wraps `fetch` for the three onboarding APIs that are NOT LLM-traced
 * (enrich-icp, find-contacts, email-intelligence). Fires a single
 * `onboarding_api_latency` PostHog event per call with wall-clock
 * duration + HTTP status. Throws on network error (same as fetch), but
 * fires the event before rethrowing so we capture the failure too.
 * No userId → silent no-op, preserves existing behavior. */
async function measuredFetch(
  userId: string | undefined,
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const start = Date.now();
  try {
    const res = await fetch(endpoint, init);
    if (userId) {
      void trackEvent(userId, "onboarding_api_latency", {
        endpoint,
        durationMs: Date.now() - start,
        status: res.status,
      });
    }
    return res;
  } catch (err) {
    if (userId) {
      void trackEvent(userId, "onboarding_api_latency", {
        endpoint,
        durationMs: Date.now() - start,
        status: -1,
        errorClass: err instanceof Error ? err.name : "unknown",
      });
    }
    throw err;
  }
}

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
  confidenceGaps?: Array<{
    field: string;
    question: string;
    currentGuess: string;
  }>;
  pricingModel?: string;
}

interface OnboardingWizardProps {
  onComplete: () => void;
  hasGoogle: boolean;
  hasMicrosoft?: boolean;
  userEmail?: string;
  userName?: string;
  /** Internal stable user ID (from `/api/onboarding/status`). Used as the
   * PostHog `distinct_id` for every analytics event the wizard fires. Absent
   * means analytics is silently disabled — never blocks the UI. */
  userId?: string;
  /** Persisted step from `/api/onboarding/status`. When present on mount, the
   * wizard resumes at that step and flashes a "Welcome back" banner. */
  initialStep?: Step | null;
}

export type Step = "connect" | "privacy" | "welcome" | "product" | "icp" | "building" | "ready";

const RESUMABLE_STEPS: ReadonlySet<Step> = new Set([
  "welcome",
  "connect",
  "privacy",
  "product",
  "icp",
  "ready",
]);

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

function StepHeader({ icon, title, subtitle, headingId }: { icon: React.ReactNode; title: string; subtitle: string; headingId?: string }) {
  return (
    <div className="shrink-0 mb-3">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span style={{ color: "var(--color-accent)" }}>{icon}</span>
        <h2 id={headingId} className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
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
  const label = STEPS[current - 1]?.label ?? "";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
          {current}/{total} · {label}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Onboarding step ${current} of ${total}: ${label}`}
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        className="h-0.5 w-full rounded-full overflow-hidden"
        style={{ background: "var(--color-border-default)" }}
      >
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
  { value: "selective", label: "Selective", short: "You only", icon: <Eye size={12} /> },
  { value: "always", label: "Always", short: "All emails", icon: <Users size={12} /> },
  { value: "disabled", label: "Disabled", short: "Off", icon: <EyeOff size={12} /> },
] as const;

// O7 — visibility default for newly captured records. Defaults to
// "everyone" so single-tenant founders see no behavior change; multi-user
// tenants can lock down here on day one.
const VISIBILITY_OPTIONS = [
  { value: "everyone", label: "Everyone", short: "All members", icon: <Users size={12} /> },
  { value: "team", label: "Team", short: "Your team", icon: <Shield size={12} /> },
  { value: "private", label: "Private", short: "Only you", icon: <EyeOff size={12} /> },
] as const;

/* ═══════════════════════════ MAIN COMPONENT ═══════════════════════════ */

export function OnboardingWizard({ onComplete, hasGoogle, hasMicrosoft, userEmail, userName, userId, initialStep }: OnboardingWizardProps) {
  // Resume from a prior session if the status endpoint handed us a step.
  // The server already clamps "building" → "icp"; we double-check via
  // RESUMABLE_STEPS to guard against future transient states.
  const resumeStep =
    initialStep && RESUMABLE_STEPS.has(initialStep) ? initialStep : null;
  const [step, setStep] = useState<Step>(resumeStep ?? "welcome");
  const [showResumeBanner, setShowResumeBanner] = useState<boolean>(!!resumeStep);
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
  const [defaultVisibility, setDefaultVisibility] =
    useState<"everyone" | "team" | "private">("everyone");
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

  // ── Onboarding wow effect 1 — streamed narrative of "what the
  // agent understood about your company." Fired in the background
  // from the welcome step (same trigger as analyze-website), shown
  // live on the product + ICP steps so the founder sees the agent
  // form an opinion on their business in real time. ──
  const [narrative, setNarrative] = useState<string>("");
  const [narrativeStreaming, setNarrativeStreaming] = useState(false);
  const narrativeAbortRef = useRef<AbortController | null>(null);

  // ── Onboarding wow effect 2 — live TAM estimate that updates
  // as the user toggles ICP filters. Debounced to 400ms to avoid
  // hammering Apollo on every pill click. ──
  const [tamEstimate, setTamEstimate] = useState<{
    total: number | null;
    capped: boolean;
    loading: boolean;
  }>({ total: null, capped: false, loading: false });

  const [tamProgress, setTamProgress] = useState<{ found: number; done: boolean }>({ found: 0, done: false });
  const [emailIntelligence, setEmailIntelligence] = useState<{ contacts: number; conversations: number; icpMatches: number; followUps: number } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ contacts: number; emails: number } | null>(null);
  const [buildStage, setBuildStage] = useState(0);
  const [topCompanies, setTopCompanies] = useState<{ name: string; domain: string; industry?: string }[]>([]);
  const [topContacts, setTopContacts] = useState<{ name: string; email: string; title: string | null; score: number | null }[]>([]);
  const [contactsFound, setContactsFound] = useState(0);

  const stepIndex = STEPS.findIndex((s) => s.key === step) + 1;
  const togglePill = useCallback((list: string[], val: string, setter: (v: string[]) => void) => {
    setter(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  }, []);

  /* ── O10 — modal a11y ──
   * The wizard is a fullscreen takeover with no close affordance: the
   * user is locked in until completion (or reload). To stay WCAG AA
   * compliant we still need:
   *   - role="dialog" + aria-modal="true" + aria-labelledby pointing at
   *     the per-step heading
   *   - focus trap so Tab can't escape into background DOM
   *   - aria-live region announcing step transitions to screen readers
   *   - role="progressbar" with valuenow/valuemax on the indicator
   *
   * A heavier focus-trap lib isn't worth pulling in for one modal — a
   * 30-line cycle-on-Tab handler covers it.
   */
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const stepHeadingId = `onboarding-step-heading-${step}`;
  const liveRegionRef = useRef<HTMLDivElement | null>(null);

  // Announce step changes to screen readers.
  useEffect(() => {
    const label = STEPS[stepIndex - 1]?.label ?? step;
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = `Step ${stepIndex} of ${STEPS.length}: ${label}`;
    }
  }, [step, stepIndex]);

  // ── WS-0 instrumentation ──
  // Tracks when the current step was entered so `onboarding_step_completed`
  // carries an accurate `durationMs`. Seeded to the mount time; advanced on
  // every transition by the step-tracking effect below.
  const stepStartRef = useRef<number>(Date.now());
  const prevStepRef = useRef<Step>(step);
  const onboardingStartFiredRef = useRef<boolean>(false);
  const confidenceGapsFiredRef = useRef<boolean>(false);
  const emailConnectedFiredRef = useRef<boolean>(emailConnected);

  // Fire onboarding_started / onboarding_resumed exactly once on mount.
  useEffect(() => {
    if (onboardingStartFiredRef.current) return;
    onboardingStartFiredRef.current = true;
    if (!userId) return;
    if (resumeStep) {
      void trackEvent(userId, "onboarding_resumed", { fromStep: resumeStep });
    } else {
      void trackEvent(userId, "onboarding_started", { userId });
    }
  }, [userId, resumeStep]);

  // Fire onboarding_step_completed for the step the user just left.
  // prevStepRef tracks the "current" step at the time of the last firing;
  // on mount it already equals `step`, so the first render is a no-op.
  useEffect(() => {
    if (prevStepRef.current === step) return;
    const leftStep = prevStepRef.current;
    const stepIdx = STEPS.findIndex((s) => s.key === leftStep);
    const durationMs = Date.now() - stepStartRef.current;
    if (userId && stepIdx >= 0) {
      void trackEvent(userId, "onboarding_step_completed", {
        step: leftStep,
        stepIndex: stepIdx + 1,
        durationMs,
      });
    }
    stepStartRef.current = Date.now();
    prevStepRef.current = step;
  }, [step, userId]);

  // Fire onboarding_email_connected when we detect the transition
  // false → true (OAuth round-trip just completed).
  useEffect(() => {
    if (emailConnectedFiredRef.current) return;
    if (!emailConnected) return;
    emailConnectedFiredRef.current = true;
    if (!userId) return;
    const provider: "google" | "microsoft" = hasGoogle ? "google" : "microsoft";
    void trackEvent(userId, "onboarding_email_connected", { provider });
  }, [emailConnected, userId, hasGoogle]);

  // Fire onboarding_confidence_gaps_shown the first time the user lands on
  // the ICP step with a non-empty confidenceGaps panel. Measures how often
  // the LLM surfaces low-confidence fields — feeds WS-2's decision to make
  // the panel actionable or remove it entirely.
  useEffect(() => {
    if (confidenceGapsFiredRef.current) return;
    if (step !== "icp") return;
    const gaps = websiteAnalysis?.confidenceGaps;
    if (!gaps || gaps.length === 0) return;
    confidenceGapsFiredRef.current = true;
    if (!userId) return;
    void trackEvent(userId, "onboarding_confidence_gaps_shown", {
      gapCount: gaps.length,
      confidence: websiteAnalysis?.confidence ?? 0,
    });
  }, [step, websiteAnalysis, userId]);

  // Move focus to the dialog on mount so screen-reader users land inside
  // the modal rather than at the document root.
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    // Defer one tick so React has rendered the per-step content.
    const t = setTimeout(() => {
      const first = root.querySelector<HTMLElement>(
        "h2, [data-autofocus], button, [href], input, textarea, select"
      );
      first?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Cycle Tab inside the modal so keyboard users can't tab into the
  // background page (which is fully visually obscured but still in the
  // accessibility tree).
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusables = root!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root!.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, []);

  const saveOnboardingData = async (data: Record<string, unknown>) => {
    await fetch("/api/onboarding/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  };

  // Persist the current step on every navigation so a reload can resume
  // here. Fire-and-forget — a lost position update is not worth blocking
  // the UI for; the user will re-save on the next click anyway.
  const persistedStepRef = useRef<Step | null>(resumeStep);
  useEffect(() => {
    if (persistedStepRef.current === step) return;
    persistedStepRef.current = step;
    // Skip "building" — that state is transient and cleared by the server.
    if (step === "building") return;
    fetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "_current", currentStep: step }),
    }).catch((err) => console.warn("onboarding: persist step failed", err));
  }, [step]);

  /* ── Handlers ── */

  // O5 — When the user clicks Connect Google/Microsoft mid-wizard, NextAuth
  // redirects them off-site for OAuth. On return they land on `/home`,
  // which re-fetches `/api/onboarding/status`; thanks to T0.2 persisting
  // `onboardingCurrentStep = "connect"`, the wizard re-opens on the
  // connect step and auto-detects the freshly-connected provider (via
  // `hasGoogle || hasMicrosoft`). The callbackUrl is `/home?firstTime=connect`
  // so the effect can detect the OAuth return and skip to the next step.
  const handleConnectGoogle = async () => {
    // Persist currentStep BEFORE signIn — the browser hop means the
    // component unmounts before the useEffect's position-update runs.
    await saveOnboardingData({
      emailProvider: "google",
      step: "connect",
      currentStep: "connect",
    });
    signIn("google", { callbackUrl: "/home?onboarding=resume-connect" });
  };
  const handleConnectMicrosoft = async () => {
    await saveOnboardingData({
      emailProvider: "microsoft",
      step: "connect",
      currentStep: "connect",
    });
    signIn("microsoft-entra-id", { callbackUrl: "/home?onboarding=resume-connect" });
  };
  const handleConnectContinue = () => {
    // WS-0 — "Skip for now" is the same button as "Continue" when email
    // isn't connected; the user just clicked past the OAuth step without
    // linking a provider. Treat that as a skip event for funnel analysis.
    if (!emailConnected && userId) {
      void trackEvent(userId, "onboarding_skipped", { step: "connect" });
    }
    setStep(emailConnected ? "privacy" : "product");
  };
  const handleConnectSkip = () => { setStep("product"); };

  const handlePrivacyContinue = async () => {
    setSaving(true);
    await saveOnboardingData({
      step: "privacy",
      contactCreationMode: contactCreation,
      backsyncRange,
      defaultDataVisibility: defaultVisibility,
      doNotTrackDomains: doNotTrackDomains.filter((d) => d.trim()),
    });
    setSaving(false);
    setStep("product");
  };

  // Streams the first-wow narrative ("this is what we understood
  // about your company") from `/api/onboarding/narrate-website`.
  // Idempotent-ish: aborts any in-flight request before firing.
  const startNarrative = useCallback(async (d: string) => {
    narrativeAbortRef.current?.abort();
    const ctrl = new AbortController();
    narrativeAbortRef.current = ctrl;
    setNarrative("");
    setNarrativeStreaming(true);
    try {
      const res = await fetch("/api/onboarding/narrate-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        setNarrativeStreaming(false);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setNarrative((prev) => prev + value);
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        console.warn("onboarding: narrate-website failed", err);
      }
    } finally {
      setNarrativeStreaming(false);
    }
  }, []);

  const handleWelcomeContinue = async () => {
    setSaving(true);
    await saveOnboardingData({ fullName, companyName, role, domain, step: "welcome" });
    setSaving(false);
    setStep("connect");
    if (domain) {
      setAnalyzingWebsite(true);
      // Start the narrative stream immediately so by the time the
      // user lands on the product step it's already partially
      // written. Non-blocking.
      startNarrative(domain);
      // Launch website analysis + Apollo ICP enrichment in parallel
      fetch("/api/onboarding/analyze-website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data && !data.error) { setWebsiteAnalysis(data); if (data.productDescription && !productDesc && !/unknown|n\/a|<|>/i.test(data.productDescription)) setProductDesc(data.productDescription); } })
        .catch((e) => console.warn("onboarding: analyze-website failed", e))
        .finally(() => setAnalyzingWebsite(false));
      // Apollo ICP enrichment — enriches the analysis with real company data
      measuredFetch(userId, "/api/onboarding/enrich-icp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.icp) {
            // Merge Apollo ICP data into website analysis if it has higher confidence
            setWebsiteAnalysis((prev) => prev ? {
              ...prev,
              targetIndustries: prev.targetIndustries.length === 0 ? data.icp.industries : prev.targetIndustries,
              targetCompanySizes: prev.targetCompanySizes.length === 0 ? data.icp.companySizes : prev.targetCompanySizes,
              targetGeographies: prev.targetGeographies.length === 0 ? data.icp.geographies : prev.targetGeographies,
            } : null);
          }
        })
        .catch((e) => console.warn("onboarding: enrich-icp failed", e));
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
        .catch((e) => console.warn("onboarding: re-analyze-website failed", e))
        .finally(() => setAnalyzingWebsite(false));
    }
  };

  const handleBuildTAM = async () => {
    // WS-0 — trigger event fires at the exact moment the user committed to
    // the build. Carries the ICP cardinality so the funnel dashboard can
    // slice by "how specific was the user's targeting".
    const tamStartedAt = Date.now();
    if (userId) {
      void trackEvent(userId, "onboarding_build_tam_triggered", {
        icpIndustriesCount: industries.length,
        icpSizesCount: companySizes.length,
        icpGeosCount: geographies.length,
        icpSenioritiesCount: targetSeniorities.length,
      });
    }

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
      // Show total accounts (existing + new) not just newly created
      const totalRes = await fetch("/api/accounts?pageSize=1");
      const totalData = totalRes.ok ? await totalRes.json() : null;
      const totalAccounts = totalData?.pagination?.total || tamData.companiesCreated || 0;
      setTamProgress({ found: totalAccounts, done: true });
      setBuildStage(4);

      // Fetch all companies for scoring and top 5 for preview
      const accountsRes = await fetch("/api/accounts?pageSize=200");
      if (accountsRes.ok) {
        const ad = await accountsRes.json();
        const accounts = ad.accounts || ad || [];
        setTopCompanies(accounts.slice(0, 5).map((a: { name: string; domain?: string; industry?: string }) => ({
          name: a.name, domain: a.domain || "", industry: a.industry,
        })));
        // O4 — Score ALL companies and AWAIT full completion before the
        // "Ready" screen renders. Using `chunkedBulkCall` so a 200-company
        // TAM doesn't slam the scoring endpoint in a single request and
        // so partial failures don't silently drop half the TAM.
        const ids = accounts.map((a: { id: string }) => a.id);
        if (ids.length > 0) {
          const scoreResult = await chunkedBulkCall({
            ids,
            endpoint: "/api/score",
            buildPayload: (chunk) => ({ companyIds: chunk }),
          });
          if (scoreResult.failed > 0) {
            console.warn("onboarding: scoring had partial failures", {
              failed: scoreResult.failed,
              total: scoreResult.total,
              errors: scoreResult.errors,
            });
          }
        }
      }

      // Find decision-makers at top companies (await — shows contacts on ready screen)
      // Capture the created count in a local so the WS-0 completion event
      // fires with the right number — setContactsFound is async.
      let contactsCreatedLocal = 0;
      const contactsRes = await measuredFetch(userId, "/api/onboarding/find-contacts", { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => null);
      if (contactsRes && contactsRes.ok) {
        const cData = await contactsRes.json();
        contactsCreatedLocal = cData.contactsCreated || 0;
        setContactsFound(contactsCreatedLocal);
        setTopContacts((cData.contacts || []).slice(0, 5));
      }

      // Embed in background (non-critical for UX) — fire-and-forget telemetry-style.
      fetch("/api/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "companies" }) })
        .catch((e) => console.warn("onboarding: embed companies failed", e));
      fetch("/api/embed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "contacts" }) })
        .catch((e) => console.warn("onboarding: embed contacts failed", e));
      // Email intelligence — fire and forget, don't block onboarding
      if (emailConnected) {
        measuredFetch(userId, "/api/onboarding/email-intelligence")
          .then((er) => er.ok ? er.json() : null)
          .then((data) => { if (data) setEmailIntelligence(data); })
          .catch((e) => console.warn("onboarding: email-intelligence failed", e));
      }
      await saveOnboardingData({ step: "complete", onboardingCompleted: true });

      // WS-0 — TAM build success event. durationMs covers the full build
      // pipeline (Apollo search + enrich + scoring + find-contacts) but NOT
      // the 1.2s UI easing delay below, so the number matches the latency a
      // backend engineer would reason about. Reads locals, not state, so
      // the event fires with the actual values even though the setters
      // above are async.
      const tamCompletedMs = Date.now() - tamStartedAt;
      if (userId) {
        void trackEvent(userId, "onboarding_build_tam_completed", {
          companiesCreated: totalAccounts,
          contactsCreated: contactsCreatedLocal,
          durationMs: tamCompletedMs,
        });
      }

      setBuildStage(5);
      await new Promise((r) => setTimeout(r, 1200));
      setStep("ready");
    } catch (err) {
      stageTimers.forEach(clearTimeout);
      const errorClass = err instanceof Error ? err.name : "unknown";
      const durationMs = Date.now() - tamStartedAt;
      if (userId) {
        void trackEvent(userId, "onboarding_build_tam_failed", {
          errorClass,
          durationMs,
        });
      }
      setBuildError(err instanceof Error ? err.message : "Failed to build TAM");
      setStep("icp");
    }
  };

  useEffect(() => { if ((hasGoogle || hasMicrosoft) && !emailConnected) setEmailConnected(true); }, [hasGoogle, hasMicrosoft, emailConnected]);

  // ── Effet 2 — live TAM estimate ──
  // Fires `/api/tam/estimate` whenever the user toggles an ICP
  // picker. Debounced so rapid clicks on industry/size pills don't
  // spam Apollo. Only runs when the user is on the ICP step (cheap
  // in $ since we call with per_page=1, but still not free in
  // rate-limit credits).
  useEffect(() => {
    if (step !== "icp") return;
    const hasAnyFilter =
      industries.length > 0 || companySizes.length > 0 || geographies.length > 0;
    if (!hasAnyFilter) {
      setTamEstimate({ total: null, capped: false, loading: false });
      return;
    }
    const ctrl = new AbortController();
    setTamEstimate((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/tam/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            industries,
            companySizes: sizesToApolloRanges(companySizes),
            geographies,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setTamEstimate({ total: null, capped: false, loading: false });
          return;
        }
        const data = await res.json();
        setTamEstimate({
          total: typeof data.total === "number" ? data.total : null,
          capped: !!data.capped,
          loading: false,
        });
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setTamEstimate({ total: null, capped: false, loading: false });
        }
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [step, industries, companySizes, geographies]);

  const isValidDomain = (d: string) => /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(d);
  const domainValid = domain.trim() !== "" && isValidDomain(domain.trim());
  const canContinueWelcome = fullName.trim() && companyName.trim() && domainValid;
  const canContinueProduct = productDesc.trim().length >= 10 && challenge;
  const canContinueICP = industries.length > 0 && companySizes.length > 0 && targetSeniorities.length > 0;

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={stepHeadingId}
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", background: "var(--color-bg-page)" }}
    >
      {/* O10 — polite live region for step transitions; visually hidden
          but read by screen readers. `key` retired in favour of textContent
          mutation so React doesn't replace the node and reset the polite
          announcement queue. */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />

      {/* ── Header ── */}
      <div className="w-full max-w-lg px-4 shrink-0 mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <h1 className="gradient-text text-lg font-bold tracking-tight">Elevay</h1>
          {step !== "ready" && step !== "building" && (
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>~{Math.max(1, 5 - stepIndex + 1)} min left</span>
          )}
        </div>
        {step !== "ready" && <ProgressBar current={stepIndex} total={7} />}
        {showResumeBanner && (
          <div
            role="status"
            className="mt-2 flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px]"
            style={{
              background: "var(--color-accent-subtle, rgba(99,102,241,0.08))",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <span>Welcome back — picking up where you left off.</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setShowResumeBanner(false)}
              className="opacity-60 hover:opacity-100"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* ── Card — flex-1 fills all remaining space ── */}
      <div className="w-full max-w-lg mx-4 flex-1 min-h-0 flex flex-col overflow-hidden"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", borderRadius: "12px", boxShadow: "var(--shadow-dialog)", padding: "16px 20px", marginBottom: "16px" }}>

        {/* ════ STEP 2 : CONNECT ════ */}
        {step === "connect" && (
          <div className="flex flex-col h-full">
            <StepHeader headingId={stepHeadingId} icon={<Mail size={15} />} title="Connect your email & calendar" subtitle="We sync your conversations and meetings to keep full context on every deal." />

            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                {[
                  { icon: <Mail size={12} />, t: "Email conversations", d: "Auto-create contacts from your inbox" },
                  { icon: <Calendar size={12} />, t: "Calendar & meetings", d: "Prep, summaries, and follow-ups" },
                  { icon: <MessageSquare size={12} />, t: "Full context", d: "Every interaction searchable" },
                  { icon: <Zap size={12} />, t: "Personalized outreach", d: "Emails reference your actual history" },
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
            <StepHeader headingId={stepHeadingId} icon={<Shield size={15} />} title="Control what gets synced" subtitle="You can change these anytime in Settings." />

            {/* Content — overflow-y-auto keeps the footer pinned even on
                short viewports where the four sections would otherwise
                overflow the card and clip the StepFooter. */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5">
              {/* Record creation — 3-col segmented (was stacked rows) */}
              <div>
                <span className={label} style={labelStyle}>Record creation</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {CREATION_OPTIONS.map((opt) => {
                    const active = contactCreation === opt.value;
                    return (
                      <button key={opt.value} type="button" onClick={() => setContactCreation(opt.value)}
                        className="rounded-lg py-1 px-1.5 text-center transition-all"
                        style={{ background: active ? "rgba(44,107,237,.06)" : "var(--color-bg-page)", border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}` }}>
                        <span className="flex items-center justify-center gap-1 leading-tight">
                          <span style={{ color: active ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>{opt.icon}</span>
                          <span className="text-[11px] font-medium" style={{ color: active ? "var(--color-accent)" : "var(--color-text-primary)" }}>{opt.label}</span>
                        </span>
                        <span className="block text-[10px] leading-tight" style={{ color: "var(--color-text-tertiary)" }}>{opt.short}</span>
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
                        <span className="text-[11px] font-medium block leading-tight" style={{ color: active ? "var(--color-accent)" : "var(--color-text-primary)" }}>{opt.label}</span>
                        <span className="block text-[10px] leading-tight" style={{ color: "var(--color-text-tertiary)" }}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* O7 — Visibility default — 3-col segmented (was stacked rows) */}
              <div>
                <span className={label} style={labelStyle}>Default visibility</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {VISIBILITY_OPTIONS.map((opt) => {
                    const active = defaultVisibility === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDefaultVisibility(opt.value)}
                        className="rounded-lg py-1 px-1.5 text-center transition-all"
                        style={{
                          background: active ? "rgba(44,107,237,.06)" : "var(--color-bg-page)",
                          border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
                        }}
                      >
                        <span className="flex items-center justify-center gap-1 leading-tight">
                          <span style={{ color: active ? "var(--color-accent)" : "var(--color-text-tertiary)" }}>{opt.icon}</span>
                          <span className="text-[11px] font-medium" style={{ color: active ? "var(--color-accent)" : "var(--color-text-primary)" }}>
                            {opt.label}
                          </span>
                        </span>
                        <span className="block text-[10px] leading-tight" style={{ color: "var(--color-text-tertiary)" }}>
                          {opt.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Do not track */}
              <div>
                <span className={label} style={labelStyle}>Do not track</span>
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
                  placeholder={`Add domain (${DEFAULT_IGNORED_DOMAINS.length} personal providers already excluded)`} className={inputCls} style={inputStyle} />
              </div>
            </div>

            <StepFooter onBack={() => setStep("connect")} onNext={handlePrivacyContinue} loading={saving} />
          </div>
        )}

        {/* ════ STEP 1 : WELCOME / PROFILE ════ */}
        {step === "welcome" && (
          <div className="flex flex-col h-full">
            <StepHeader headingId={stepHeadingId} icon={<Globe size={15} />} title="Tell us about you" subtitle="Your name, company, and website so Elevay can tailor every action to your context." />

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
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>We&apos;ll analyze your website to pre-fill your ideal customer profile</p>
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
            <StepHeader headingId={stepHeadingId} icon={<Target size={15} />} title="What do you sell?" subtitle={`We'll use this to write relevant emails and coach your pitch.${analyzingWebsite ? " Analyzing your site…" : ""}`} />

            <div className="flex-1 space-y-3 min-h-0 overflow-y-auto">
              {/* First wow effect — streamed narrative of what the
                  agent understood about the company. Rendered as a
                  subtle inset card above the form so the founder
                  reads it while answering product questions. */}
              {(narrative || narrativeStreaming) && (
                <div
                  className="rounded-lg p-2.5"
                  style={{
                    background: "var(--color-accent-soft)",
                    border: "1px solid var(--color-accent)",
                  }}
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap size={10} style={{ color: "var(--color-accent)" }} />
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--color-accent)" }}
                    >
                      What we understand about you
                    </span>
                  </div>
                  <p
                    className="text-[11px] leading-relaxed whitespace-pre-wrap"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {narrative || "Reading your site…"}
                    {narrativeStreaming && (
                      <span
                        className="inline-block ml-0.5"
                        style={{
                          width: "2px",
                          height: "12px",
                          background: "var(--color-accent)",
                          verticalAlign: "-2px",
                          animation: "signal-shimmer 0.8s ease-in-out infinite",
                        }}
                      />
                    )}
                  </p>
                </div>
              )}

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
              headingId={stepHeadingId}
              icon={<Target size={15} />}
              title="Who do you sell to?"
              subtitle={websiteAnalysis
                ? `We pre-filled this from your website. Adjust anything that doesn't fit.`
                : `We'll find companies that match${emailConnected ? " and flag warm ones" : ""}.`}
            />

            {buildError && (
              <div
                role="alert"
                className="mb-2 flex items-start gap-2 rounded-lg p-2 text-[11px]"
                style={{ background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}
              >
                <span className="flex-1">
                  <strong>Build failed.</strong> {buildError}
                </span>
                <button
                  type="button"
                  onClick={handleBuildTAM}
                  disabled={!canContinueICP}
                  className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: "#ef4444",
                    color: "white",
                    cursor: canContinueICP ? "pointer" : "not-allowed",
                    opacity: canContinueICP ? 1 : 0.6,
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Second wow effect — live TAM estimate that updates as
                the user toggles ICP filters. Uses the background
                debounced fetch wired above; "≈ 12,400 companies" is
                the founder's first visible proof that the agent
                actually has a database to search. */}
            {(industries.length > 0 ||
              companySizes.length > 0 ||
              geographies.length > 0) && (
              <div
                className="mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border-default)",
                }}
                aria-live="polite"
              >
                <Target size={11} style={{ color: "var(--color-accent)" }} />
                <span
                  className="text-[11px]"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Addressable market
                </span>
                <span
                  className="ml-auto text-[13px] font-semibold"
                  style={{
                    color: "var(--color-text-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {tamEstimate.loading && tamEstimate.total === null ? (
                    <Loader2
                      size={11}
                      className="animate-spin"
                      style={{ color: "var(--color-text-tertiary)" }}
                    />
                  ) : tamEstimate.total === null ? (
                    "—"
                  ) : tamEstimate.capped ? (
                    "100,000+ companies"
                  ) : (
                    `≈ ${tamEstimate.total.toLocaleString()} companies`
                  )}
                  {tamEstimate.loading && tamEstimate.total !== null && (
                    <Loader2
                      size={10}
                      className="inline ml-1 animate-spin"
                      style={{ color: "var(--color-text-tertiary)" }}
                    />
                  )}
                </span>
              </div>
            )}

            {/* Confidence gaps — targeted questions when AI needs clarification */}
            {websiteAnalysis?.confidenceGaps && websiteAnalysis.confidenceGaps.length > 0 && (
              <div className="mb-3 rounded-lg p-3" style={{ background: "var(--color-accent-soft)", border: "1px solid var(--color-accent)20" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Target size={13} style={{ color: "var(--color-accent)" }} />
                  <span className="text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
                    Quick questions to refine your targeting
                  </span>
                </div>
                <div className="space-y-2">
                  {websiteAnalysis.confidenceGaps.map((gap, i) => (
                    <div key={i} className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      <span style={{ fontWeight: 500 }}>{gap.question}</span>
                      <span className="ml-1" style={{ color: "var(--color-text-tertiary)" }}>
                        (current guess: {gap.currentGuess})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            { label: "Validating company data...", icon: <Target size={13} /> },
            { label: "Enriching company profiles...", icon: <Building2 size={13} /> },
            { label: emailConnected ? "Cross-referencing your inbox..." : "Scoring against your criteria...", icon: emailConnected ? <Mail size={13} /> : <Zap size={13} /> },
            { label: `Found ${tamProgress.found} companies`, icon: <Check size={13} /> },
            { label: "Building your pipeline...", icon: <Check size={13} /> },
          ];
          return (
            <div className="flex flex-col h-full">
              <div className="text-center shrink-0 mb-4">
                <h2 id={stepHeadingId} className="text-[15px] font-semibold mb-0.5" style={{ color: "var(--color-text-primary)" }}>Building your pipeline...</h2>
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
                          <CompanyLogo domain={c.domain} name={c.name} size={16} />
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
              <h2 id={stepHeadingId} className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Your sales engine is ready</h2>
            </div>

            <div className="flex-1 space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 w-full">
                <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{tamProgress.found}</span>
                  <span className="block text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>companies found</span>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{contactsFound}</span>
                  <span className="block text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>contacts identified</span>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  {emailConnected ? (
                    <>
                      <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                        {emailIntelligence ? emailIntelligence.icpMatches : <Loader2 size={16} className="inline animate-spin" style={{ color: "var(--color-accent)" }} />}
                      </span>
                      <span className="block text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {emailIntelligence ? "in your inbox" : "analyzing inbox..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-[18px] font-bold" style={{ color: "var(--color-text-tertiary)" }}>-</span>
                      <span className="block text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>connect email</span>
                    </>
                  )}
                </div>
              </div>

              {/* Top contacts preview */}
              {topContacts.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <span className="text-[10px] font-medium uppercase tracking-wide block mb-2" style={{ color: "var(--color-text-tertiary)" }}>Top decision-makers found</span>
                  <div className="space-y-1.5">
                    {topContacts.map((c) => (
                      <div key={c.email} className="flex items-center gap-2">
                        <Users size={14} style={{ color: "var(--color-text-tertiary)" }} />
                        <span className="text-[12px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                        {c.title && <span className="text-[10px] ml-auto shrink-0 truncate max-w-[120px]" style={{ color: "var(--color-text-tertiary)" }}>{c.title}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top companies preview */}
              {topCompanies.length > 0 && topContacts.length === 0 && (
                <div className="rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <span className="text-[10px] font-medium uppercase tracking-wide block mb-2" style={{ color: "var(--color-text-tertiary)" }}>Top companies</span>
                  <div className="space-y-1.5">
                    {topCompanies.map((c) => (
                      <div key={c.domain || c.name} className="flex items-center gap-2">
                        <CompanyLogo domain={c.domain} name={c.name} size={20} />
                        <span className="text-[12px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{c.name}</span>
                        {c.industry && <span className="text-[10px] ml-auto shrink-0" style={{ color: "var(--color-text-tertiary)" }}>{c.industry}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* O8 — Quick wins panel (5 high-leverage actions to start
                   activation immediately rather than dropping users on a
                   blank dashboard). Kept dense on purpose — this is the
                   last screen before the app, not a marketing surface. */}
              <div className="rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                <span className="text-[10px] font-medium uppercase tracking-wide block mb-2" style={{ color: "var(--color-text-tertiary)" }}>
                  Quick wins to get started
                </span>
                <div className="space-y-1">
                  {[
                    { href: "/accounts?sort=score", icon: <Target size={12} />, label: "Review your top accounts" },
                    { href: "/sequences", icon: <Send size={12} />, label: "Launch your first sequence" },
                    { href: "/settings/mailboxes", icon: <Inbox size={12} />, label: "Connect a sending mailbox" },
                    { href: "/settings/data-model", icon: <Database size={12} />, label: "Customize your data model" },
                    { href: "/chat", icon: <MessageSquare size={12} />, label: "Ask Elevay anything" },
                  ].map((q) => (
                    <a
                      key={q.href}
                      href={q.href}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] hover:opacity-80 transition-opacity"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      <span style={{ color: "var(--color-accent)" }}>{q.icon}</span>
                      <span>{q.label}</span>
                      <ArrowRight size={11} className="ml-auto shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="shrink-0 pt-3 mt-auto">
              <button onClick={onComplete} className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold text-white gradient-brand">
                Go to your engine <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
