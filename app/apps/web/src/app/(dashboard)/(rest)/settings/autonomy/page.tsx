"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { Shield, Zap, Brain, Rocket, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { LEVEL_BEHAVIOR } from "@/lib/guardrails/level-behavior";

type AutonomyLevel = "copilot" | "guided" | "autonomous" | "strategic";

interface TrustScoreState {
  overall: number;
  trend: "rising" | "stable" | "falling";
  actionsCount: number;
  approvalsWithoutEdit: number;
  rejections: number;
  suggestedLevel: AutonomyLevel;
  readyForUpgrade: boolean;
  shouldDowngrade: boolean;
}

interface ThresholdInfo {
  static: number;
  current: number;
  source: "static" | "learned" | "relaxed";
  excluded: boolean;
}

// CLE-16 — the level copy is the SSOT LEVEL_BEHAVIOR map (the copy-match test
// asserts equality), so marketing copy can never drift from real behaviour.
// Icons stay here (presentational only).
const LEVEL_ICONS: Record<AutonomyLevel, typeof Shield> = {
  copilot: Shield,
  guided: Zap,
  autonomous: Brain,
  strategic: Rocket,
};

const LEVELS: { id: AutonomyLevel; label: string; description: string; icon: typeof Shield }[] = (
  ["copilot", "guided", "autonomous", "strategic"] as AutonomyLevel[]
).map((id) => ({
  id,
  label: LEVEL_BEHAVIOR[id].label,
  description: LEVEL_BEHAVIOR[id].behavior,
  icon: LEVEL_ICONS[id],
}));

// Human label per GuardedAction for the threshold block.
const ACTION_LABELS: Record<string, string> = {
  "email-send": "Sending an email",
  "email-reply": "Replying to an email",
  "contact-create": "Creating a contact",
  "contact-update": "Updating a contact",
  "deal-stage-change": "Changing a deal stage",
  "task-create": "Creating a task",
  "sequence-enrollment": "Enrolling in a sequence",
};

