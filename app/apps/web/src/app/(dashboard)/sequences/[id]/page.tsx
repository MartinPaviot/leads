"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignWizard } from "@/components/campaign-wizard";
import {
  Zap, ArrowLeft, Mail, Clock, Users, Play, Pause,
  ChevronDown, ChevronRight, Sparkles, Loader2, FileText, Send,
} from "lucide-react";

interface Step {
  id: string;
  stepNumber: number;
  subjectTemplate: string;
  bodyTemplate: string;
  delayDays: number;
}

interface Enrollment {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  status: string;
  currentStep: number;
  enrolledAt: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  campaignConfig?: {
    status: string;
    stats?: { companiesSelected?: number; contactsFound?: number; emailsDrafted?: number };
  };
}

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // Campaign status polling
  const [campaignStatus, setCampaignStatus] = useState<string>("idle");
  const [campaignStats, setCampaignStats] = useState<Record<string, number>>({});
  const [emailStats, setEmailStats] = useState<Record<string, number>>({});

  const fetchSequence = useCallback(async () => {
    try {
      const res = await fetch(`/api/sequences/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSequence(data.sequence);
        setSteps(data.steps || []);
        setEnrollments(data.enrollments || []);
        const config = data.sequence?.campaignConfig;
        if (config) {
          setCampaignStatus(config.status || "idle");
          setCampaignStats(config.stats || {});
        }
        // Auto-open wizard if campaign is draft and not yet prepared
        const seq = data.sequence;
        const hasConfig = config && config.status && config.status !== "idle";
        if (seq && seq.status === "draft" && !hasConfig && (data.steps || []).length === 0) {
          setShowCampaignWizard(true);
        }
      }
    } catch { /* */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchSequence(); }, [fetchSequence]);

  // Poll campaign status when preparing
  useEffect(() => {
    if (campaignStatus !== "preparing") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/campaigns/${id}/status`);
      if (res.ok) {
        const data = await res.json();
        setCampaignStatus(data.status);
        setCampaignStats(data.stats || {});
        setEmailStats(data.emailStats || {});
        if (data.status === "ready" || data.status === "launched") {
          clearInterval(interval);
          fetchSequence();
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [campaignStatus, id, fetchSequence]);

  async function toggleStatus() {
    if (!sequence) return;
    setUpdatingStatus(true);
    const newStatus = sequence.status === "active" ? "paused" : "active";
    try {
      await fetch(`/api/sequences/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchSequence();
    } catch { /* */ }
    setUpdatingStatus(false);
  }

  async function launchCampaign() {
    try {
      const res = await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
      if (res.ok) {
        setCampaignStatus("launched");
        fetchSequence();
      }
    } catch { /* */ }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--color-text-tertiary)" }} /></div>;
  if (!sequence) return <div className="p-6 text-sm" style={{ color: "var(--color-error)" }}>Sequence not found</div>;

  const statusVariant: Record<string, "success" | "warning" | "neutral" | "info"> = {
    active: "success", paused: "warning", draft: "neutral", archived: "neutral",
  };

  const totalDelay = steps.reduce((sum, s) => sum + s.delayDays, 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={sequence.name}
        subtitle={sequence.description || undefined}
      >
        <Badge variant={statusVariant[sequence.status] || "neutral"} size="md">
          {sequence.status}
        </Badge>
        {sequence.status !== "active" && campaignStatus !== "launched" && (
          <Button variant="gradient" size="sm" onClick={() => setShowCampaignWizard(true)}>
            <Zap size={14} /> {steps.length > 0 ? "Continue Campaign" : "Configure Campaign"}
          </Button>
        )}
        {(sequence.status === "active" || sequence.status === "paused") && (
          <Button variant="outline" size="sm" onClick={toggleStatus} loading={updatingStatus}>
            {sequence.status === "active" ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
          </Button>
        )}
      </PageHeader>

      {showCampaignWizard && (
        <CampaignWizard
          sequenceId={id}
          onClose={() => setShowCampaignWizard(false)}
          onComplete={() => {
            setShowCampaignWizard(false);
            setCampaignStatus("launched");
            fetchSequence();
          }}
        />
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8">

          {/* ── STEP TIMELINE ── */}
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-tertiary)" }}>
              Sequence ({steps.length} step{steps.length !== 1 ? "s" : ""} · {totalDelay} days)
            </h2>

            {steps.length === 0 ? (
              <Card>
                <CardBody>
                  <div className="text-center py-6">
                    <Mail size={24} className="mx-auto mb-2" style={{ color: "var(--color-text-muted)" }} />
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>No steps yet</p>
                    <p className="text-[12px] mt-1" style={{ color: "var(--color-text-tertiary)" }}>Launch a campaign to auto-generate personalized email steps.</p>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <div className="relative space-y-0" style={{ paddingLeft: 14 }}>
                {/* Continuous vertical connector line */}
                {steps.length > 1 && (
                  <div className="absolute" style={{ left: 14, top: 20, bottom: 20, width: 2, background: "var(--color-border-default)", borderRadius: 1 }} />
                )}
                {steps.map((step, i) => {
                  const isExpanded = expandedStep === i;
                  return (
                    <div key={step.id} className="relative">
                      {/* Step dot on the timeline */}
                      <div className="absolute" style={{ left: -7, top: 18, width: 8, height: 8, borderRadius: "50%", background: isExpanded ? "var(--color-accent)" : "var(--color-border-moderate)", zIndex: 1 }} />
                      {/* Delay indicator */}
                      {i > 0 && (
                        <div className="flex items-center gap-2 py-2 pl-6">
                          <Clock size={11} style={{ color: "var(--color-text-muted)" }} />
                          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            Wait {step.delayDays} day{step.delayDays !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}

                      {/* Step card */}
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : i)}
                        className="w-full text-left rounded-lg p-4 transition-all"
                        style={{
                          background: "var(--color-bg-card)",
                          border: `1px solid ${isExpanded ? "var(--color-accent)" : "var(--color-border-default)"}`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                            style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                            {step.stepNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                              {step.subjectTemplate}
                            </p>
                          </div>
                          {isExpanded ? <ChevronDown size={14} style={{ color: "var(--color-text-muted)" }} /> : <ChevronRight size={14} style={{ color: "var(--color-text-muted)" }} />}
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pl-10">
                            <div className="rounded-md p-3 text-[12px] leading-relaxed whitespace-pre-wrap"
                              style={{ background: "var(--color-bg-page)", color: "var(--color-text-secondary)" }}>
                              {step.bodyTemplate}
                            </div>
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── CAMPAIGN STATUS ── */}
          {(campaignStatus === "preparing" || campaignStatus === "ready" || campaignStatus === "launched") && (
            <section>
              <h2 className="text-[12px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-tertiary)" }}>
                Campaign
              </h2>

              <Card>
                <CardBody>
                  {campaignStatus === "preparing" && (
                    <div className="flex items-center gap-3">
                      <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-accent)" }} />
                      <div>
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>Preparing campaign...</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                          {campaignStats.companiesSelected || 0} companies · {campaignStats.contactsFound || 0} contacts · {campaignStats.emailsDrafted || 0} emails drafted
                        </p>
                      </div>
                    </div>
                  )}

                  {campaignStatus === "ready" && (
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>Campaign ready</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                            {campaignStats.companiesSelected || 0} companies · {campaignStats.contactsFound || 0} contacts · {campaignStats.emailsDrafted || 0} emails drafted
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => router.push(`/sequences/${id}/review`)}>
                            <FileText size={13} /> Review emails
                          </Button>
                          <Button variant="gradient" size="sm" onClick={launchCampaign}>
                            <Send size={13} /> Launch
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {campaignStatus === "launched" && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="success" size="sm">Live</Badge>
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>Campaign launched</p>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: "Queued", value: emailStats.queued || 0 },
                          { label: "Sent", value: emailStats.sent || 0 },
                          { label: "Opened", value: emailStats.opened || 0 },
                          { label: "Replied", value: emailStats.replied || 0 },
                        ].map((stat) => (
                          <div key={stat.label} className="rounded-lg p-3 text-center" style={{ background: "var(--color-bg-page)" }}>
                            <p className="text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{stat.value}</p>
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>{stat.label}</p>
                          </div>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="mt-3" onClick={() => router.push(`/sequences/${id}/review`)}>
                        <FileText size={13} /> View all emails
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            </section>
          )}

          {/* ── ENROLLED CONTACTS ── */}
          {enrollments.length > 0 && (
            <section>
              <h2 className="text-[12px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-tertiary)" }}>
                Enrolled ({enrollments.length})
              </h2>
              <Card>
                <CardBody className="p-0">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                        <th className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Contact</th>
                        <th className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Email</th>
                        <th className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Step</th>
                        <th className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.slice(0, 20).map((e) => (
                        <tr key={e.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                          <td className="px-4 py-2.5" style={{ color: "var(--color-text-primary)" }}>{e.contactName}</td>
                          <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>{e.contactEmail || "—"}</td>
                          <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>{e.currentStep}/{steps.length}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={e.status === "active" ? "success" : e.status === "completed" || e.status === "replied" ? "info" : "neutral"} size="sm">
                              {e.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {enrollments.length > 20 && (
                    <p className="px-4 py-2 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      +{enrollments.length - 20} more contacts
                    </p>
                  )}
                </CardBody>
              </Card>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
