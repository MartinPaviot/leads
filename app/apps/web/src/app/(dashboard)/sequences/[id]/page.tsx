"use client";

import { useState, useEffect, useCallback, useMemo, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignWizard } from "@/components/campaign-wizard";
import { SequenceDetailSkeleton } from "./_skeleton";
import { DestructiveConfirm } from "@/components/ui/destructive-confirm";
import { useToast } from "@/components/ui/toast";
import { useCan } from "@/components/role-provider";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";
import {
  Zap, ArrowLeft, Mail, Clock, Users, Play, Pause,
  ChevronDown, ChevronRight, Loader2, FileText, Send,
  Edit2, Trash2, BarChart3, Check, X, Download,
} from "lucide-react";

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

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

interface StepAnalytics {
  stepNumber: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  replied: number;
  total: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

interface Analytics {
  sequenceId: string;
  enrollment: Record<string, number>;
  emails: Record<string, number> & { totalOpened: number; totalClicked: number };
  rates: { openRate: number; clickRate: number; bounceRate: number; replyRate: number };
  perStep?: StepAnalytics[];
}

type DetailTab = "steps" | "analytics";

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  // Launching / pausing a campaign drives real sending — sequences:execute
  // (member + admin). Viewers see the sequence read-only.
  const canExecute = useCan("sequences:execute");
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showCampaignWizard, setShowCampaignWizard] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [tab, setTab] = useState<DetailTab>("steps");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepDraft, setStepDraft] = useState<{ subjectTemplate: string; bodyTemplate: string; delayDays: number } | null>(null);
  const [savingStep, setSavingStep] = useState(false);
  const [confirmDeleteStepId, setConfirmDeleteStepId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

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
          // emailStats is otherwise only set by the preparing-poll, which stops
          // on launch — so an already-launched campaign opened fresh showed
          // hardcoded 0 in the Queued/Sent/Opened/Replied tiles. Hydrate them
          // once from the live status endpoint.
          if (config.status === "ready" || config.status === "launched") {
            try {
              const sres = await fetch(`/api/campaigns/${id}/status`);
              if (sres.ok) {
                const sdata = await sres.json();
                if (sdata.emailStats) setEmailStats(sdata.emailStats);
              }
            } catch {
              /* tiles fall back to 0 */
            }
          }
        }
        // Auto-open wizard if campaign is draft and not yet prepared
        const seq = data.sequence;
        const hasConfig = config && config.status && config.status !== "idle";
        if (seq && seq.status === "draft" && !hasConfig && (data.steps || []).length === 0) {
          setShowCampaignWizard(true);
        }
      }
    } catch (e) {
      console.warn("sequence-detail: fetch failed", e);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchSequence(); }, [fetchSequence]);

  // Poll campaign status when preparing
  useEffect(() => {
    if (campaignStatus !== "preparing") return;
    const interval = setInterval(async () => {
      try {
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
      } catch (e) {
        // Transient poll failure — keep polling rather than throwing an
        // unhandled rejection; the next tick re-tries.
        console.warn("sequence-detail: status poll failed", e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [campaignStatus, id, fetchSequence]);

  // CLE-14: the single network body shared by the Pause/Resume button AND the
  // sequences.pause / sequences.resume actions (AC-NODUP — one PUT URL, one place).
  const setSequenceStatus = useCallback(
    async (status: "paused" | "active"): Promise<{ ok: boolean; error?: string }> => {
      setUpdatingStatus(true);
      try {
        const res = await fetch(`/api/sequences/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` };
        }
        await fetchSequence();
        return { ok: true };
      } catch (e) {
        console.warn("sequence-detail: status update failed", e);
        return { ok: false, error: e instanceof Error ? e.message : "network error" };
      } finally {
        setUpdatingStatus(false);
      }
    },
    [id, fetchSequence],
  );

  async function toggleStatus() {
    if (!sequence) return;
    const newStatus = sequence.status === "active" ? "paused" : "active";
    await setSequenceStatus(newStatus);
  }

  async function launchCampaign(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
      if (res.ok) {
        setCampaignStatus("launched");
        fetchSequence();
        return { ok: true };
      }
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` };
    } catch (e) {
      console.warn("sequence-detail: launch failed", e);
      return { ok: false, error: e instanceof Error ? e.message : "network error" };
    }
  }

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/sequences/${id}/analytics`);
      if (res.ok) {
        setAnalytics(await res.json());
      } else {
        toast("Failed to load analytics.", "error");
      }
    } catch (e) {
      console.warn("sequence-detail: analytics fetch failed", e);
      toast("Failed to load analytics.", "error");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (tab === "analytics" && !analytics && !analyticsLoading) {
      fetchAnalytics();
    }
  }, [tab, analytics, analyticsLoading, fetchAnalytics]);

  function startEditStep(step: Step) {
    setEditingStepId(step.id);
    setStepDraft({
      subjectTemplate: step.subjectTemplate,
      bodyTemplate: step.bodyTemplate,
      delayDays: step.delayDays,
    });
  }

  function cancelEditStep() {
    setEditingStepId(null);
    setStepDraft(null);
  }

  // CLE-14: the single PATCH body shared by the Save button AND the
  // sequences.editStep action (AC-NODUP). Sends only the provided fields.
  const saveStepFields = useCallback(
    async (
      stepId: string,
      fields: { subjectTemplate?: string; bodyTemplate?: string; delayDays?: number },
    ): Promise<{ ok: boolean; error?: string }> => {
      const changes: Record<string, unknown> = {};
      if (fields.subjectTemplate !== undefined) changes.subjectTemplate = fields.subjectTemplate;
      if (fields.bodyTemplate !== undefined) changes.bodyTemplate = fields.bodyTemplate;
      if (fields.delayDays !== undefined && fields.delayDays >= 0) changes.delayDays = fields.delayDays;
      if (Object.keys(changes).length === 0) return { ok: true };
      try {
        const res = await fetch(`/api/sequences/${id}/steps/${stepId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` };
        }
        await fetchSequence();
        return { ok: true };
      } catch (e) {
        console.warn("sequence-detail: saveStepFields failed", e);
        return { ok: false, error: e instanceof Error ? e.message : "network error" };
      }
    },
    [id, fetchSequence],
  );

  async function saveStep(step: Step) {
    if (!stepDraft) return;
    const changes: { subjectTemplate?: string; bodyTemplate?: string; delayDays?: number } = {};
    if (stepDraft.subjectTemplate.trim() !== step.subjectTemplate) changes.subjectTemplate = stepDraft.subjectTemplate.trim();
    if (stepDraft.bodyTemplate.trim() !== step.bodyTemplate) changes.bodyTemplate = stepDraft.bodyTemplate.trim();
    if (stepDraft.delayDays !== step.delayDays && stepDraft.delayDays >= 0) changes.delayDays = stepDraft.delayDays;
    if (Object.keys(changes).length === 0) {
      cancelEditStep();
      return;
    }
    setSavingStep(true);
    const r = await saveStepFields(step.id, changes);
    if (r.ok) {
      toast("Step updated.", "success");
      cancelEditStep();
    } else {
      toast(r.error || "Failed to update step.", "error");
    }
    setSavingStep(false);
  }

  async function deleteStep(stepId: string) {
    setConfirmDeleteStepId(null);
    try {
      const res = await fetch(`/api/sequences/${id}/steps/${stepId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast((body as { error?: string }).error || "Failed to delete step.", "error");
        return;
      }
      toast("Step deleted.", "success");
      if (editingStepId === stepId) cancelEditStep();
      await fetchSequence();
    } catch (e) {
      console.warn("sequence-detail: deleteStep failed", e);
      toast("Failed to delete step — network error.", "error");
    }
  }

  // CLE-14: collapse the three inline enroll PUTs (Pause / Resume / Stop) into a
  // single network body shared by the 3 row buttons AND the 3 enroll* actions
  // (AC-NODUP — the /enroll PUT URL appears exactly once now).
  const setEnrollmentStatus = useCallback(
    async (
      enrollmentId: string,
      status: "paused" | "active" | "completed",
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/sequences/${id}/enroll`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrollmentId, status }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` };
        }
        await fetchSequence();
        return { ok: true };
      } catch (e) {
        console.warn("sequence-detail: setEnrollmentStatus failed", e);
        return { ok: false, error: e instanceof Error ? e.message : "network error" };
      }
    },
    [id, fetchSequence],
  );

  // ── CLE-14: register this detail page's actions for the chat live-executor.
  //    Declared UNCONDITIONALLY above the loading/!sequence early returns so the
  //    hook order is stable. run()s reuse the extracted helpers above; live refs
  //    keep the id set stable so registration happens once (CLE-03 §3.1). ──
  const sequenceIdRef = useRef(id); sequenceIdRef.current = id;
  const stepsRef = useRef(steps); stepsRef.current = steps;
  const enrollmentsRef = useRef(enrollments); enrollmentsRef.current = enrollments;
  const setSequenceStatusRef = useRef(setSequenceStatus); setSequenceStatusRef.current = setSequenceStatus;
  const saveStepFieldsRef = useRef(saveStepFields); saveStepFieldsRef.current = saveStepFields;
  const setEnrollmentStatusRef = useRef(setEnrollmentStatus); setEnrollmentStatusRef.current = setEnrollmentStatus;
  const deleteStepRef = useRef(deleteStep); deleteStepRef.current = deleteStep;
  const launchCampaignRef = useRef(launchCampaign); launchCampaignRef.current = launchCampaign;

  const sequenceDetailActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "sequences.pause",
        title: "Pause this sequence",
        description:
          "Pause the open sequence — queued sends stop until it is resumed. Use when the user wants to pause this campaign.",
        params: z.object({ sequenceId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ sequenceId }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          const r = await setSequenceStatusRef.current("paused");
          return r.ok ? okResult("Paused the sequence.") : errResult(r.error ?? "Failed to pause the sequence.");
        },
      }),
      definePageAction({
        id: "sequences.resume",
        title: "Resume this sequence",
        description:
          "Resume the open paused sequence — queued sends will go out again. Use when the user wants to resume this campaign.",
        params: z.object({ sequenceId: z.string().min(1) }),
        mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
        run: async ({ sequenceId }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          const r = await setSequenceStatusRef.current("active");
          return r.ok ? okResult("Resumed the sequence - queued sends will go out.") : errResult(r.error ?? "Failed to resume the sequence.");
        },
      }),
      definePageAction({
        id: "sequences.editStep",
        title: "Edit a sequence step",
        description:
          "Edit one step of the open sequence — set the subject template, body template, and/or the delay (business " +
          "days after the previous step). Use when the user wants to change the wording or timing of a step.",
        params: z.object({
          sequenceId: z.string().min(1),
          stepId: z.string().min(1),
          subjectTemplate: z.string().optional(),
          bodyTemplate: z.string().optional(),
          delayDays: z.number().int().min(0).optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ sequenceId, stepId, subjectTemplate, bodyTemplate, delayDays }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          if (!stepsRef.current.some((s) => s.id === stepId)) return errResult(`Step ${stepId} is not in this sequence.`);
          const r = await saveStepFieldsRef.current(stepId, { subjectTemplate, bodyTemplate, delayDays });
          return r.ok ? okResult("Updated the step.") : errResult(r.error ?? "Failed to update the step.");
        },
      }),
      definePageAction({
        id: "sequences.deleteStep",
        title: "Delete a sequence step",
        description:
          "Delete one step of the open sequence. Queued emails for the step won't be sent; already-sent emails are " +
          "unaffected. This cannot be undone. Use when the user wants to remove a step.",
        params: z.object({ sequenceId: z.string().min(1), stepId: z.string().min(1) }),
        mutating: true, reversible: false, cost: "free", confirm: "always",
        run: async ({ sequenceId, stepId }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          if (!stepsRef.current.some((s) => s.id === stepId)) return errResult(`Step ${stepId} is not in this sequence.`);
          await deleteStepRef.current(stepId);
          return okResult("Deleted the step.");
        },
      }),
      definePageAction({
        id: "sequences.enrollPause",
        title: "Pause an enrollment",
        description:
          "Pause one enrolled contact in the open sequence — that contact's next sends stop. Use when the user wants " +
          "to pause a specific person's enrollment.",
        params: z.object({ sequenceId: z.string().min(1), enrollmentId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ sequenceId, enrollmentId }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          if (!enrollmentsRef.current.some((e) => e.id === enrollmentId)) return errResult(`Enrollment ${enrollmentId} is not in this sequence.`);
          const r = await setEnrollmentStatusRef.current(enrollmentId, "paused");
          return r.ok ? okResult("Paused that enrollment.") : errResult(r.error ?? "Failed to pause the enrollment.");
        },
      }),
      definePageAction({
        id: "sequences.enrollResume",
        title: "Resume an enrollment",
        description:
          "Resume one paused enrolled contact in the open sequence — queued sends for that contact will go out. Use " +
          "when the user wants to resume a specific person's enrollment.",
        params: z.object({ sequenceId: z.string().min(1), enrollmentId: z.string().min(1) }),
        mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
        run: async ({ sequenceId, enrollmentId }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          if (!enrollmentsRef.current.some((e) => e.id === enrollmentId)) return errResult(`Enrollment ${enrollmentId} is not in this sequence.`);
          const r = await setEnrollmentStatusRef.current(enrollmentId, "active");
          return r.ok ? okResult("Resumed that enrollment.") : errResult(r.error ?? "Failed to resume the enrollment.");
        },
      }),
      definePageAction({
        id: "sequences.enrollStop",
        title: "Stop an enrollment",
        description:
          "Stop (complete) one enrolled contact in the open sequence — no further sends for that contact. Use when " +
          "the user wants to stop/finish a specific person's enrollment.",
        params: z.object({ sequenceId: z.string().min(1), enrollmentId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ sequenceId, enrollmentId }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          if (!enrollmentsRef.current.some((e) => e.id === enrollmentId)) return errResult(`Enrollment ${enrollmentId} is not in this sequence.`);
          const r = await setEnrollmentStatusRef.current(enrollmentId, "completed");
          return r.ok ? okResult("Stopped that enrollment.") : errResult(r.error ?? "Failed to stop the enrollment.");
        },
      }),
      definePageAction({
        id: "sequences.launch",
        title: "Launch the prepared campaign",
        description:
          "Launch the open campaign — queued emails begin sending. Use when the campaign is ready and the user wants " +
          "to launch it. This triggers outbound email and cannot be undone.",
        params: z.object({ sequenceId: z.string().min(1) }),
        mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
        run: async ({ sequenceId }): Promise<PageActionResult> => {
          if (sequenceId !== sequenceIdRef.current) return errResult("That sequence is not the one open here.");
          const r = await launchCampaignRef.current();
          return r.ok ? okResult("Campaign launched - queued emails will send.") : errResult(r.error ?? "Failed to launch the campaign.");
        },
      }),
    ],
    // Stable id set; run() reads live values via refs. Register once (CLE-03).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(sequenceDetailActions);

  if (loading) return <SequenceDetailSkeleton />;
  if (!sequence) return <div className="p-6 text-sm" style={{ color: "var(--color-error)" }}>Sequence not found</div>;

  const statusVariant: Record<string, "success" | "warning" | "neutral" | "info"> = {
    active: "success", paused: "warning", draft: "neutral", archived: "neutral",
  };

  const totalDelay = steps.reduce((sum, s) => sum + s.delayDays, 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={sequence.name}
        subtitle={enrollments.length > 0 ? `To ${enrollments[0].contactName}${enrollments[0].contactEmail ? ` (${enrollments[0].contactEmail})` : ""}${enrollments.length > 1 ? ` and ${enrollments.length - 1} more` : ""}` : sequence.description || undefined}
      >
        <Badge variant={statusVariant[sequence.status] || "neutral"} size="md">
          {sequence.status}
        </Badge>
        {canExecute && sequence.status !== "active" && campaignStatus !== "launched" && (
          <Button variant="gradient" size="sm" onClick={() => setShowCampaignWizard(true)}>
            <Zap size={14} /> {steps.length > 0 ? "Continue Campaign" : "Configure Campaign"}
          </Button>
        )}
        {canExecute && (sequence.status === "active" || sequence.status === "paused") && (
          <Button variant="outline" size="sm" onClick={toggleStatus} loading={updatingStatus}>
            {sequence.status === "active" ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
          </Button>
        )}
        {/* Q17 — export to JSON. Anchor (vs button) so the browser
             handles the Content-Disposition download natively without a
             blob-and-revoke dance in JS. */}
        {steps.length > 0 && (
          <a
            href={`/api/sequences/${id}/export`}
            download
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
            style={{
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
            title="Download this sequence as a portable JSON template"
          >
            <Download size={12} /> Export
          </a>
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

      <div role="tablist" aria-label="Sequence sections" className="flex items-center gap-1 border-b px-6 pt-2" style={{ borderColor: "var(--color-border-default)" }}>
        {([
          { id: "steps" as const, label: "Steps", icon: Mail },
          { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
        ]).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
              style={{
                color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8" hidden={tab !== "steps"}>

          {/* ── STEP TIMELINE ── */}
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-tertiary)" }}>
              Sequence ({steps.length} step{steps.length !== 1 ? "s" : ""} · {totalDelay} day{totalDelay !== 1 ? "s" : ""})
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
                  const isEditing = editingStepId === step.id;
                  return (
                    <div key={step.id} className="relative">
                      {/* Step dot on the timeline */}
                      <div className="absolute" style={{ left: -7, top: 18, width: 8, height: 8, borderRadius: "50%", background: isExpanded ? "var(--color-accent)" : "var(--color-border-moderate)", zIndex: 1 }} />
                      {/* Delay indicator */}
                      {i > 0 && (
                        <div className="flex items-center gap-2 py-2 pl-6">
                          <Clock size={11} style={{ color: "var(--color-text-muted)" }} />
                          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            Wait {step.delayDays} business day{step.delayDays !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}

                      {/* Step card */}
                      <div
                        className="rounded-lg p-4 transition-all"
                        style={{
                          background: "var(--color-bg-card)",
                          border: `1px solid ${isExpanded ? "var(--color-accent)" : "var(--color-border-default)"}`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) return;
                            setExpandedStep(isExpanded ? null : i);
                          }}
                          className="flex w-full items-center gap-3 text-left"
                          aria-expanded={isExpanded}
                        >
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
                        </button>

                        {isExpanded && !isEditing && (
                          <div className="mt-3 pl-10">
                            <div className="rounded-md p-3 text-[12px] leading-relaxed whitespace-pre-wrap"
                              style={{ background: "var(--color-bg-page)", color: "var(--color-text-secondary)" }}>
                              {step.bodyTemplate}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <Button variant="outline" size="sm" icon={<Edit2 size={12} />} onClick={() => startEditStep(step)}>
                                Edit step
                              </Button>
                              <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} onClick={() => setConfirmDeleteStepId(step.id)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}

                        {isExpanded && isEditing && stepDraft && (
                          <div className="mt-3 pl-10 space-y-2">
                            <label className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                              Subject
                            </label>
                            <input
                              type="text"
                              value={stepDraft.subjectTemplate}
                              onChange={(e) => setStepDraft({ ...stepDraft, subjectTemplate: e.target.value })}
                              className="w-full rounded-md px-2.5 py-1.5 text-[12px]"
                              style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                            />
                            <label className="block pt-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                              Body
                            </label>
                            <textarea
                              value={stepDraft.bodyTemplate}
                              onChange={(e) => setStepDraft({ ...stepDraft, bodyTemplate: e.target.value })}
                              rows={10}
                              className="w-full rounded-md px-2.5 py-1.5 text-[12px] leading-relaxed"
                              style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                            />
                            {i > 0 && (
                              <div>
                                <label className="block pt-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                                  Delay (business days after previous step)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  value={stepDraft.delayDays}
                                  onChange={(e) => setStepDraft({ ...stepDraft, delayDays: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })}
                                  className="w-24 rounded-md px-2.5 py-1.5 text-[12px]"
                                  style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-2 pt-2">
                              <Button variant="gradient" size="sm" icon={<Check size={12} />} onClick={() => saveStep(step)} loading={savingStep} disabled={savingStep}>
                                Save
                              </Button>
                              <Button variant="outline" size="sm" icon={<X size={12} />} onClick={cancelEditStep} disabled={savingStep}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
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
                        <th className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.slice(0, 20).map((e) => (
                        <tr key={e.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                          <td className="px-4 py-2.5">
                            <Link href={`/contacts/${e.contactId}`} className="hover:underline" style={{ color: "var(--color-accent)" }}>
                              {e.contactName}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>{e.contactEmail || "—"}</td>
                          <td className="px-4 py-2.5" style={{ color: "var(--color-text-secondary)" }}>{e.currentStep}/{steps.length}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={e.status === "active" ? "success" : e.status === "completed" || e.status === "replied" ? "info" : "neutral"} size="sm">
                              {e.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1">
                              {e.status === "active" && (
                                <button
                                  onClick={() => setEnrollmentStatus(e.id, "paused")}
                                  className="rounded px-2 py-0.5 text-[11px] font-medium"
                                  style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
                                >
                                  Pause
                                </button>
                              )}
                              {e.status === "paused" && (
                                <button
                                  onClick={() => setEnrollmentStatus(e.id, "active")}
                                  className="rounded px-2 py-0.5 text-[11px] font-medium"
                                  style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}
                                >
                                  Resume
                                </button>
                              )}
                              {(e.status === "active" || e.status === "paused") && (
                                <button
                                  onClick={() => setEnrollmentStatus(e.id, "completed")}
                                  className="rounded px-2 py-0.5 text-[11px] font-medium"
                                  style={{ background: "var(--color-error-soft)", color: "var(--color-error)" }}
                                >
                                  Stop
                                </button>
                              )}
                            </div>
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

        <div className="mx-auto max-w-3xl" hidden={tab !== "analytics"}>
          <AnalyticsPanel loading={analyticsLoading} data={analytics} />
        </div>
      </div>

      {confirmDeleteStepId && (
        <DestructiveConfirm
          open
          title="Delete this step?"
          description="Queued emails for this step will not be sent. Already-sent emails are not affected. This action cannot be undone."
          confirmLabel="Delete step"
          onConfirm={() => deleteStep(confirmDeleteStepId)}
          onCancel={() => setConfirmDeleteStepId(null)}
        />
      )}
    </div>
  );
}

function AnalyticsPanel({ loading, data }: { loading: boolean; data: Analytics | null }) {
  if (loading && !data) {
    return <div className="py-10 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Loading analytics...</div>;
  }
  if (!data) {
    return <div className="py-10 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>No analytics yet.</div>;
  }
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const funnel = [
    { label: "Enrolled", value: data.enrollment.total || 0 },
    { label: "Sent", value: (data.emails.sent || 0) + (data.emails.delivered || 0) + (data.emails.bounced || 0) },
    { label: "Opened", value: data.emails.totalOpened || 0 },
    { label: "Clicked", value: data.emails.totalClicked || 0 },
    { label: "Replied", value: data.enrollment.replied || 0 },
  ];
  const max = Math.max(...funnel.map((f) => f.value), 1);
  const perStep = data.perStep || [];
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
          Funnel
        </h2>
        <Card>
          <CardBody>
            <div className="space-y-2">
              {funnel.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <div className="w-20 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{f.label}</div>
                  <div className="flex h-5 flex-1 items-center rounded" style={{ background: "var(--color-bg-page)" }}>
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${(f.value / max) * 100}%`,
                        background: "var(--color-accent)",
                        minWidth: f.value > 0 ? 4 : 0,
                      }}
                    />
                  </div>
                  <div className="w-14 text-right text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
          Rates
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Open rate", value: pct(data.rates.openRate) },
            { label: "Click rate", value: pct(data.rates.clickRate) },
            { label: "Reply rate", value: pct(data.rates.replyRate) },
            { label: "Bounce rate", value: pct(data.rates.bounceRate) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
              <p className="text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{s.value}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PER-STEP BREAKDOWN ── */}
      {perStep.length > 0 && (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Per-step performance
          </h2>
          <Card>
            <CardBody className="p-0">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                    <th className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text-tertiary)" }}>Step</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Sent</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Opened</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Clicked</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Replied</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Bounced</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Open %</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Click %</th>
                    <th className="px-4 py-2.5 font-medium text-right" style={{ color: "var(--color-text-tertiary)" }}>Reply %</th>
                  </tr>
                </thead>
                <tbody>
                  {perStep.map((s) => (
                    <tr key={s.stepNumber} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                      <td className="px-4 py-2.5" style={{ color: "var(--color-text-primary)" }}>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                            style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                          >
                            {s.stepNumber}
                          </div>
                          Step {s.stepNumber}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium" style={{ color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>{s.sent}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{s.opened}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{s.clicked}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{s.replied}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: s.bounced > 0 ? "var(--color-error)" : "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{s.bounced}</td>
                      <td className="px-4 py-2.5 text-right font-medium" style={{ color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                        {pct(s.openRate)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium" style={{ color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                        {pct(s.clickRate)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium" style={{ color: s.replyRate > 0 ? "var(--color-success)" : "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                        {pct(s.replyRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Visual step-by-step drop-off bars */}
          {perStep.length > 1 && (
            <div className="mt-4">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                Drop-off between steps
              </h3>
              <div className="flex items-end gap-2" style={{ height: 80 }}>
                {(() => {
                  const maxSent = Math.max(...perStep.map((s) => s.sent), 1);
                  return perStep.map((s) => {
                    const heightPct = (s.sent / maxSent) * 100;
                    return (
                      <div key={s.stepNumber} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                          {s.sent}
                        </span>
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${Math.max(heightPct, 4)}%`,
                            background: "var(--color-accent)",
                            opacity: 0.6 + (s.openRate * 0.4),
                          }}
                        />
                        <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                          S{s.stepNumber}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
          Enrollment breakdown
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Active", value: data.enrollment.active || 0 },
            { label: "Paused", value: data.enrollment.paused || 0 },
            { label: "Completed", value: data.enrollment.completed || 0 },
            { label: "Replied", value: data.enrollment.replied || 0 },
          ].map((s) => (
            <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
              <p className="text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{s.value}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
