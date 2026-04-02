"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, Loader2, Check, Mail } from "lucide-react";

interface OnboardingWizardProps {
  onComplete: () => void;
  hasGoogle: boolean;
}

type Step = "welcome" | "icp" | "building" | "connect" | "done";

const ICP_QUESTIONS = [
  { id: "product", label: "What do you sell?", placeholder: "e.g. AI-powered analytics platform for e-commerce" },
  { id: "buyer", label: "Who buys it?", placeholder: "e.g. VP of Marketing at mid-market DTC brands" },
  { id: "size", label: "What company size?", placeholder: "e.g. 50-500 employees, $5M-$50M revenue" },
  { id: "geography", label: "Where? (optional)", placeholder: "e.g. US and Europe" },
];

export function OnboardingWizard({ onComplete, hasGoogle }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<{ created: number; source: string } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartICP = () => setStep("icp");

  const handleBuildTAM = async () => {
    setStep("building");
    setBuilding(true);
    setError(null);

    const icpText = [
      answers.product && `We sell: ${answers.product}`,
      answers.buyer && `Target buyer: ${answers.buyer}`,
      answers.size && `Company size: ${answers.size}`,
      answers.geography && `Geography: ${answers.geography}`,
    ].filter(Boolean).join(". ");

    try {
      // Build TAM
      const tamRes = await fetch("/api/tam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icp: icpText }),
      });

      if (!tamRes.ok) {
        const data = await tamRes.json();
        throw new Error(data.error || "TAM build failed");
      }

      const tamData = await tamRes.json();
      setBuildResult({ created: tamData.companiesCreated, source: tamData.source });

      // Score all newly created accounts
      setScoring(true);
      const tamStatsRes = await fetch("/api/tam");
      if (tamStatsRes.ok) {
        // Get all company IDs to score
        const accountsRes = await fetch("/api/accounts");
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          const ids = (accountsData.accounts || accountsData || [])
            .map((a: { id: string }) => a.id)
            .slice(0, 20);

          if (ids.length > 0) {
            await fetch("/api/score", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ companyIds: ids }),
            });
          }
        }
      }
      setScoring(false);

      // Embed all companies for RAG
      fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "companies" }),
      }).catch(() => {});

      setStep(hasGoogle ? "done" : "connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build TAM");
      setStep("icp");
    } finally {
      setBuilding(false);
    }
  };

  const handleConnectGoogle = () => {
    // Redirect to Google OAuth sign-in
    window.location.href = "/api/auth/signin/google";
  };

  const handleSkipConnect = () => setStep("done");

  const allAnswered = answers.product && answers.buyer;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          background: "var(--color-bg-surface)",
          border: "0.5px solid var(--color-border-default)",
          borderRadius: "12px",
          padding: "32px",
        }}
      >
        {/* Welcome Step */}
        {step === "welcome" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={20} style={{ color: "var(--color-accent)" }} />
              <h2 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Welcome to LeadSens
              </h2>
            </div>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
              Let&apos;s build your target account list in the next 2 minutes. Tell me about your ideal customer and I&apos;ll find real companies that match.
            </p>
            <button
              onClick={handleStartICP}
              className="flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                background: "var(--color-accent)",
                color: "white",
                borderRadius: "6px",
              }}
            >
              Let&apos;s go <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* ICP Questions Step */}
        {step === "icp" && (
          <div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
              Tell me about your ideal customer
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--color-text-tertiary)" }}>
              I&apos;ll search real company databases to build your target account list.
            </p>

            {error && (
              <div className="mb-4 rounded-md p-3 text-sm" style={{ background: "var(--color-error-soft)", color: "var(--color-error)", border: "0.5px solid var(--color-error)" }}>
                {error}
              </div>
            )}

            <div className="space-y-4">
              {ICP_QUESTIONS.map((q) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                    {q.label}
                  </label>
                  <input
                    type="text"
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder={q.placeholder}
                    className="w-full rounded-md px-3 py-2 text-sm"
                    style={{
                      background: "var(--color-bg-default)",
                      border: "0.5px solid var(--color-border-default)",
                      borderRadius: "6px",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleBuildTAM}
              disabled={!allAnswered}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-opacity"
              style={{
                background: allAnswered ? "var(--color-accent)" : "var(--color-bg-muted)",
                color: allAnswered ? "white" : "var(--color-text-tertiary)",
                borderRadius: "6px",
                cursor: allAnswered ? "pointer" : "not-allowed",
              }}
            >
              Build my target accounts <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Building Step */}
        {step === "building" && (
          <div className="text-center py-8">
            <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: "var(--color-accent)" }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
              {scoring ? "Scoring and ranking accounts..." : "Searching for target accounts..."}
            </h2>
            <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
              {scoring
                ? "Analyzing fit, funding, tech stack, and engagement signals."
                : "Querying Apollo.io for companies matching your ICP. This takes about 30 seconds."
              }
            </p>
          </div>
        )}

        {/* Connect Google Step */}
        {step === "connect" && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Check size={20} style={{ color: "var(--color-success)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {buildResult?.created || 0} accounts added
              </h2>
            </div>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
              Your target accounts are scored and ranked. Now connect Gmail to auto-import your email history and contacts.
            </p>

            <button
              onClick={handleConnectGoogle}
              className="flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-opacity hover:opacity-90 mb-3"
              style={{
                background: "var(--color-accent)",
                color: "white",
                borderRadius: "6px",
              }}
            >
              <Mail size={14} /> Connect Gmail
            </button>
            <button
              onClick={handleSkipConnect}
              className="w-full py-2 text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Done Step */}
        {step === "done" && (
          <div className="text-center py-4">
            <Check size={32} className="mx-auto mb-4" style={{ color: "var(--color-success)" }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
              You&apos;re all set!
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
              {buildResult ? `${buildResult.created} accounts added, scored, and ranked.` : "Your workspace is ready."}
              {hasGoogle ? " Email sync is running in the background." : ""}
            </p>
            <button
              onClick={onComplete}
              className="flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                background: "var(--color-accent)",
                color: "white",
                borderRadius: "6px",
              }}
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