export default function AutonomySettingsPage() {
  const { toast } = useToast();
  const [level, setLevel] = useState<AutonomyLevel>("copilot");
  const [trustScore, setTrustScore] = useState<TrustScoreState | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, ThresholdInfo> | null>(null);
  const [guardrails, setGuardrails] = useState({
    maxEmailsPerDay: 40,
    maxNewProspectsPerWeek: 25,
    maxEmailsPerProspect: 5,
    neverContact: [] as string[],
  });
  const [neverContactInput, setNeverContactInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/autonomy");
      if (res.ok) {
        const data = await res.json();
        setLevel(data.config.level);
        if (data.config.guardrails) {
          setGuardrails({
            maxEmailsPerDay: data.config.guardrails.maxEmailsPerDay ?? 40,
            maxNewProspectsPerWeek: data.config.guardrails.maxNewProspectsPerWeek ?? 25,
            maxEmailsPerProspect: data.config.guardrails.maxEmailsPerProspect ?? 5,
            neverContact: data.config.guardrails.neverContact ?? [],
          });
        }
        setTrustScore(data.trustScore);
        setThresholds(data.thresholds ?? null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/autonomy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, guardrails }),
      });
      if (res.ok) {
        toast("Autonomy settings saved", "success");
        fetchConfig();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to save", "error");
      }
    } catch {
      toast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  function addNeverContact() {
    const domain = neverContactInput.trim().toLowerCase();
    if (domain && !guardrails.neverContact.includes(domain)) {
      setGuardrails({ ...guardrails, neverContact: [...guardrails.neverContact, domain] });
      setNeverContactInput("");
    }
  }

  function removeNeverContact(domain: string) {
    setGuardrails({ ...guardrails, neverContact: guardrails.neverContact.filter((d) => d !== domain) });
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 animate-pulse rounded" style={{ background: "var(--color-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <PageHeader title="Autonomy & Guardrails" subtitle="Control how much the campaign engine acts on its own" />

      {/* Trust Score */}
      {trustScore && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Trust Score</p>
                <p className="text-[28px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {Math.round(trustScore.overall)}/100
                </p>
                <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Based on {trustScore.actionsCount} actions, {trustScore.approvalsWithoutEdit} approved without edits
                </p>
              </div>
              <div className="flex items-center gap-1">
                {trustScore.trend === "rising" && <TrendingUp size={16} className="text-green-500" />}
                {trustScore.trend === "falling" && <TrendingDown size={16} className="text-red-500" />}
                {trustScore.trend === "stable" && <Minus size={16} className="text-gray-400" />}
                <span className="text-[11px] capitalize" style={{ color: "var(--color-text-secondary)" }}>
                  {trustScore.trend}
                </span>
              </div>
            </div>
            {trustScore.readyForUpgrade && level !== trustScore.suggestedLevel && (
              <div className="mt-3 rounded-lg p-3" style={{ background: "var(--color-bg-hover)" }}>
                <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  Your approval rate suggests you could upgrade to <strong>{trustScore.suggestedLevel}</strong> mode.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Level Selection */}
      <Card>
        <CardBody>
          <p className="text-[13px] font-medium mb-3" style={{ color: "var(--color-text-primary)" }}>Autonomy Level</p>
          <div className="grid grid-cols-2 gap-2">
            {LEVELS.map((l) => {
              const Icon = l.icon;
              const isSelected = level === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevel(l.id)}
                  className="flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-all"
                  style={{
                    background: isSelected ? "var(--color-accent)" : "var(--color-bg-page)",
                    color: isSelected ? "white" : "var(--color-text-primary)",
                    border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border-default)"}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} />
                    <span className="text-[12px] font-medium">{l.label}</span>
                  </div>
                  <span className="text-[11px]" style={{ opacity: 0.8 }}>{l.description}</span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Learned thresholds (CLE-16 §5.3 observability) — current vs static
          confidence bar per action, so the founder can see WHY the agent asks
          more or less. Secondary styling. */}
      {thresholds && (
        <Card>
          <CardBody>
            <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Confidence thresholds
            </p>
            <p className="text-[11px] mb-3" style={{ color: "var(--color-text-tertiary)" }}>
              How confident the agent must be to act without asking. Lowers as it earns trust on a kind of
              action, rises if it gets one wrong. Sends, irreversible changes, and anything that costs money
              always wait for you.
            </p>
            <div className="space-y-1.5">
              {Object.entries(thresholds).map(([action, info]) => {
                const pct = (n: number) => `${Math.round(n * 100)}%`;
                const movedFromStatic = !info.excluded && info.current !== info.static;
                return (
                  <div key={action} className="flex items-center justify-between">
                    <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                      {ACTION_LABELS[action] ?? action}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {info.excluded ? (
                        "always asks"
                      ) : (
                        <>
                          asks above {pct(info.current)}
                          {movedFromStatic && (
                            <span style={{ opacity: 0.7 }}>
                              {" "}
                              ({info.source}, was {pct(info.static)})
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Guardrails */}
      <Card>
        <CardBody>
          <p className="text-[13px] font-medium mb-3" style={{ color: "var(--color-text-primary)" }}>
            Guardrails (apply at all levels)
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Max emails per day</label>
              <input
                type="number"
                min={0}
                max={500}
                value={guardrails.maxEmailsPerDay}
                onChange={(e) => setGuardrails({ ...guardrails, maxEmailsPerDay: Number(e.target.value) })}
                className="w-20 rounded-md px-2 py-1 text-[12px] text-right"
                style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Max new prospects per week</label>
              <input
                type="number"
                min={0}
                max={500}
                value={guardrails.maxNewProspectsPerWeek}
                onChange={(e) => setGuardrails({ ...guardrails, maxNewProspectsPerWeek: Number(e.target.value) })}
                className="w-20 rounded-md px-2 py-1 text-[12px] text-right"
                style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Max emails per prospect</label>
              <input
                type="number"
                min={1}
                max={20}
                value={guardrails.maxEmailsPerProspect}
                onChange={(e) => setGuardrails({ ...guardrails, maxEmailsPerProspect: Number(e.target.value) })}
                className="w-20 rounded-md px-2 py-1 text-[12px] text-right"
                style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
              />
            </div>

            {/* Never Contact */}
            <div>
              <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Never contact (domains)</label>
              <div className="mt-1 flex gap-1">
                <input
                  type="text"
                  value={neverContactInput}
                  onChange={(e) => setNeverContactInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNeverContact())}
                  placeholder="competitor.com"
                  className="flex-1 rounded-md px-2 py-1 text-[12px]"
                  style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                />
                <Button size="sm" onClick={addNeverContact}>Add</Button>
              </div>
              {guardrails.neverContact.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {guardrails.neverContact.map((domain) => (
                    <span
                      key={domain}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                      style={{ background: "var(--color-bg-hover)", color: "var(--color-text-primary)" }}
                    >
                      {domain}
                      <button type="button" onClick={() => removeNeverContact(domain)} className="hover:opacity-70">x</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
