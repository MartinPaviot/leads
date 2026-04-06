"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  Target,
  Users,
  Mail,
  Zap,
  X,
  Building2,
  Sparkles,
} from "lucide-react";
import {
  INDUSTRIES,
  COMPANY_SIZES,
  GEOGRAPHIES,
  DECISION_MAKER_ROLES,
} from "@/lib/icp-constants";

const pill =
  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-150 cursor-pointer select-none";

interface Step {
  id: string;
  stepNumber: number;
  subjectTemplate: string;
  bodyTemplate: string;
  delayDays: number;
}

interface CampaignWizardProps {
  sequenceId: string;
  sequenceName: string;
  steps: Step[];
  onClose: () => void;
  onPrepared: () => void;
}

type WizardStep = "segment" | "roles" | "preview" | "confirm";

const WIZARD_STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: "segment", label: "Segment", icon: <Target size={14} /> },
  { key: "roles", label: "Roles", icon: <Users size={14} /> },
  { key: "preview", label: "Sequence", icon: <Mail size={14} /> },
  { key: "confirm", label: "Launch", icon: <Zap size={14} /> },
];

export function CampaignWizard({
  sequenceId,
  sequenceName,
  steps: sequenceSteps,
  onClose,
  onPrepared,
}: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>("segment");

  // Segment filters
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedGeographies, setSelectedGeographies] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [maxCompanies, setMaxCompanies] = useState(50);

  // Role filters
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [maxContactsPerCompany, setMaxContactsPerCompany] = useState(3);

  // Preview data
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [needsEnrichment, setNeedsEnrichment] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Preparation status
  const [preparing, setPreparing] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState<string>("idle");
  const [campaignStats, setCampaignStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch matching company count
  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const params = new URLSearchParams();
      selectedIndustries.forEach((i) => params.append("industry", i));
      selectedSizes.forEach((s) => params.append("size", s));
      selectedGeographies.forEach((g) => params.append("geography", g));
      if (minScore > 0) params.set("minScore", String(minScore));

      const res = await fetch(`/api/campaigns/${sequenceId}/preview?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMatchCount(data.matchingCompanies);
        setNeedsEnrichment(data.needsEnrichment);
      }
    } catch {
      setMatchCount(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [sequenceId, selectedIndustries, selectedSizes, selectedGeographies, minScore]);

  useEffect(() => {
    if (currentStep === "segment") {
      const timer = setTimeout(fetchPreview, 300);
      return () => clearTimeout(timer);
    }
  }, [currentStep, fetchPreview]);

  // Poll campaign status during preparation
  useEffect(() => {
    if (!preparing) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/campaigns/${sequenceId}/status`);
        if (res.ok) {
          const data = await res.json();
          setCampaignStatus(data.status);
          setCampaignStats(data.stats);
          if (data.status === "ready") {
            setPreparing(false);
          } else if (data.status === "idle" && data.stats === null) {
            // Failed
            setPreparing(false);
            setError("Preparation failed. Check logs.");
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [preparing, sequenceId]);

  function toggleItem(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  async function handlePrepare() {
    setError(null);
    setPreparing(true);
    setCampaignStatus("preparing");

    try {
      const res = await fetch("/api/campaigns/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequenceId,
          segmentFilters: {
            industries: selectedIndustries.length ? selectedIndustries : undefined,
            sizes: selectedSizes.length ? selectedSizes : undefined,
            geographies: selectedGeographies.length ? selectedGeographies : undefined,
            minScore: minScore > 0 ? minScore : undefined,
          },
          targetRoles: selectedRoles,
          maxCompanies,
          maxContactsPerCompany,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start preparation");
        setPreparing(false);
      }
    } catch {
      setError("Network error");
      setPreparing(false);
    }
  }

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === currentStep);
  const canGoNext = stepIndex < WIZARD_STEPS.length - 1;
  const canGoBack = stepIndex > 0;

  const estimatedContacts = Math.min(matchCount || 0, maxCompanies) * maxContactsPerCompany;
  const estimatedCredits = (needsEnrichment > 0 ? Math.min(needsEnrichment, maxCompanies) : 0) + estimatedContacts;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.4)" }}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col"
        style={{ background: "var(--color-bg-surface)", borderLeft: "1px solid var(--color-border-default)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Launch Campaign
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{sequenceName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step indicators */}
        <div
          className="flex items-center gap-1 px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          {WIZARD_STEPS.map((ws, i) => {
            const active = ws.key === currentStep;
            const completed = i < stepIndex;
            return (
              <div key={ws.key} className="flex items-center gap-1">
                {i > 0 && (
                  <div
                    className="h-px w-4"
                    style={{
                      background: completed ? "var(--color-accent)" : "var(--color-border-default)",
                    }}
                  />
                )}
                <div
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    background: active
                      ? "var(--color-accent)"
                      : completed
                        ? "rgba(var(--color-accent-rgb, 99,102,241), 0.15)"
                        : "var(--color-bg-page)",
                    color: active ? "white" : completed ? "var(--color-accent)" : "var(--color-text-tertiary)",
                  }}
                >
                  {completed ? <Check size={10} /> : ws.icon}
                  <span>{ws.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* Step 1: Segment */}
          {currentStep === "segment" && (
            <>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Industries
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-auto">
                  {INDUSTRIES.slice(0, 40).map((ind) => {
                    const active = selectedIndustries.includes(ind);
                    return (
                      <button
                        key={ind}
                        onClick={() => toggleItem(selectedIndustries, setSelectedIndustries, ind)}
                        className={pill}
                        style={{
                          background: active ? "var(--color-accent)" : "var(--color-bg-page)",
                          color: active ? "white" : "var(--color-text-secondary)",
                          border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
                        }}
                      >
                        {ind}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Company Size
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COMPANY_SIZES.map((size) => {
                    const active = selectedSizes.includes(size);
                    return (
                      <button
                        key={size}
                        onClick={() => toggleItem(selectedSizes, setSelectedSizes, size)}
                        className={pill}
                        style={{
                          background: active ? "var(--color-accent)" : "var(--color-bg-page)",
                          color: active ? "white" : "var(--color-text-secondary)",
                          border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
                        }}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Geography
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-28 overflow-auto">
                  {GEOGRAPHIES.slice(0, 30).map((geo) => {
                    const active = selectedGeographies.includes(geo);
                    return (
                      <button
                        key={geo}
                        onClick={() => toggleItem(selectedGeographies, setSelectedGeographies, geo)}
                        className={pill}
                        style={{
                          background: active ? "var(--color-accent)" : "var(--color-bg-page)",
                          color: active ? "white" : "var(--color-text-secondary)",
                          border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
                        }}
                      >
                        {geo}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Max Companies
                  </label>
                  <input
                    type="number"
                    value={maxCompanies}
                    onChange={(e) => setMaxCompanies(Math.min(500, Math.max(1, Number(e.target.value))))}
                    className="mt-1 w-20 rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)]"
                    style={{
                      background: "var(--color-bg-page)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Min Score
                  </label>
                  <input
                    type="number"
                    value={minScore}
                    onChange={(e) => setMinScore(Math.max(0, Number(e.target.value)))}
                    min={0}
                    max={100}
                    className="mt-1 w-20 rounded-lg px-3 py-1.5 text-sm text-[var(--color-text-primary)]"
                    style={{
                      background: "var(--color-bg-page)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  />
                </div>
              </div>

              {/* Live preview */}
              <Card>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <Building2 size={16} className="text-[var(--color-accent)]" />
                    <div>
                      {loadingPreview ? (
                        <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
                          <Loader2 size={12} className="animate-spin" /> Counting...
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {matchCount ?? "—"} companies match
                          </p>
                          {needsEnrichment > 0 && (
                            <p className="text-xs text-[var(--color-text-tertiary)]">
                              {needsEnrichment} need enrichment ({matchCount! - needsEnrichment} already enriched)
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </>
          )}

          {/* Step 2: Roles */}
          {currentStep === "roles" && (
            <>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Target Decision-Makers
                </label>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  Apollo will search for people with these titles at each company
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5 max-h-48 overflow-auto">
                  {DECISION_MAKER_ROLES.map((role) => {
                    const active = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        onClick={() => toggleItem(selectedRoles, setSelectedRoles, role)}
                        className={pill}
                        style={{
                          background: active ? "var(--color-accent)" : "var(--color-bg-page)",
                          color: active ? "white" : "var(--color-text-secondary)",
                          border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
                        }}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Contacts per Company
                </label>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMaxContactsPerCompany(n)}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      style={{
                        background: maxContactsPerCompany === n ? "var(--color-accent)" : "var(--color-bg-page)",
                        color: maxContactsPerCompany === n ? "white" : "var(--color-text-secondary)",
                        border: `1px solid ${maxContactsPerCompany === n ? "var(--color-accent)" : "var(--color-border-default)"}`,
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <Card>
                <CardBody>
                  <div className="flex items-center gap-3">
                    <Users size={16} className="text-[var(--color-accent)]" />
                    <p className="text-sm text-[var(--color-text-primary)]">
                      ~{estimatedContacts} contacts estimated
                      <span className="text-[var(--color-text-tertiary)]">
                        {" "}({Math.min(matchCount || 0, maxCompanies)} companies x {maxContactsPerCompany} contacts)
                      </span>
                    </p>
                  </div>
                </CardBody>
              </Card>
            </>
          )}

          {/* Step 3: Preview Sequence */}
          {currentStep === "preview" && (
            <PreviewSequenceStep
              sequenceSteps={sequenceSteps}
              sequenceId={sequenceId}
            />
          )}

          {/* Step 4: Confirm */}
          {currentStep === "confirm" && (
            <>
              {campaignStatus === "idle" && !preparing && (
                <>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Campaign Summary</h3>
                  <div className="space-y-2">
                    <SummaryRow label="Companies" value={`${Math.min(matchCount || 0, maxCompanies)}`} />
                    <SummaryRow label="Target roles" value={selectedRoles.join(", ") || "All"} />
                    <SummaryRow label="Contacts per company" value={String(maxContactsPerCompany)} />
                    <SummaryRow label="Estimated contacts" value={`~${estimatedContacts}`} />
                    <SummaryRow label="Sequence steps" value={String(sequenceSteps.length)} />
                    <SummaryRow label="Estimated emails" value={`~${estimatedContacts}`} />
                  </div>

                  {estimatedCredits > 0 && (
                    <Card>
                      <CardBody>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          <strong>Apollo credit estimate:</strong> ~{estimatedCredits} credits
                          {needsEnrichment > 0 && ` (${Math.min(needsEnrichment, maxCompanies)} enrich + ${estimatedContacts} people search)`}
                          {needsEnrichment === 0 && ` (${estimatedContacts} people search)`}
                        </p>
                      </CardBody>
                    </Card>
                  )}

                  {error && (
                    <p className="text-xs text-red-400">{error}</p>
                  )}
                </>
              )}

              {(preparing || campaignStatus === "preparing") && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    Preparing campaign...
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Enriching companies, discovering contacts, generating emails
                  </p>
                  {campaignStats && (
                    <div className="space-y-1 text-center">
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {campaignStats.companiesEnriched || 0} enriched,{" "}
                        {campaignStats.contactsFound || 0} contacts,{" "}
                        {campaignStats.emailsDrafted || 0} emails
                      </p>
                    </div>
                  )}
                </div>
              )}

              {campaignStatus === "ready" && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: "rgba(34,197,94,0.1)" }}
                  >
                    <Check size={24} className="text-green-500" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Campaign ready
                  </p>
                  {campaignStats && (
                    <div className="space-y-1 text-center">
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {campaignStats.companiesSelected} companies / {campaignStats.contactsFound} contacts / {campaignStats.emailsDrafted} emails drafted
                      </p>
                    </div>
                  )}
                  <Button
                    variant="gradient"
                    onClick={() => {
                      onPrepared();
                      onClose();
                    }}
                  >
                    Go to Review Queue
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: "1px solid var(--color-border-default)" }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (canGoBack) setCurrentStep(WIZARD_STEPS[stepIndex - 1].key);
              else onClose();
            }}
            disabled={preparing}
          >
            <ArrowLeft size={14} />
            {canGoBack ? "Back" : "Cancel"}
          </Button>

          {currentStep !== "confirm" ? (
            <Button
              variant="solid"
              size="sm"
              onClick={() => canGoNext && setCurrentStep(WIZARD_STEPS[stepIndex + 1].key)}
              disabled={currentStep === "roles" && selectedRoles.length === 0}
            >
              Next
              <ArrowRight size={14} />
            </Button>
          ) : campaignStatus === "idle" && !preparing ? (
            <Button
              variant="gradient"
              size="sm"
              onClick={handlePrepare}
              disabled={!matchCount || matchCount === 0}
            >
              <Zap size={14} />
              Prepare Campaign
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewSequenceStep({
  sequenceSteps,
  sequenceId,
}: {
  sequenceSteps: Step[];
  sequenceId: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<
    Array<{ stepNumber: number; subject: string; body: string; delayDays: number; purpose?: string; signalUsed?: string }>
  >([]);
  const [genMeta, setGenMeta] = useState<{ methodology?: string; signal?: string; reasoning?: string } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const stepsToShow = generatedSteps.length > 0 ? generatedSteps : sequenceSteps;

  async function handleAutoGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: null, contactId: null }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedSteps(data.steps || []);
        setGenMeta({
          methodology: data.methodology?.seniority,
          signal: data.methodology?.signalTitle,
          reasoning: data.reasoning,
        });
      } else {
        const data = await res.json();
        setGenError(data.error || "Generation failed");
      }
    } catch {
      setGenError("Network error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {generatedSteps.length > 0
            ? "AI-generated sequence — review and edit before launching."
            : "Each contact will receive this sequence, AI-personalized per recipient."}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAutoGenerate}
          loading={generating}
          disabled={generating}
        >
          <Sparkles size={12} />
          {generating ? "Generating..." : "Auto-generate with AI"}
        </Button>
      </div>

      {genMeta && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {genMeta.signal && (
            <Badge variant="info" size="sm">Signal: {genMeta.signal}</Badge>
          )}
          {genMeta.methodology && (
            <Badge variant="neutral" size="sm">Seniority: {genMeta.methodology}</Badge>
          )}
        </div>
      )}

      {genMeta?.reasoning && (
        <p className="text-xs text-[var(--color-text-tertiary)] italic mt-1">
          {genMeta.reasoning}
        </p>
      )}

      {genError && <p className="text-xs text-red-400 mt-1">{genError}</p>}

      <div className="space-y-3">
        {stepsToShow.map((step: any) => (
          <Card key={step.id || step.stepNumber}>
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="info" size="sm">Step {step.stepNumber}</Badge>
                  {step.purpose && (
                    <span className="text-[10px] text-[var(--color-accent)]">{step.purpose}</span>
                  )}
                </div>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  {(step.delayDays || 0) > 0
                    ? `Wait ${step.delayDays} day${step.delayDays > 1 ? "s" : ""}`
                    : "Immediate"}
                </span>
              </div>
              {step.signalUsed && (
                <div className="mt-1">
                  <Badge variant="warning" size="sm">{step.signalUsed}</Badge>
                </div>
              )}
              <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
                {step.subjectTemplate || step.subject}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap">
                {step.bodyTemplate || step.body}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between py-1.5 px-1 text-sm"
      style={{ borderBottom: "1px solid var(--color-border-default)" }}
    >
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="font-medium text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}
